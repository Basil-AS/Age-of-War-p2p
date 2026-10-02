import { describe, expect, it } from 'vitest';
import { type CheckResult, type Env, formatReport, judge, runNetCheck } from '../src/net/netcheck';

/** fake RTCPeerConnection: reports candidate types per ICE server url */
const fakeRtc = (answers: Record<string, string[] | 'hang'>) =>
  class {
    private cfg: { iceServers: { urls: string | string[] }[] };
    onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
    constructor(cfg: { iceServers: { urls: string | string[] }[] }) {
      this.cfg = cfg;
    }
    createDataChannel() {}
    async createOffer() {
      return {};
    }
    async setLocalDescription() {
      const u = this.cfg.iceServers[0]?.urls;
      const key = Array.isArray(u) ? (u[0] as string) : (u as string);
      const a = answers[key];
      if (a === 'hang') return;
      setTimeout(() => {
        for (const t of a ?? [])
          this.onicecandidate?.({ candidate: { candidate: `candidate:1 1 udp 1 1.2.3.4 5 typ ${t}` } });
        this.onicecandidate?.({ candidate: null });
      }, 5);
    }
    close() {}
  };

const fakeWs = (up: string[]) =>
  class {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(url: string) {
      setTimeout(() => (up.includes(url) ? this.onopen?.() : this.onerror?.()), 5);
    }
    close() {}
  };

const env = (rtc: unknown, ws: unknown): Env => ({
  RTCPeerConnection: rtc as never,
  WebSocket: ws as never,
  now: () => performance.now(),
});

describe('network check', () => {
  it('reports which STUN/TURN/relay endpoints are reachable from this network', async () => {
    const r = await runNetCheck({
      timeoutMs: 200,
      stun: ['stun:a:1', 'stun:b:1', 'stun:c:1'],
      turn: [{ urls: ['turn:t:1'], username: 'u', credential: 'p' }],
      nostr: ['wss://n1', 'wss://n2'],
      mqtt: ['wss://m1'],
      env: env(
        fakeRtc({ 'stun:a:1': ['host', 'srflx'], 'stun:b:1': ['host'], 'stun:c:1': 'hang', 'turn:t:1': ['relay'] }),
        fakeWs(['wss://n1', 'wss://m1']),
      ),
    });
    const by = (k: string, t: string) => r.find((x) => x.kind === k && x.target === t) as CheckResult;
    expect(by('stun', 'stun:a:1').ok).toBe(true);
    expect(by('stun', 'stun:b:1').ok).toBe(false); // only host candidates: this STUN is unreachable
    expect(by('stun', 'stun:b:1').detail).toContain('host');
    expect(by('stun', 'stun:c:1').detail).toBe('timeout');
    expect(by('turn', 'turn:t:1').ok).toBe(true);
    expect(by('nostr', 'wss://n1').ok).toBe(true);
    expect(by('nostr', 'wss://n2').ok).toBe(false);
    expect(by('mqtt', 'wss://m1').ok).toBe(true);
  });

  it('judges: signalling + STUN → direct P2P is good; signalling only → maybe; nothing → unlikely', () => {
    const mk = (kind: CheckResult['kind'], ok: boolean): CheckResult => ({ kind, target: kind, ok, ms: 1 });
    expect(judge([mk('nostr', true), mk('stun', true)]).directP2P).toBe('good');
    expect(judge([mk('nostr', true), mk('stun', false), mk('turn', true)]).directP2P).toBe('maybe');
    expect(judge([mk('nostr', false), mk('mqtt', false), mk('stun', true)]).directP2P).toBe('unlikely');
  });

  it('handles a browser with no WebRTC / WebSocket', async () => {
    const r = await runNetCheck({
      timeoutMs: 50,
      stun: ['stun:a:1'],
      turn: [],
      nostr: ['wss://n'],
      mqtt: [],
      env: { now: () => 0 },
    });
    expect(r.every((x) => !x.ok)).toBe(true);
    expect(formatReport(r)).toContain('verdict');
  });
});
