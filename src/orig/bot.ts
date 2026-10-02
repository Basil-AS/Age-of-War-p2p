import type { OrigSim } from './sim';
import type { Cmd, Side } from './types';

/**
 * "Smart" opponent: unlike the original scripted opponent (which spawns units for free), this one
 * is a regular player — it pays for units/turrets, earns gold/xp from kills, evolves, buys add-on
 * slots and fires its special. It only ever issues the same commands a human can.
 * Solo-only (not part of lockstep), so it may keep private state.
 */
export class Bot {
  private t = 0;
  private plan = 0;

  constructor(
    private readonly side: Side,
    private readonly diff: 1 | 2 | 3,
  ) {}

  /** frames between decisions: slower for easy, near-instant for hard */
  private get reaction() {
    return this.diff === 1 ? 36 : this.diff === 2 ? 20 : 8;
  }

  think(sim: OrigSim): Cmd[] {
    if (++this.t % this.reaction !== 0) return [];
    const out: Cmd[] = [];
    const me = sim.player(this.side);
    const d = sim.d;
    let cash = me.cash;
    const spend = (n: number) => {
      cash -= n;
    };

    const enemies = sim.units.filter((u) => u.side !== this.side && !u.dead);
    const mine = sim.units.filter((u) => u.side === this.side && !u.dead);
    const baseX = sim.bases[this.side].x;
    const threat = enemies.filter((u) => Math.abs(u.x - baseX) < 350);
    const pressure = enemies.length - mine.length;

    // 1. evolve as soon as it is affordable (also grows base HP)
    if (me.tech < 5 && me.xp >= (d.EV[me.tech - 1] as number)) {
      out.push({ t: 'evolve' });
      return out;
    }

    // 2. special: when a crowd is around, or the enemy base is nearly dead
    if (me.special >= 2000 && (enemies.length >= 4 || threat.length >= 2)) {
      out.push({ t: 'special' });
    }

    const lo = (me.tech - 1) * 3 + 1;
    const tiers = [lo, lo + 1, lo + 2];
    const unitCost = (id: number) => (d.EN[id] as [string, number, number])[1];
    const turCost = (id: number) => (d.TU[id] as [string, number, number])[1];

    // 3. defence: turrets are the cheapest way to hold a lane
    const free: number[] = [];
    for (let s = 1; s <= me.addons + 1; s++) if (me.spots[s - 1] === 0) free.push(s);
    const wantTurret = threat.length > 0 || (this.diff >= 2 && mine.length >= 3) || this.t > 2400;
    if (wantTurret && free.length) {
      const best = [...tiers].reverse().find((id) => turCost(id) <= cash - 60);
      if (best) {
        out.push({ t: 'turret', id: best, spot: free[0] as number });
        spend(turCost(best));
      }
    }

    // 4. more slots once the economy supports it
    const addonPrice = [1000, 3000, 7500][me.addons];
    if (addonPrice && me.addons < (this.diff === 1 ? 1 : 3) && cash > addonPrice + 400 && me.tech >= me.addons + 2) {
      out.push({ t: 'addon' });
      spend(addonPrice);
    }

    // 5. keep the training queue topped up with a counter-picked unit
    const queued = me.tray.filter((x) => x !== 0).length;
    if (queued < (this.diff === 1 ? 1 : 2)) {
      // under pressure: cheap bodies; ahead: the strongest unit that is affordable; mix a bit
      this.plan = (this.plan + 1) % 4;
      const order =
        pressure > 2
          ? [tiers[0], tiers[1], tiers[2]]
          : this.plan === 3
            ? [tiers[1], tiers[0]]
            : [tiers[2], tiers[1], tiers[0]];
      const pick = order.find((id) => id !== undefined && unitCost(id) <= cash);
      // save for evolution when it is close, unless we're being attacked
      const saving = me.tech < 5 && me.xp >= (d.EV[me.tech - 1] as number) * 0.85 && threat.length === 0;
      if (pick !== undefined && !saving) out.push({ t: 'tray', id: pick });
    }
    return out;
  }
}
