import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lockstep } from '../src/net/lockstep';
import { createLoopbackPair } from '../src/net/loopback';
import { SoloMatch } from '../src/net/match';
import { FPS } from '../src/orig/sim';
import { data, mk } from './helpers';

describe('weak devices keep real-time game speed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('solo: one render frame every 400 ms still simulates ~40 ticks per second', () => {
    const m = new SoloMatch(data, 1, { ai: true, diff: 1 });
    m.sim.emit = false;
    const t0 = performance.now();
    for (let i = 0; i < 25; i++) {
      vi.advanceTimersByTime(400);
      m.update(performance.now());
    }
    const seconds = (performance.now() - t0) / 1000;
    expect(m.sim.frame / seconds).toBeGreaterThan(FPS * 0.9);
    expect(m.sim.frame / seconds).toBeLessThan(FPS * 1.1);
  });

  it('online: two weak devices (render every 300 ms) stay in sync and near real time', () => {
    const clock = { now: () => performance.now() };
    const [ta, tb] = createLoopbackPair({ latencyMs: 40, clock });
    const a = new Lockstep(mk(7), 1, ta, 4);
    const b = new Lockstep(mk(7), 2, tb, 4);
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) {
      for (let k = 0; k < 10; k++) {
        vi.advanceTimersByTime(30);
        ta.pump();
        tb.pump();
      }
      a.update(performance.now());
      b.update(performance.now());
    }
    const seconds = (performance.now() - t0) / 1000;
    expect(a.status.desync || b.status.desync).toBe(false);
    expect(a.sim.frame / seconds).toBeGreaterThan(FPS * 0.7);
    expect(Math.abs(a.sim.frame - b.sim.frame)).toBeLessThan(FPS);
  });
});
