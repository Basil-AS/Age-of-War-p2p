import { createLocalTransport } from './local';
import { createMqttPipe } from './mqttpipe';
import { MultiTransport } from './multi';
import { createNostrPipe } from './nostrpipe';
import { createReliableTransport } from './reliable';
import { guestHandshake, type Handshake, hostHandshake } from './session';
import type { Transport } from './transport';
import { createTrysteroTransport, PUBLIC_TURN, type TurnServer } from './trystero';
import { createWsPipe } from './wspipe';

export type RungId =
  | 'nostr'
  | 'torrent'
  | 'mqtt'
  | 'turn'
  | 'relay-nostr'
  | 'relay-mqtt'
  | 'relay-ws'
  | 'lan'
  | 'local';
export type RungStatus = 'waiting' | 'trying' | 'slow' | 'connected' | 'failed' | 'closed';
export interface RungState {
  id: RungId;
  status: RungStatus;
  detail?: string;
}

interface RungDef {
  id: RungId;
  /** guest start delay in seconds — best routes first, heavier fallbacks later (the host listens on everything from t=0) */
  startAt: number;
  needsWebRtc: boolean;
  make(c: Ctx): Promise<Transport>;
}
interface Ctx {
  code: string;
  params: URLSearchParams;
}

const list = (s: string | null) =>
  s
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;

function turnServers(params: URLSearchParams): TurnServer[] {
  const custom = params.get('turn');
  if (custom) {
    const [urls, username, credential] = custom.split('|');
    return [{ urls: (urls as string).split(','), username: username ?? '', credential: credential ?? '' }];
  }
  return PUBLIC_TURN;
}

const WS_RELAY = (import.meta.env?.VITE_WS_RELAY as string | undefined) ?? '';

/**
 * The connection ladder — ordered from "best" (direct P2P, lowest latency) to "most likely to
 * punch through censorship / strict networks":
 *   1. WebRTC, signalling over Nostr          (direct P2P)
 *   2. WebRTC, signalling over BitTorrent     (direct P2P, different infrastructure)
 *   3. WebRTC, signalling over MQTT           (direct P2P, different infrastructure)
 *   4. WebRTC forced through a TURN relay     (works behind strict NAT / blocked UDP)
 *   5. Game frames over Nostr relays (wss)    (no WebRTC at all)
 *   6. Game frames over MQTT brokers (wss)    (no WebRTC at all)
 *   7. Your own WebSocket relay               (optional, `?ws=` / VITE_WS_RELAY)
 * …plus a manual copy-paste mode (no servers) offered separately in the lobby.
 */
export const RUNGS: RungDef[] = [
  {
    id: 'nostr',
    startAt: 0,
    needsWebRtc: true,
    make: (c) => createTrysteroTransport(c.code, { relay: 'nostr', relayUrls: list(c.params.get('relayUrl')) }),
  },
  { id: 'torrent', startAt: 6, needsWebRtc: true, make: (c) => createTrysteroTransport(c.code, { relay: 'torrent' }) },
  { id: 'mqtt', startAt: 6, needsWebRtc: true, make: (c) => createTrysteroTransport(c.code, { relay: 'mqtt' }) },
  {
    id: 'turn',
    startAt: 14,
    needsWebRtc: true,
    make: (c) =>
      createTrysteroTransport(c.code, {
        relay: 'nostr',
        relayUrls: list(c.params.get('relayUrl')),
        turn: turnServers(c.params),
        suffix: '~turn',
      }),
  },
  {
    id: 'relay-nostr',
    startAt: 22,
    needsWebRtc: false,
    make: async (c) => createReliableTransport(createNostrPipe(c.code, list(c.params.get('relayUrl'))), c.code),
  },
  {
    id: 'relay-mqtt',
    startAt: 22,
    needsWebRtc: false,
    make: async (c) => createReliableTransport(createMqttPipe(c.code, list(c.params.get('mqttUrl'))), c.code),
  },
  {
    id: 'relay-ws',
    startAt: 12,
    needsWebRtc: false,
    make: async (c) =>
      createReliableTransport(createWsPipe(c.code, c.params.get('ws') || WS_RELAY), c.code, { flushMs: 60 }),
  },
  {
    // the page itself is served by `server/lan.mjs` on the local network → same-LAN relay, ~1 ms
    id: 'lan',
    startAt: 0,
    needsWebRtc: false,
    make: async (c) =>
      createReliableTransport(
        createWsPipe(c.code, `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`),
        c.code,
        {
          flushMs: 16,
        },
      ),
  },
  { id: 'local', startAt: 0, needsWebRtc: false, make: async (c) => createLocalTransport(c.code) },
];

export interface Ladder {
  rungs: RungState[];
  result: Promise<{ transport: MultiTransport; rung: RungId; hs: Handshake }>;
  cancel(): void;
}

/** true when the game was opened from a private/LAN address (i.e. served by server/lan.mjs) */
export function isLanServed(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(h) || h === 'localhost' || h.endsWith('.local');
}

export function enabledRungs(params: URLSearchParams): RungDef[] {
  if (params.get('net') === 'local') return RUNGS.filter((r) => r.id === 'local');
  const only = list(params.get('rungs'));
  return RUNGS.filter((r) => {
    if (r.id === 'local') return false;
    if (r.id === 'lan') return isLanServed() || only?.includes('lan') === true;
    if (r.id === 'relay-ws' && !(params.get('ws') || WS_RELAY)) return false;
    return only ? only.includes(r.id) : true;
  });
}

/**
 * Runs the whole ladder. The host listens on every rung from the start; the guest walks down the
 * ladder, keeping earlier rungs alive. Whichever rung produces a live peer first wins — the host
 * decides (it sends `init` on exactly one rung) and everything else is torn down.
 */
export function connectLadder(
  code: string,
  role: 'host' | 'guest',
  name: string,
  params: URLSearchParams,
  onUpdate: () => void,
): Ladder {
  const defs = enabledRungs(params);
  const rungs: RungState[] = defs.map((d) => ({ id: d.id, status: 'waiting' }));
  const live = new Map<RungId, Transport>();
  const multi = new MultiTransport();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let chosen: RungId | null = null;
  let handshaking: RungId | null = null;
  let cancelled = false;
  const hasRtc = typeof RTCPeerConnection !== 'undefined';
  const set = (id: RungId, status: RungStatus, detail?: string) => {
    const r = rungs.find((x) => x.id === id);
    if (r) {
      r.status = status;
      r.detail = detail;
      onUpdate();
    }
  };

  const result = new Promise<{ transport: MultiTransport; rung: RungId; hs: Handshake }>((resolve, reject) => {
    const finish = (id: RungId, transport: Transport, hs: Handshake) => {
      if (chosen && chosen !== id) return;
      chosen = id;
      // every other route that is already up stays in the pool as a hot standby / upgrade candidate
      for (const [rid, t] of live) {
        if (rid !== id && t.connected) multi.add(rid, t);
        if (rid !== id) set(rid, t.connected ? 'connected' : 'trying', 'standby');
      }
      multi.add(id, transport);
      set(id, 'connected');
      resolve({ transport: multi, rung: id, hs });
    };

    const start = async (d: RungDef) => {
      if (cancelled) return;
      if (d.needsWebRtc && !hasRtc) return set(d.id, 'failed', 'WebRTC unavailable');
      set(d.id, 'trying');
      const slow = setTimeout(() => rungs.find((r) => r.id === d.id)?.status === 'trying' && set(d.id, 'slow'), 25000);
      timers.push(slow);
      try {
        const t = await d.make({ code, params });
        if (cancelled) {
          t.close();
          return;
        }
        live.set(d.id, t);
        const onJoined = () => {
          if (cancelled) return;
          if (chosen) {
            // a later route came up after the match started: join the pool
            if (chosen !== d.id) {
              multi.add(d.id, t);
              set(d.id, 'connected', 'standby');
            }
            return;
          }
          if (role === 'host') {
            if (handshaking) return;
            handshaking = d.id; // host decides: first rung with a live peer starts the game at once
            void hostHandshake(t, name).then((hs) => finish(d.id, t, hs));
          } else {
            void guestHandshake(t, name).then((hs) => finish(d.id, t, hs));
          }
        };
        t.onLeave = () => {
          if (handshaking === d.id && !chosen) handshaking = null;
        };
        if (t.connected) onJoined();
        else t.onJoin = onJoined;
      } catch (e) {
        set(d.id, 'failed', e instanceof Error ? e.message : String(e));
        if (rungs.every((r) => r.status === 'failed')) reject(new Error('all connection routes failed'));
      }
    };

    const first = Math.min(...defs.map((d) => d.startAt));
    defs.forEach((d, i) => {
      // host: everything listens right away (small stagger); guest: walk the ladder
      const delay = role === 'host' ? i * 150 : (d.startAt - first) * 1000;
      timers.push(setTimeout(() => void start(d), delay));
    });
  });

  return {
    rungs,
    result,
    cancel() {
      cancelled = true;
      for (const x of timers) clearTimeout(x);
      for (const t of live.values()) {
        try {
          t.close();
        } catch {
          /* ignore */
        }
      }
      live.clear();
      multi.close();
    },
  };
}
