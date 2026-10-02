import { describe, expect, it } from 'vitest';
import { OriginalAI } from '../src/lite/sim/ai';
import { SIM_HZ, UNITS, unitsOfAge } from '../src/lite/sim/data';
import { Sim } from '../src/lite/sim/sim';
import type { Cmd, Difficulty } from '../src/lite/sim/types';

function playAi(seed: number, a: Difficulty, b: Difficulty, maxSec = 1500) {
  const sim = new Sim(seed, { free: [true, true] });
  sim.emit = false;
  const ai = [new OriginalAI(0, a), new OriginalAI(1, b)];
  while (sim.winner === -1 && sim.tick < maxSec * SIM_HZ) sim.step(ai[0]!.think(sim), ai[1]!.think(sim));
  return sim;
}

describe('data', () => {
  it('has 16 units, 4 per last age', () => {
    expect(UNITS).toHaveLength(16);
    expect(unitsOfAge(0).map((u) => u.name)).toEqual(['Clubman', 'Slingshot', 'Dino Rider']);
    expect(unitsOfAge(4)).toHaveLength(4);
  });
});

describe('rules', () => {
  it('buying costs gold, trains, then spawns', () => {
    const s = new Sim(1);
    s.step([{ t: 'buy', u: 0 }], []);
    expect(s.players[0].gold).toBe(160);
    for (let i = 0; i < 60; i++) s.step();
    expect(s.lanes[0]).toHaveLength(1);
  });
  it('rejects units from the wrong age and unaffordable buys', () => {
    const s = new Sim(1);
    s.step(
      [
        { t: 'buy', u: 3 },
        { t: 'buy', u: 5 },
      ],
      [],
    );
    expect(s.players[0].queue).toHaveLength(0);
    expect(s.players[0].gold).toBe(175);
  });
  it('cancel refunds', () => {
    const s = new Sim(1);
    s.step(
      [
        { t: 'buy', u: 1 },
        { t: 'cancel', i: 0 },
      ],
      [],
    );
    expect(s.players[0].gold).toBe(175);
  });
  it('front units fight and a kill pays gold + xp', () => {
    const s = new Sim(1);
    s.players[0].gold = s.players[1].gold = 1000;
    const buy: Cmd[] = [{ t: 'buy', u: 2 }];
    s.step(buy, [{ t: 'buy', u: 0 }]);
    for (let i = 0; i < 41 * 40 && s.players[0].kills + s.players[1].kills === 0; i++) s.step();
    expect(s.players[0].kills).toBe(1);
    expect(s.players[0].gold).toBeGreaterThan(1000 - 100);
    expect(s.players[0].xp).toBe(Math.round(1.3 * 15) * 2);
  });
  it('evolve needs xp and raises base hp', () => {
    const s = new Sim(1);
    s.step([{ t: 'evolve' }], []);
    expect(s.players[0].age).toBe(0);
    s.players[0].xp = 4000;
    s.step([{ t: 'evolve' }], []);
    expect(s.players[0].age).toBe(1);
    expect(s.players[0].baseHp).toBe(1100);
  });
  it('turrets: age-locked, slot-limited, sell refunds half', () => {
    const s = new Sim(1);
    s.players[0].gold = 2000;
    s.step(
      [
        { t: 'turret', id: 0, slot: 0 },
        { t: 'turret', id: 1, slot: 1 },
        { t: 'turret', id: 3, slot: 0 },
      ],
      [],
    );
    expect(s.players[0].turrets).toEqual([0, null, null, null]);
    s.step([{ t: 'sell', slot: 0 }], []);
    expect(s.players[0].gold).toBe(2000 - 100 + 50);
    s.step([{ t: 'slot' }, { t: 'slot' }, { t: 'slot' }, { t: 'slot' }], []);
    expect(s.players[0].slots).toBe(2); // 1000 ok, then 3000 unaffordable
  });
});

describe('special', () => {
  it('meteor shower can be used once per cooldown', () => {
    const s = new Sim(7);
    s.step([{ t: 'special' }], []);
    expect(s.players[0].specialCd).toBeGreaterThan(0);
    s.step([{ t: 'special' }], []);
    expect(s.specials).toHaveLength(1);
  });
});

describe('determinism', () => {
  it('same seed → same hash trace; different seed diverges', () => {
    const a = playAi(5, 'normal', 'normal', 300);
    const b = playAi(5, 'normal', 'normal', 300);
    const c = playAi(6, 'normal', 'normal', 300);
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });
});

describe('base assault', () => {
  it('an undefended base falls', () => {
    const s = new Sim(3);
    s.players[0].gold = 1e6;
    s.step(
      [
        { t: 'buy', u: 2 },
        { t: 'buy', u: 2 },
        { t: 'buy', u: 2 },
        { t: 'buy', u: 2 },
      ],
      [],
    );
    for (let i = 0; i < 41 * 400 && s.winner === -1; i++) s.step();
    expect(s.winner).toBe(0);
  });
  it('turrets shoot walking enemies', () => {
    const s = new Sim(3);
    s.players[1].gold = 1e6;
    s.players[0].gold = 1e6;
    s.step([{ t: 'turret', id: 0, slot: 0 }], [{ t: 'buy', u: 0 }]);
    const hp0 = 55;
    let seen = false;
    for (let i = 0; i < 41 * 40; i++) {
      s.step();
      const t = s.lanes[1][0];
      if (t && t.hp < hp0) seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe('AI skill levels', () => {
  it('insane beats easy more often than not', () => {
    let hardWins = 0;
    for (let seed = 1; seed <= 6; seed++)
      if (playAi(seed, 'easy', 'insane', 900).players[0].baseHp < playAi(seed, 'easy', 'insane', 900).players[1].baseHp)
        hardWins++;
    expect(hardWins).toBeGreaterThanOrEqual(4);
  });
});
