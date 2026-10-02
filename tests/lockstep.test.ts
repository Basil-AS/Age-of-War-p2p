import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Lockstep } from '../src/net/lockstep';
import { createLoopbackPair } from '../src/net/loopback';
import { OrigSim } from '../src/orig/sim';
import type { Cmd, OrigData, Side } from '../src/orig/types';

const data = JSON.parse(readFileSync('public/orig/data.json', 'utf8')) as OrigData;
const mk = (seed: number) => {
  const s = new OrigSim(data, seed, { ai: false, diff: 1 });
  s.emit = false;
  return s;
};

function run(latencyMs: number, jitterMs: number, delay: number, seconds = 240) {
  const clock = {
    t: 1000,
    now() {
      return this.t;
    },
  };
  const [ta, tb] = createLoopbackPair({ latencyMs, jitterMs, clock });
  const a = new Lockstep(mk(99), 1, ta, delay);
  const b = new Lockstep(mk(99), 2, tb, delay);
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let stalls = 0;
  for (let ms = 0; ms < seconds * 1000; ms += 8) {
    clock.t += 8;
    ta.pump();
    tb.pump();
    // both players mash random buttons
    for (const [ls, side] of [
      [a, 1],
      [b, 2],
    ] as [Lockstep, Side][]) {
      if (rnd() < 0.04) {
        const tech = ls.sim.player(side).tech;
        const lo = (tech - 1) * 3 + 1;
        const cmd = (
          [
            { t: 'tray', id: lo + Math.floor(rnd() * 3) },
            { t: 'turret', spot: 1, id: lo },
            { t: 'sell', spot: 1 },
            { t: 'evolve' },
            { t: 'special' },
            { t: 'addon' },
          ] as Cmd[]
        )[Math.floor(rnd() * 6)] as Cmd;
        ls.command(cmd);
      }
    }
    a.update(clock.t);
    b.update(clock.t);
    if (a.status.stalled || b.status.stalled) stalls++;
  }
  return { a, b, stalls };
}

describe('lockstep over the original sim', () => {
  it('stays bit-identical with 40ms latency and jitter', () => {
    const { a, b } = run(40, 30, 3);
    expect(a.status.desync || b.status.desync).toBe(false);
    expect(Math.abs(a.sim.frame - b.sim.frame)).toBeLessThan(4 * 8);
    expect(a.sim.frame).toBeGreaterThan(40 * 100);
  });
  it('survives awful network (200ms ± 150ms) when given enough delay', () => {
    const { a, b } = run(200, 150, 6);
    expect(a.status.desync || b.status.desync).toBe(false);
  });
  it('detects a desync when one side diverges', () => {
    const clock = {
      t: 1000,
      now() {
        return this.t;
      },
    };
    const [ta, tb] = createLoopbackPair({ latencyMs: 20, clock });
    const a = new Lockstep(mk(5), 1, ta, 3);
    const b = new Lockstep(mk(5), 2, tb, 3);
    for (let ms = 0; ms < 20000; ms += 8) {
      clock.t += 8;
      ta.pump();
      tb.pump();
      if (ms === 5000) b.sim.player(2).cash += 1; // cheat / bug
      a.update(clock.t);
      b.update(clock.t);
    }
    expect(a.status.desync || b.status.desync).toBe(true);
  });
});
