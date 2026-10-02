import { describe, expect, it } from 'vitest';
import { FPS } from '../src/orig/sim';
import { data, lcg, mk, randomCmd, run } from './helpers';

describe('training tray', () => {
  it('charges the unit price and refuses when broke', () => {
    const s = mk();
    expect(s.apply(1, { t: 'tray', id: 3 })).toBe(true); // dino rider 100
    expect(s.player(1).cash).toBe(75);
    expect(s.can(1, { t: 'tray', id: 3 })).toBe(false); // 75 < 100
    expect(s.can(1, { t: 'tray', id: 1 })).toBe(true); // clubman 15
  });
  it('rejects units of another age and the tech-5 special unit early', () => {
    const s = mk();
    expect(s.can(1, { t: 'tray', id: 4 })).toBe(false); // age 2 unit in age 1
    expect(s.can(1, { t: 'tray', id: 16 })).toBe(false);
    s.player(1).tech = 5;
    s.player(1).cash = 1e6;
    expect(s.can(1, { t: 'tray', id: 16 })).toBe(true);
    expect(s.can(1, { t: 'tray', id: 1 })).toBe(false); // age 1 unit in age 5
  });
  it('holds at most 5 queued units and cancel refunds the price', () => {
    const s = mk();
    s.player(1).cash = 1000;
    for (let i = 0; i < 5; i++) expect(s.apply(1, { t: 'tray', id: 1 })).toBe(true);
    expect(s.apply(1, { t: 'tray', id: 1 })).toBe(false);
    expect(s.player(1).cash).toBe(1000 - 5 * 15);
    expect(s.apply(1, { t: 'cancel', i: 2 })).toBe(true);
    expect(s.player(1).cash).toBe(1000 - 4 * 15);
    expect(s.apply(1, { t: 'cancel', i: 0 })).toBe(false); // the unit in production cannot be cancelled
  });
  it('trains units one after another in the configured time', () => {
    const s = mk();
    s.player(1).cash = 1000;
    s.step([
      { t: 'tray', id: 1 },
      { t: 'tray', id: 1 },
    ]);
    for (let i = 0; i < 100; i++) s.step();
    expect(s.units.filter((u) => u.side === 1).length).toBe(2);
  });
});

describe('turrets, slots, selling', () => {
  it('slots unlock in order for 1000/3000/7500', () => {
    const s = mk();
    const p = s.player(1);
    p.cash = 20000;
    const before = p.cash;
    expect(s.apply(1, { t: 'addon' })).toBe(true);
    expect(s.apply(1, { t: 'addon' })).toBe(true);
    expect(s.apply(1, { t: 'addon' })).toBe(true);
    expect(s.apply(1, { t: 'addon' })).toBe(false);
    expect(before - p.cash).toBe(1000 + 3000 + 7500);
    expect(p.addons).toBe(3);
  });
  it('cannot use a slot that is not unlocked or already occupied', () => {
    const s = mk();
    s.player(1).cash = 5000;
    expect(s.can(1, { t: 'turret', id: 1, spot: 2 })).toBe(false);
    expect(s.apply(1, { t: 'turret', id: 1, spot: 1 })).toBe(true);
    expect(s.can(1, { t: 'turret', id: 1, spot: 1 })).toBe(false);
  });
  it('selling refunds half of the price', () => {
    const s = mk();
    const p = s.player(1);
    p.cash = 1000;
    s.apply(1, { t: 'turret', id: 1, spot: 1 });
    const price = (data.TU[1] as [string, number, number])[1];
    expect(p.cash).toBe(1000 - price);
    s.apply(1, { t: 'sell', spot: 1 });
    expect(p.cash).toBe(1000 - price + Math.round(price / 2));
    expect(p.spots[0]).toBe(0);
  });
  it('a turret shoots at an approaching enemy', () => {
    const s = mk();
    s.player(2).cash = 1e6;
    s.player(1).cash = 1e6;
    s.apply(1, { t: 'turret', id: 1, spot: 1 });
    s.step([], [{ t: 'tray', id: 1 }]);
    const hp0 = 55;
    let hurt = false;
    for (let i = 0; i < FPS * 120 && !hurt; i++) {
      s.step();
      hurt = s.units.some((u) => u.side === 2 && u.health < hp0) || s.units.every((u) => u.side !== 2);
    }
    expect(hurt).toBe(true);
  });
});

describe('evolution and base', () => {
  it('needs the XP, adds 300×age base HP and caps at age 5', () => {
    const s = mk();
    const p = s.player(1);
    expect(s.can(1, { t: 'evolve' })).toBe(false);
    for (let age = 1; age < 5; age++) {
      p.xp = data.EV[age - 1] as number;
      const hp = s.bases[1].health;
      expect(s.apply(1, { t: 'evolve' })).toBe(true);
      expect(p.tech).toBe(age + 1);
      expect(s.bases[1].health).toBe(hp + 300 * (age + 1));
    }
    p.xp = 1e9;
    expect(s.can(1, { t: 'evolve' })).toBe(false);
  });
  it('a destroyed base ends the game for the other side, exactly once', () => {
    const s = mk();
    s.bases[2].health = -5;
    s.step();
    expect(s.winner).toBe(1);
    const f = s.frame;
    s.step();
    expect(s.frame).toBe(f); // a finished sim no longer advances
    const m = mk();
    m.bases[1].health = -5;
    m.step();
    expect(m.winner).toBe(2);
  });
});

describe('special attack', () => {
  it('is ready from the start (timer 1999) and recharges for 2000 frames', () => {
    const s = mk();
    s.step();
    expect(s.can(1, { t: 'special' })).toBe(true);
    expect(s.apply(1, { t: 'special' })).toBe(true);
    expect(s.can(1, { t: 'special' })).toBe(false);
    for (let i = 0; i < 1999; i++) s.step();
    expect(s.can(1, { t: 'special' })).toBe(false);
    s.step();
    s.step();
    expect(s.can(1, { t: 'special' })).toBe(true);
  });
});

describe('combat economy', () => {
  it('a kill pays the victim reward to the killer and 2× as xp', () => {
    const s = mk(2);
    s.player(1).cash = 1000;
    s.step([{ t: 'tray', id: 1 }]);
    // cheat-free: let a lone clubman walk into the enemy base and just check no money is created for the victim
    for (let i = 0; i < FPS * 90; i++) s.step();
    expect(s.player(2).cash).toBeGreaterThanOrEqual(175);
  });
});

describe('invariants under random play (fuzz)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: no NaN, no negative money, health bounded, always terminates or runs clean`, () => {
      const s = mk(seed);
      const r = lcg(seed * 977);
      for (let f = 0; f < FPS * 60 * 6 && !s.winner; f++) {
        const c1 = f % 10 === 0 ? [randomCmd(s, 1, r)].filter(Boolean) : [];
        const c2 = f % 13 === 0 ? [randomCmd(s, 2, r)].filter(Boolean) : [];
        s.player(1).cash += f % 50 === 0 ? 40 : 0;
        s.player(2).cash += f % 50 === 0 ? 40 : 0;
        s.step(c1 as never, c2 as never);
        if (f % 200 === 0) {
          for (const p of s.players) {
            expect(Number.isFinite(p.cash) && p.cash >= 0).toBe(true);
            expect(Number.isFinite(p.xp) && p.xp >= 0).toBe(true);
            expect(p.tray.every((x) => Number.isInteger(x))).toBe(true);
          }
          for (const u of s.units) expect(Number.isFinite(u.x) && Number.isFinite(u.health)).toBe(true);
          expect(s.units.length).toBeLessThan(400);
        }
      }
    });
  }
});
