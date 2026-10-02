import { describe, expect, it } from 'vitest';
import { FPS, OrigSim } from '../src/orig/sim';
import type { Cmd, Side } from '../src/orig/types';
import { data, lcg, mk, randomCmd } from './helpers';

describe('smart bot', () => {
  it('only ever issues commands the rules allow (never relies on the sim to reject)', () => {
    for (const diff of [1, 2, 3] as const) {
      const s = new OrigSim(data, 11 + diff, { ai: false, bot: true, diff });
      s.emit = false;
      const orig = s.apply.bind(s);
      let rejected = 0;
      let total = 0;
      s.apply = (side: Side, c: Cmd) => {
        const ok = orig(side, c);
        if (side === 2) {
          total++;
          if (!ok) rejected++;
        }
        return ok;
      };
      const r = lcg(diff);
      for (let f = 0; f < FPS * 60 * 8 && !s.winner; f++)
        s.step(f % 25 === 0 ? ([randomCmd(s, 1, r)].filter(Boolean) as Cmd[]) : []);
      expect(total).toBeGreaterThan(5);
      expect(rejected).toBe(0);
    }
  });
  it('higher difficulty reacts faster (more actions in the same time)', () => {
    const actions = (diff: 1 | 2 | 3) => {
      const s = new OrigSim(data, 3, { ai: false, bot: true, diff });
      s.emit = false;
      let n = 0;
      const orig = s.apply.bind(s);
      s.apply = (side, c) => {
        const ok = orig(side, c);
        if (side === 2 && ok) n++;
        return ok;
      };
      s.player(2).cash = 1e5;
      for (let f = 0; f < FPS * 60 * 2 && !s.winner; f++) s.step();
      return n;
    };
    expect(actions(3)).toBeGreaterThanOrEqual(actions(1));
  });
  it('evolves through the ages when it has the xp', () => {
    const s = new OrigSim(data, 4, { ai: false, bot: true, diff: 3 });
    s.emit = false;
    s.player(2).xp = 5000;
    for (let f = 0; f < 200; f++) s.step();
    expect(s.player(2).tech).toBeGreaterThanOrEqual(2);
  });
  it('is the same bot every time (deterministic per seed)', () => {
    const h = () => {
      const s = new OrigSim(data, 21, { ai: false, bot: true, diff: 2 });
      s.emit = false;
      for (let f = 0; f < FPS * 90; f++) s.step();
      return s.hash();
    };
    expect(h()).toBe(h());
  });
});

describe('determinism', () => {
  it('two sims fed identical random command streams never diverge (hash every 200 frames)', () => {
    for (const seed of [1, 9, 77]) {
      const a = mk(seed);
      const b = mk(seed);
      const ra = lcg(seed);
      const rb = lcg(seed);
      for (let f = 0; f < FPS * 60 * 5 && !a.winner; f++) {
        const ca = f % 7 === 0 ? ([randomCmd(a, 1, ra), randomCmd(a, 2, ra)].filter(Boolean) as Cmd[]) : [];
        const cb = f % 7 === 0 ? ([randomCmd(b, 1, rb), randomCmd(b, 2, rb)].filter(Boolean) as Cmd[]) : [];
        a.step(ca.slice(0, 1), ca.slice(1));
        b.step(cb.slice(0, 1), cb.slice(1));
        if (f % 200 === 0) expect(a.hash()).toBe(b.hash());
      }
      expect(a.hash()).toBe(b.hash());
    }
  });
  it('turning event emission off does not change the simulation', () => {
    const a = mk(5);
    const b = mk(5);
    b.emit = true;
    for (let f = 0; f < FPS * 120; f++) {
      const c: Cmd[] = f === 10 ? [{ t: 'tray', id: 1 }] : [];
      a.step(c, c);
      b.step(c, c);
      b.drainEvents();
    }
    expect(a.hash()).toBe(b.hash());
  });
  it('a single different command changes the hash (the hash is sensitive)', () => {
    const a = mk(5);
    const b = mk(5);
    a.step([{ t: 'tray', id: 1 }]);
    b.step([{ t: 'tray', id: 2 }]);
    expect(a.hash()).not.toBe(b.hash());
  });
  it('golden: the seed-5 clubman duel is bit-for-bit stable (guards accidental sim changes)', () => {
    const s = mk(5);
    s.step([{ t: 'tray', id: 1 }], [{ t: 'tray', id: 1 }]);
    for (let f = 0; f < FPS * 30; f++) s.step();
    // if this fails after an intentional rules change, update the number — it must never change by accident
    expect(s.hash()).toMatchInlineSnapshot(`1329292567`);
  });
});

describe('performance budget', () => {
  it('simulates >100× realtime on the reference workload', () => {
    const s = new OrigSim(data, 1, { ai: true, diff: 1 });
    s.emit = false;
    const frames = FPS * 60 * 10; // ten game minutes
    const t0 = performance.now();
    for (let f = 0; f < frames && !s.winner; f++) s.step(f % 40 === 0 ? [{ t: 'tray', id: 1 }] : []);
    const ms = performance.now() - t0;
    const speed = (s.frame / FPS / (ms / 1000)).toFixed(0);
    console.log(`sim speed: ${speed}x realtime (${s.frame} frames in ${ms.toFixed(0)} ms)`);
    expect(s.frame / FPS / (ms / 1000)).toBeGreaterThan(100);
  });
});
