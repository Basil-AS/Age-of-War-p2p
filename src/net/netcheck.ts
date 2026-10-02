import { DEFAULT_MQTT_BROKERS } from './mqttpipe';
import { DEFAULT_NOSTR_RELAYS } from './nostrpipe';
import { PUBLIC_TURN, STUN, type TurnServer } from './trystero';

export interface CheckResult {
  kind: 'stun' | 'turn' | 'nostr' | 'mqtt' | 'webrtc';
  target: string;
  ok: boolean;
  /** time to the first useful answer, ms */
  ms: number;
  detail?: string;
}

/** browser primitives, injectable so the logic is unit-testable */
export interface Env {
  RTCPeerConnection?: typeof RTCPeerConnection;
  WebSocket?: typeof WebSocket;
  now(): number;
}
const real = (): Env => ({
  RTCPeerConnection: typeof RTCPeerConnection === 'undefined' ? undefined : RTCPeerConnection,
  WebSocket: typeof WebSocket === 'undefined' ? undefined : WebSocket,
  now: () => performance.now(),
});

/** gathers ICE candidates against one server and reports when a candidate of `want` type shows up */
function gather(
  env: Env,
  iceServers: RTCIceServer[],
  want: 'srflx' | 'relay',
  timeoutMs: number,
  policy?: RTCIceTransportPolicy,
) {
  return new Promise<{ ok: boolean; ms: number; detail?: string }>((resolve) => {
    const RTC = env.RTCPeerConnection;
    if (!RTC) return resolve({ ok: false, ms: 0, detail: 'WebRTC unavailable' });
    const t0 = env.now();
    let done = false;
    const seen = new Set<string>();
    let pc: RTCPeerConnection | null = null;
    const finish = (ok: boolean, detail?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        pc?.close();
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Math.round(env.now() - t0), detail });
    };
    const timer = setTimeout(() => finish(false, seen.size ? `only ${[...seen].join('/')}` : 'timeout'), timeoutMs);
    try {
      pc = new RTC({ iceServers, ...(policy ? { iceTransportPolicy: policy } : {}) });
      pc.onicecandidate = (e) => {
        if (!e.candidate) return finish(false, seen.size ? `only ${[...seen].join('/')}` : 'no candidates');
        const m = / typ (\w+)/.exec(e.candidate.candidate);
        if (m) seen.add(m[1] as string);
        if (m?.[1] === want) finish(true, want);
      };
      pc.createDataChannel('x');
      void pc
        .createOffer()
        .then((o) => pc?.setLocalDescription(o))
        .catch((e) => finish(false, String(e)));
    } catch (e) {
      finish(false, String(e));
    }
  });
}

export function wsPing(env: Env, url: string, timeoutMs: number) {
  return new Promise<{ ok: boolean; ms: number; detail?: string }>((resolve) => {
    const WS = env.WebSocket;
    if (!WS) return resolve({ ok: false, ms: 0, detail: 'WebSocket unavailable' });
    const t0 = env.now();
    let done = false;
    let ws: WebSocket | null = null;
    const finish = (ok: boolean, detail?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Math.round(env.now() - t0), detail });
    };
    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
    try {
      ws = new WS(url);
      ws.onopen = () => finish(true);
      ws.onerror = () => finish(false, 'error');
      ws.onclose = () => finish(false, 'closed');
    } catch (e) {
      finish(false, String(e));
    }
  });
}

export interface NetCheckOptions {
  timeoutMs?: number;
  stun?: string[];
  turn?: TurnServer[];
  nostr?: string[];
  mqtt?: string[];
  env?: Env;
  onResult?: (r: CheckResult) => void;
}

/**
 * Probes, from THIS browser/network, everything the connection ladder depends on: every STUN server,
 * the TURN relays, Nostr relays and MQTT brokers. Runs in parallel, each probe is time-boxed.
 */
export async function runNetCheck(o: NetCheckOptions = {}): Promise<CheckResult[]> {
  const env = o.env ?? real();
  const timeout = o.timeoutMs ?? 5000;
  const out: CheckResult[] = [];
  const push = (r: CheckResult) => {
    out.push(r);
    o.onResult?.(r);
  };
  const jobs: Promise<void>[] = [];
  for (const url of o.stun ?? STUN)
    jobs.push(gather(env, [{ urls: url }], 'srflx', timeout).then((r) => push({ kind: 'stun', target: url, ...r })));
  for (const t of o.turn ?? PUBLIC_TURN) {
    const first = (Array.isArray(t.urls) ? t.urls : [t.urls])[0] as string;
    jobs.push(
      gather(env, [{ urls: t.urls, username: t.username, credential: t.credential }], 'relay', timeout, 'relay').then(
        (r) => push({ kind: 'turn', target: first, ...r }),
      ),
    );
  }
  for (const url of o.nostr ?? DEFAULT_NOSTR_RELAYS)
    jobs.push(wsPing(env, url, timeout).then((r) => push({ kind: 'nostr', target: url, ...r })));
  for (const url of o.mqtt ?? DEFAULT_MQTT_BROKERS)
    jobs.push(wsPing(env, url, timeout).then((r) => push({ kind: 'mqtt', target: url, ...r })));
  await Promise.all(jobs);
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.ms - b.ms);
}

export interface Verdict {
  directP2P: 'good' | 'maybe' | 'unlikely';
  summary: string[];
}

/** plain-language reading of the results */
export function judge(results: CheckResult[]): Verdict {
  const n = (k: CheckResult['kind']) => results.filter((r) => r.kind === k);
  const okc = (k: CheckResult['kind']) => n(k).filter((r) => r.ok).length;
  const stun = okc('stun');
  const sig = okc('nostr') + okc('mqtt');
  const turn = okc('turn');
  const summary = [
    `STUN ${stun}/${n('stun').length}`,
    `TURN ${turn}/${n('turn').length}`,
    `Nostr ${okc('nostr')}/${n('nostr').length}`,
    `MQTT ${okc('mqtt')}/${n('mqtt').length}`,
  ];
  const directP2P = sig > 0 && stun > 0 ? 'good' : sig > 0 && turn > 0 ? 'maybe' : sig > 0 ? 'maybe' : 'unlikely';
  return { directP2P, summary };
}

export const formatReport = (results: CheckResult[], extra: Record<string, unknown> = {}) =>
  JSON.stringify(
    {
      at: new Date().toISOString(),
      ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      verdict: judge(results),
      results,
      ...extra,
    },
    null,
    1,
  );
