import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoopbackPair } from '../src/net/loopback';
import { MultiTransport } from '../src/net/multi';
import type { Msg } from '../src/net/transport';

const clock = { now: () => performance.now() };

function rig(routes: Record<string, number>) {
  const a = new MultiTransport();
  const b = new MultiTransport();
  const pairs: Record<string, ReturnType<typeof createLoopbackPair>> = {};
  const add = (id: string, ms: number) => {
    const p = createLoopbackPair({ latencyMs: ms, clock });
    pairs[id] = p;
    a.add(id, p[0]);
    b.add(id, p[1]);
  };
  for (const [id, ms] of Object.entries(routes)) add(id, ms);
  const got: Msg[] = [];
  b.onMessage = (m) => got.push(m);
  const step = (ms: number) => {
    for (let t = 0; t < ms; t += 5) {
      vi.advanceTimersByTime(5);
      for (const p of Object.values(pairs)) {
        p[0].pump();
        p[1].pump();
      }
    }
  };
  return { a, b, pairs, got, step, add };
}

describe('MultiTransport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers every message exactly once even though it is sent on two routes', () => {
    const r = rig({ slow: 90, fast: 12 });
    r.step(2500);
    for (let n = 0; n < 20; n++) r.a.send({ k: 'turn', n, cmds: [] });
    r.step(500);
    const turns = r.got.filter((m) => m.k === 'turn').map((m) => (m as { n: number }).n);
    expect(turns).toEqual([...new Set(turns)]);
    expect(turns.length).toBe(20);
  });

  it('measures RTT per route and prefers the fastest', () => {
    const r = rig({ slow: 90, fast: 12, mid: 40 });
    r.step(4000);
    expect(r.a.best).toBe('fast');
    const info = r.a.info();
    expect(info.find((i) => i.id === 'fast')?.rtt).toBeLessThan(info.find((i) => i.id === 'slow')?.rtt ?? 0);
    expect(info.filter((i) => i.active).length).toBe(2);
  });

  it('survives the best route dying and migrates to the next', () => {
    const r = rig({ slow: 90, fast: 12 });
    r.step(3000);
    r.pairs.fast?.[0] && ((r.pairs.fast[0] as { connected: boolean }).connected = false);
    r.step(5000); // fast stops answering → marked dead
    expect(r.a.best).toBe('slow');
    r.a.send({ k: 'turn', n: 999, cmds: [] });
    r.step(500);
    expect(r.got.some((m) => m.k === 'turn' && (m as { n: number }).n === 999)).toBe(true);
  });

  it('a route that connects later joins the pool and takes over when faster', () => {
    const r = rig({ relay: 120 });
    r.step(3000);
    expect(r.a.best).toBe('relay');
    r.add('direct', 8);
    r.step(3000);
    expect(r.a.best).toBe('direct');
  });
});
