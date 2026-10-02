import { readFileSync } from 'node:fs';
import { OrigSim, type SimOpts } from '../src/orig/sim';
import type { Cmd, OrigData, Side } from '../src/orig/types';

export const data = JSON.parse(readFileSync('public/orig/data.json', 'utf8')) as OrigData;

export const mk = (seed = 1, opts: SimOpts = { ai: false, diff: 1 }) => {
  const s = new OrigSim(data, seed, opts);
  s.emit = false;
  return s;
};

export const run = (s: OrigSim, frames: number, c1: Cmd[] = [], c2: Cmd[] = []) => {
  s.step(c1, c2);
  for (let i = 1; i < frames; i++) s.step();
};

/** tiny deterministic PRNG for test fuzzers (independent of the sim's own) */
export const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/** a random-but-valid-ish command for a side (the sim itself rejects illegal ones) */
export function randomCmd(s: OrigSim, side: Side, r: () => number): Cmd | null {
  const p = s.player(side);
  const pick = Math.floor(r() * 8);
  const lo = (p.tech - 1) * 3 + 1;
  switch (pick) {
    case 0:
    case 1:
      return { t: 'tray', id: lo + Math.floor(r() * 3) };
    case 2:
      return { t: 'turret', id: lo + Math.floor(r() * 3), spot: 1 + Math.floor(r() * 4) };
    case 3:
      return { t: 'sell', spot: 1 + Math.floor(r() * 4) };
    case 4:
      return { t: 'addon' };
    case 5:
      return { t: 'evolve' };
    case 6:
      return { t: 'special' };
    default:
      return { t: 'cancel', i: 1 + Math.floor(r() * 4) };
  }
}
