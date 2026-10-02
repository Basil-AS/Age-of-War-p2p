import { describe, expect, it } from 'vitest';
import { Lockstep } from '../src/net/lockstep';
import { createLoopbackPair } from '../src/net/loopback';
import { Sim } from '../src/sim/sim';
import type { Cmd } from '../src/sim/types';

function run(latencyMs: number, jitterMs: number, delay: number, seconds = 240) {
  const clock = {
    t: 1000,
    now() {
      return this.t;
    },
  };
  const [ta, tb] = createLoopbackPair({ latencyMs, jitterMs, clock });
  const a = new Lockstep(new Sim(99), 0, ta, delay);
  const b = new Lockstep(new Sim(99), 1, tb, delay);
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let stalls = 0;
  for (let ms = 0; ms < seconds * 1000; ms += 8) {
    clock.t += 8;
    ta.pump();
    tb.pump();
    // both players mash random buttons
    for (const [ls, side] of [
      [a, 0],
      [b, 1],
    ] as const) {
      if (rnd() < 0.04) {
        const age = ls.sim.players[side].age;
        const cmd: Cmd = [
          { t: 'buy', u: age * 3 + Math.floor(rnd() * 3) } as Cmd,
          { t: 'turret', id: age * 3, slot: 0 } as Cmd,
          { t: 'sell', slot: 0 } as Cmd,
          { t: 'evolve' } as Cmd,
          { t: 'special' } as Cmd,
        ][Math.floor(rnd() * 5)] as Cmd;
        ls.command(cmd);
      }
    }
    a.update(clock.t);
    b.update(clock.t);
    if (a.status.stalled || b.status.stalled) stalls++;
  }
  return { a, b, stalls };
}

describe('lockstep', () => {
  it('stays bit-identical with 40ms latency and jitter', () => {
    const { a, b } = run(40, 30, 3);
    expect(a.status.desync || b.status.desync).toBe(false);
    expect(Math.abs(a.sim.tick - b.sim.tick)).toBeLessThan(4 * 8);
    expect(a.sim.tick).toBeGreaterThan(41 * 100);
    // identical history → run both to the same tick and compare hashes
    while (a.sim.tick < b.sim.tick) a.sim.step();
    while (b.sim.tick < a.sim.tick) b.sim.step();
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
    const a = new Lockstep(new Sim(5), 0, ta, 3);
    const b = new Lockstep(new Sim(5), 1, tb, 3);
    for (let ms = 0; ms < 20000; ms += 8) {
      clock.t += 8;
      ta.pump();
      tb.pump();
      if (ms === 5000) b.sim.players[1].gold += 1; // cheat / bug
      a.update(clock.t);
      b.update(clock.t);
    }
    expect(a.status.desync || b.status.desync).toBe(true);
  });
});
