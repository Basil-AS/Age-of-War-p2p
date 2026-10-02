import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lockstep } from '../src/net/lockstep';
import { createLoopbackPair } from '../src/net/loopback';
import { FPS } from '../src/orig/sim';
import type { Cmd } from '../src/orig/types';
import { lcg, mk, randomCmd } from './helpers';

// Multi-perspective stress: very different link qualities (LAN … a bad intercontinental mobile link),
// both players hammering commands, 3 simulated minutes each — the two simulations must never diverge.
const links = [
  { name: 'LAN', ms: 2, jitter: 1 },
  { name: 'good', ms: 30, jitter: 10 },
  { name: 'RU→EU typical', ms: 60, jitter: 30 },
  { name: 'bad mobile', ms: 150, jitter: 120 },
  { name: 'awful', ms: 350, jitter: 250 },
];

describe('lockstep under link stress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  for (const link of links)
    for (const seed of [1, 2, 3]) {
      it(`${link.name} (${link.ms}±${link.jitter} ms) seed ${seed}: no desync, equal state, makes progress`, () => {
        const clock = { now: () => performance.now() };
        const [ta, tb] = createLoopbackPair({ latencyMs: link.ms, jitterMs: link.jitter, clock });
        const delay = Math.min(8, Math.max(2, Math.ceil((link.ms * 2 + link.jitter) / 2 / 100) + 1));
        const a = new Lockstep(mk(seed), 1, ta, delay);
        const b = new Lockstep(mk(seed), 2, tb, delay);
        const ra = lcg(seed * 31);
        const rb = lcg(seed * 57);
        const seconds = 180;
        let elapsed = 0;
        for (let t = 0; t < seconds * 1000; t += 8) {
          elapsed = t;
          vi.advanceTimersByTime(8);
          ta.pump();
          tb.pump();
          if (t % 700 === 0) {
            const ca = randomCmd(a.sim, 1, ra);
            const cb = randomCmd(b.sim, 2, rb);
            if (ca) a.command(ca as Cmd);
            if (cb) b.command(cb as Cmd);
          }
          a.update(performance.now());
          b.update(performance.now());
          if (a.sim.winner && b.sim.winner) break;
        }
        expect(a.status.desync || b.status.desync).toBe(false);
        if (!a.sim.winner) {
          // both ended on a common frame boundary except for in-flight turns
          expect(Math.abs(a.sim.frame - b.sim.frame)).toBeLessThan(FPS * 2);
        }
        // playable: even the awful link reaches at least a third of real time
        expect(Math.max(a.sim.frame, b.sim.frame)).toBeGreaterThan(
          (elapsed / 1000) * FPS * (link.ms > 200 ? 0.3 : 0.8),
        );
      });
    }
});

describe('GPU texture memory budget (proxy for phones / low-end laptops)', () => {
  type M = { atlases: { bucket: string; w: number; h: number }[] };
  const mb = (q: 'hd' | 'sd', buckets: string[]) => {
    const m = JSON.parse(readFileSync(`public/orig/${q}/manifest.json`, 'utf8')) as M;
    return m.atlases.filter((a) => buckets.includes(a.bucket)).reduce((s, a) => s + a.w * a.h * 4, 0) / 1048576;
  };
  it('sd (phones): title screen ≤ 130 MB, mid-game with two eras resident ≤ 300 MB', () => {
    expect(mb('sd', ['core', 'ui', 'e1'])).toBeLessThan(130);
    expect(mb('sd', ['core', 'ui', 'e1', 'e2'])).toBeLessThan(300);
    expect(mb('sd', ['core', 'ui', 'e4', 'e5'])).toBeLessThan(300);
  });
  it('hd (desktop): title ≤ 330 MB, mid-game ≤ 700 MB', () => {
    expect(mb('hd', ['core', 'ui', 'e1'])).toBeLessThan(330);
    expect(mb('hd', ['core', 'ui', 'e2', 'e3'])).toBeLessThan(700);
  });
});
