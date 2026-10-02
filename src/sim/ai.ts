import { SIM_HZ, unitsOfAge, turretsOfAge } from './data';
import type { Sim } from './sim';
import type { Difficulty } from './types';

/**
 * The original single-player opponent, ported from the extracted ActionScript rules:
 *  - at most N enemies on the map, a % chance to train a unit every second
 *  - tier-2 units unlock 1500 frames into an age, tier-3 after 5000, evolves after 8000
 *  - turrets are bought/sold on a fixed per-age schedule
 * The opponent trains units for free (as in the original). Difficulty scales the pace.
 */
type Step = [frame: number, op: 'buy' | 'sell' | 'slot', a?: number, b?: number];

const SCHEDULE: Step[][] = [
  [[1000, 'buy', 0, 0], [3950, 'sell', 0], [4000, 'buy', 1, 0], [5950, 'sell', 0], [6000, 'buy', 2, 0]],
  [[950, 'sell', 0], [1000, 'buy', 0, 0], [3950, 'sell', 0], [4000, 'buy', 2, 0], [6000, 'buy', 1, 1]],
  [[950, 'sell', 0], [1000, 'buy', 0, 0], [3950, 'sell', 1], [4000, 'buy', 0, 1], [5950, 'sell', 0], [5950, 'sell', 1], [6000, 'buy', 2, 2]],
  [[5000, 'buy', 0, 0], [6950, 'sell', 2], [6950, 'sell', 0], [7000, 'buy', 1, 1]],
  [[5000, 'buy', 0, 0], [12000, 'sell', 0], [12000, 'sell', 1], [12000, 'sell', 2], [12050, 'buy', 1, 1], [20000, 'sell', 0], [20000, 'sell', 1], [20000, 'sell', 2], [20050, 'buy', 2, 3]],
];

const LEVELS: Record<Difficulty, { chance: number; cap: number; pace: number }> = {
  easy: { chance: 0.18, cap: 4, pace: 1.35 },
  normal: { chance: 0.3, cap: 6, pace: 1 },
  hard: { chance: 0.45, cap: 9, pace: 0.8 },
  insane: { chance: 0.7, cap: 12, pace: 0.62 },
};

export class OriginalAI {
  private lvl: (typeof LEVELS)[Difficulty];
  private doneAge = -1;
  private fired = new Set<number>();
  constructor(private side: 0 | 1, difficulty: Difficulty = 'normal') {
    this.lvl = LEVELS[difficulty];
  }

  /** Called once per sim tick *before* sim.step; returns commands for its side. */
  think(sim: Sim): import('./types').Cmd[] {
    const p = sim.players[this.side];
    const cmds: import('./types').Cmd[] = [];
    if (this.doneAge !== p.age) { this.doneAge = p.age; this.fired.clear(); }
    const frame = p.ageTick / this.lvl.pace; // original-frame clock, scaled by difficulty

    if (p.age < 4 && frame >= 8000) {
      cmds.push({ t: 'evolve' });
      return cmds;
    }
    const sched = SCHEDULE[p.age] as Step[];
    sched.forEach((s, idx) => {
      if (frame < s[0] || this.fired.has(idx)) return;
      this.fired.add(idx);
      if (s[1] === 'sell') cmds.push({ t: 'sell', slot: s[2] as number });
      else if (s[1] === 'buy') {
        const slot = s[3] as number;
        for (let n = p.slots; n <= slot; n++) cmds.push({ t: 'slot' });
        const td = turretsOfAge(p.age)[s[2] as number];
        if (td) cmds.push({ t: 'turret', id: td.id, slot });
      }
    });

    if (sim.tick % SIM_HZ === 0 && sim.aliveCount(this.side) < this.lvl.cap && sim.rng.next() < this.lvl.chance) {
      const level = frame >= 5000 ? 2 : frame >= 1500 ? 1 : 0;
      const pool = unitsOfAge(p.age).filter((u) => u.tier <= level && u.tier < 3);
      const u = pool[sim.rng.int(pool.length)];
      if (u) cmds.push({ t: 'buy', u: u.id });
    }
    return cmds;
  }
}
