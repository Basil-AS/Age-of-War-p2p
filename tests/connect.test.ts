import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLadder, enabledRungs, isLanServed, RUNGS } from '../src/net/connect';
import { createLoopbackPair } from '../src/net/loopback';
import type { Transport } from '../src/net/transport';

type Pair = ReturnType<typeof createLoopbackPair>;
const clock = { now: () => performance.now() };
const originals = RUNGS.map((r) => ({ id: r.id, make: r.make, startAt: r.startAt }));

/** replace rungs by in-memory fakes with chosen latency / failure / join delay */
function fake(spec: Record<string, { ms?: number; fail?: boolean; joinAfter?: number }>) {
  const pairs = new Map<string, Pair>();
  const pumps: Pair[] = [];
  for (const r of RUNGS) {
    const s = spec[r.id];
    if (!s) continue;
    r.startAt = 0;
    r.make = async (c) => {
      if (s.fail) throw new Error(`${r.id} down`);
      const key = `${c.code}/${r.id}`;
      let p = pairs.get(key);
      const first = !p;
      if (!p) {
        p = createLoopbackPair({ latencyMs: s.ms ?? 5, clock });
        pairs.set(key, p);
        pumps.push(p);
      }
      const t = (first ? p[0] : p[1]) as Transport;
      if (s.joinAfter) {
        // the peer "appears" only later (slow signalling)
        t.connected = false;
        setTimeout(() => {
          t.connected = true;
          t.onJoin?.();
        }, s.joinAfter);
      }
      return t;
    };
  }
  const timer = setInterval(() => {
    for (const p of pumps) {
      p[0].pump();
      p[1].pump();
    }
  }, 1);
  return () => clearInterval(timer);
}

const P = (rungs: string) => new URLSearchParams({ rungs });

describe('connection ladder', () => {
  beforeEach(() => {
    vi.stubGlobal('RTCPeerConnection', class {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const o of originals) {
      const r = RUNGS.find((x) => x.id === o.id);
      if (r) {
        r.make = o.make;
        r.startAt = o.startAt;
      }
    }
  });

  it('enabledRungs honours ?rungs= and never lists the test-only rung', () => {
    expect(enabledRungs(P('nostr,mqtt')).map((r) => r.id)).toEqual(['nostr', 'mqtt']);
    expect(enabledRungs(new URLSearchParams()).map((r) => r.id)).not.toContain('local');
    expect(enabledRungs(new URLSearchParams('net=local')).map((r) => r.id)).toEqual(['local']);
  });
  it('isLanServed recognises private addresses', () => {
    const at = (host: string) => {
      vi.stubGlobal('location', { hostname: host });
      return isLanServed();
    };
    expect([at('192.168.1.20'), at('10.0.0.5'), at('172.20.1.1'), at('localhost'), at('foo.local')]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([at('basil-as.github.io'), at('172.32.0.1'), at('8.8.8.8')]).toEqual([false, false, false]);
    vi.unstubAllGlobals();
  });

  it('connects over the first working route and exposes a multipath transport', async () => {
    const stop = fake({ nostr: { ms: 5 } });
    const host = connectLadder('AAAAA', 'host', 'H', P('nostr'), () => {});
    const guest = connectLadder('AAAAA', 'guest', 'G', P('nostr'), () => {});
    const [h, g] = await Promise.all([host.result, guest.result]);
    expect(h.rung).toBe('nostr');
    expect(h.hs.side).toBe(0);
    expect(g.hs.side).toBe(1);
    const got: unknown[] = [];
    g.transport.onMessage = (m) => got.push(m);
    h.transport.send({ k: 'turn', n: 1, cmds: [] });
    await vi.waitFor(() => expect(got.length).toBe(1), { timeout: 2000 });
    host.cancel();
    guest.cancel();
    stop();
  });

  it('a failing rung does not stop the others', async () => {
    const stop = fake({ nostr: { fail: true }, torrent: { fail: true }, mqtt: { ms: 5 } });
    const host = connectLadder('BBBBB', 'host', 'H', P('nostr,torrent,mqtt'), () => {});
    const guest = connectLadder('BBBBB', 'guest', 'G', P('nostr,torrent,mqtt'), () => {});
    const [h] = await Promise.all([host.result, guest.result]);
    expect(h.rung).toBe('mqtt');
    expect(host.rungs.find((r) => r.id === 'nostr')?.status).toBe('failed');
    host.cancel();
    guest.cancel();
    stop();
  });

  it('rejects when every route fails', async () => {
    const stop = fake({ nostr: { fail: true }, torrent: { fail: true } });
    const host = connectLadder('CCCCC', 'host', 'H', P('nostr,torrent'), () => {});
    await expect(host.result).rejects.toThrow(/all connection routes failed/);
    host.cancel();
    stop();
  });

  it('a faster route that joins after the game started becomes the preferred one', async () => {
    const rungs = ['relay-ws', 'nostr'];
    const stop2 = fake({ 'relay-ws': { ms: 90 }, nostr: { ms: 4, joinAfter: 600 } });
    const q = new URLSearchParams({ rungs: rungs.join(','), ws: 'ws://unused' });
    const host = connectLadder('DDDDD', 'host', 'H', q, () => {});
    const guest = connectLadder('DDDDD', 'guest', 'G', q, () => {});
    const [h, g] = await Promise.all([host.result, guest.result]);
    expect(h.rung).toBe('relay-ws'); // available first
    await vi.waitFor(() => expect(h.transport.info().find((r) => r.id === 'nostr')?.alive ?? false).toBe(true), {
      timeout: 5000,
    });
    await vi.waitFor(() => expect(h.transport.best).toBe('nostr'), { timeout: 8000 });
    expect(g.transport.info().length).toBe(2);
    host.cancel();
    guest.cancel();
    stop2();
  }, 20000);

  it('cancel() closes every route', async () => {
    const stop = fake({ nostr: { ms: 5 } });
    const closed: string[] = [];
    const r = RUNGS.find((x) => x.id === 'nostr') as (typeof RUNGS)[number];
    const prev = r.make;
    r.make = async (c) => {
      const t = await prev(c);
      const close = t.close.bind(t);
      t.close = () => {
        closed.push('x');
        close();
      };
      return t;
    };
    const host = connectLadder('EEEEE', 'host', 'H', P('nostr'), () => {});
    const guest = connectLadder('EEEEE', 'guest', 'G', P('nostr'), () => {});
    await Promise.all([host.result, guest.result]);
    host.cancel();
    guest.cancel();
    expect(closed.length).toBeGreaterThanOrEqual(2);
    stop();
  });
});
