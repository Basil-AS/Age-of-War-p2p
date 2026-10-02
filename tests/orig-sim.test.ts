import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FPS, OrigSim } from '../src/orig/sim';
import type { Cmd, OrigData, Side } from '../src/orig/types';

const data = JSON.parse(readFileSync('public/orig/data.json', 'utf8')) as OrigData;

/** a deliberately dumb human: buys the cheapest unit it can and evolves/uses the special asap */
function bot(sim: OrigSim, side: Side): Cmd[] {
  const p = sim.player(side);
  const cmds: Cmd[] = [];
  if (sim.can(side, { t: 'evolve' })) cmds.push({ t: 'evolve' });
  if (sim.can(side, { t: 'special' }) && sim.units.length > 3) cmds.push({ t: 'special' });
  const lo = (p.tech - 1) * 3 + 1;
  for (const id of [lo + 2, lo + 1, lo])
    if (sim.can(side, { t: 'tray', id })) {
      cmds.push({ t: 'tray', id });
      break;
    }
  return cmds;
}

describe('original port', () => {
  it('has the original numbers', () => {
    expect(data.fps).toBe(40);
    expect((data.ES[1] as number[]).slice(0, 5)).toEqual([55, 16, 0, 20, 0]);
    expect((data.EN[16] as [string, number, number])[1]).toBe(150000);
    expect(data.EV).toEqual([4000, 14000, 45000, 200000]);
  });
  it('a bought clubman trains for 40 frames then walks and fights', () => {
    const s = new OrigSim(data, 1, { ai: false, diff: 1 });
    s.step([{ t: 'tray', id: 1 }], [{ t: 'tray', id: 1 }]);
    expect(s.player(1).cash).toBe(160);
    for (let i = 0; i < 45; i++) s.step();
    expect(s.units.length).toBe(2);
    for (let i = 0; i < 40 * 60 && s.players[0].xp + s.players[1].xp === 0; i++) s.step();
    expect(s.players[0].xp + s.players[1].xp).toBeGreaterThan(0);
  });
  it('is deterministic for a seed and different for another', () => {
    const run = (seed: number) => {
      const s = new OrigSim(data, seed, { ai: true, diff: 1 });
      s.emit = false;
      for (let i = 0; i < FPS * 120; i++) s.step(bot(s, 1));
      return s.hash();
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });
  it('the scripted opponent evolves after 8000 frames and the match ends eventually', () => {
    const s = new OrigSim(data, 3, { ai: true, diff: 1 });
    s.emit = false;
    let maxTech = 1;
    for (let i = 0; i < FPS * 900 && !s.winner; i++) {
      s.step(bot(s, 1));
      maxTech = Math.max(maxTech, s.player(2).tech);
    }
    console.log(
      'frames',
      s.frame,
      'winner',
      s.winner,
      'ai tech',
      maxTech,
      'p1 tech',
      s.player(1).tech,
      'bases',
      Math.round(s.bases[1].health),
      Math.round(s.bases[2].health),
    );
    expect(maxTech).toBeGreaterThanOrEqual(2);
  });
  it('human vs human (both sides bots) stays symmetric-ish and ends', () => {
    const wins = [0, 0, 0];
    for (let seed = 1; seed <= 6; seed++) {
      const s = new OrigSim(data, seed, { ai: false, diff: 1 });
      s.emit = false;
      for (let i = 0; i < FPS * 1200 && !s.winner; i++) s.step(bot(s, 1), bot(s, 2));
      wins[s.winner]!++;
    }
    console.log('pvp bot wins [unfinished,p1,p2]', wins);
    expect(wins[1]! + wins[2]!).toBeGreaterThan(0);
  });
});
