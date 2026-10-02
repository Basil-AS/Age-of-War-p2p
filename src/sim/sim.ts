import {
  BASE_EDGE, BASE_HP, KILL_GOLD_MULT, KILL_XP_MULT, MAP_LEN, MAX_ALIVE, MAX_QUEUE, MIN_GAP,
  SIM_HZ, SLOT_COST, SPECIAL_COOLDOWN, SPECIALS, START_GOLD, TURRETS, TURRET_SELL_RATIO, UNITS,
  WALK_SPEED, XP_TO_EVOLVE,
} from './data';
import { Rng } from './rng';
import type { ActiveSpecial, Cmd, Ev, Player, Side, Troop } from './types';

const STEP = WALK_SPEED / SIM_HZ;
const TURRET_X: [number, number] = [BASE_EDGE - 10, MAP_LEN - BASE_EDGE + 10];

interface Strike {
  target: Troop | null; // null = enemy base
  victimSide: Side;
  dmg: number;
}

function newPlayer(free: boolean): Player {
  return {
    gold: START_GOLD, xp: 0, age: 0, baseHp: BASE_HP[0] as number, baseMax: BASE_HP[0] as number,
    queue: [], turrets: [null, null, null, null], turretCd: [-1, -1, -1, -1], slots: 1, specialCd: 0,
    free, ageTick: 0, kills: 0,
  };
}

export class Sim {
  tick = 0;
  rng: Rng;
  players: [Player, Player];
  /** lanes[side] is ordered front (closest to the enemy) → back */
  lanes: [Troop[], Troop[]] = [[], []];
  specials: ActiveSpecial[] = [];
  winner = -1; // -1 running, 0/1 side, 2 draw
  nextUid = 1;
  events: Ev[] = [];
  emit = true;

  constructor(seed: number, opts: { free?: [boolean, boolean] } = {}) {
    this.rng = new Rng(seed);
    const f = opts.free ?? [false, false];
    this.players = [newPlayer(f[0]), newPlayer(f[1])];
  }

  private ev(e: Ev) {
    if (this.emit) this.events.push(e);
  }
  drainEvents(): Ev[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  aliveCount(side: Side): number {
    return this.lanes[side].length;
  }

  // ───────────────────────── commands ─────────────────────────
  /** Pure validation — the UI uses it to grey out buttons, `apply` uses it as the single source of truth. */
  can(side: Side, c: Cmd): boolean {
    const p = this.players[side];
    switch (c.t) {
      case 'buy': {
        const u = UNITS[c.u];
        if (!u || (u.tier === 3 ? p.age !== 4 : u.age !== p.age)) return false;
        if (p.queue.length >= MAX_QUEUE) return false;
        const total = this.aliveCount(side) + p.queue.length;
        if (total >= MAX_ALIVE) return false;
        if (u.tier === 3 && total >= 3) return false;
        return p.free || p.gold >= u.cost;
      }
      case 'cancel': return !!p.queue[c.i];
      case 'turret': {
        const t = TURRETS[c.id];
        if (!t || t.age !== p.age || c.slot < 0 || c.slot >= p.slots || p.turrets[c.slot] !== null) return false;
        return p.free || p.gold >= t.cost;
      }
      case 'sell': return p.turrets[c.slot] !== null && p.turrets[c.slot] !== undefined;
      case 'slot': return p.slots < 4 && (p.free || p.gold >= (SLOT_COST[p.slots - 1] as number));
      case 'evolve': return p.age < 4 && (p.free || p.xp >= (XP_TO_EVOLVE[p.age] as number));
      case 'special': return p.specialCd <= 0;
    }
  }

  apply(side: Side, c: Cmd): boolean {
    if (!this.can(side, c)) return false;
    const p = this.players[side];
    switch (c.t) {
      case 'buy': {
        const u = UNITS[c.u] as (typeof UNITS)[number];
        if (!p.free) p.gold -= u.cost;
        p.queue.push({ def: u.id, left: u.train, total: u.train });
        return true;
      }
      case 'cancel': {
        const it = p.queue[c.i] as { def: number };
        if (!p.free) p.gold += (UNITS[it.def] as { cost: number }).cost;
        p.queue.splice(c.i, 1);
        return true;
      }
      case 'turret': {
        const t = TURRETS[c.id] as (typeof TURRETS)[number];
        if (!p.free) p.gold -= t.cost;
        p.turrets[c.slot] = t.id;
        p.turretCd[c.slot] = -1;
        this.ev({ k: 'turret', side, slot: c.slot, id: t.id });
        return true;
      }
      case 'sell': {
        const id = p.turrets[c.slot] as number;
        if (!p.free) p.gold += Math.floor((TURRETS[id] as { cost: number }).cost * TURRET_SELL_RATIO);
        p.turrets[c.slot] = null;
        this.ev({ k: 'turret', side, slot: c.slot, id: null });
        return true;
      }
      case 'slot': {
        if (!p.free) p.gold -= SLOT_COST[p.slots - 1] as number;
        p.slots++;
        return true;
      }
      case 'evolve': {
        const add = (BASE_HP[p.age + 1] as number) - (BASE_HP[p.age] as number);
        p.age++;
        p.baseHp += add;
        p.baseMax += add;
        p.ageTick = 0;
        this.ev({ k: 'evolve', side, age: p.age });
        return true;
      }
      case 'special': {
        p.specialCd = SPECIAL_COOLDOWN;
        const sd = SPECIALS[p.age] as (typeof SPECIALS)[number];
        if (sd.kind === 'heal') for (const t of this.lanes[side]) t.regenUntil = this.tick + (sd.duration as number);
        else this.specials.push({ side, age: p.age, start: this.tick, fired: 0 });
        this.ev({ k: 'special', side, kind: sd.kind, x: 0, dmg: 0, hit: false, idx: -1 });
        return true;
      }
    }
  }

  // ───────────────────────── simulation step ─────────────────────────
  step(cmds0: Cmd[] = [], cmds1: Cmd[] = []) {
    if (this.winner !== -1) return;
    for (const c of cmds0) this.apply(0, c);
    for (const c of cmds1) this.apply(1, c);

    this.tickTraining(0);
    this.tickTraining(1);

    const strikes: Strike[] = [];
    const moves: [Troop, number][] = [];
    this.planTroops(0, strikes, moves);
    this.planTroops(1, strikes, moves);
    this.planTurrets(0, strikes);
    this.planTurrets(1, strikes);
    for (const [t, dx] of moves) t.x += dx;
    this.applyStrikes(strikes);
    this.tickSpecials();

    for (const side of [0, 1] as const) {
      const p = this.players[side];
      if (p.specialCd > 0) p.specialCd--;
      p.ageTick++;
    }
    for (const t of this.lanes[0].concat(this.lanes[1])) {
      if (t.regenUntil > this.tick && t.hp < t.maxHp) t.hp = Math.min(t.maxHp, t.hp + 1);
    }

    const d0 = (this.players[0] as Player).baseHp <= 0;
    const d1 = (this.players[1] as Player).baseHp <= 0;
    if (d0 || d1) {
      this.winner = d0 && d1 ? 2 : d0 ? 1 : 0;
      this.ev({ k: 'end', winner: this.winner });
    }
    this.tick++;
  }

  private tickTraining(side: Side) {
    const p = this.players[side];
    const it = p.queue[0];
    if (!it) return;
    if (it.left > 0) it.left--;
    if (it.left === 0 && this.aliveCount(side) < MAX_ALIVE) {
      p.queue.shift();
      this.spawn(side, it.def);
    }
  }

  private spawn(side: Side, def: number) {
    const u = UNITS[def] as (typeof UNITS)[number];
    const t: Troop = {
      uid: this.nextUid++, side, def, x: side === 0 ? BASE_EDGE : MAP_LEN - BASE_EDGE, hp: u.hp, maxHp: u.hp,
      cd: -1, mode: 0, moving: false, regenUntil: 0, born: this.tick,
    };
    this.lanes[side].push(t);
    this.ev({ k: 'spawn', side, uid: t.uid, def, x: t.x });
  }

  private planTroops(side: Side, strikes: Strike[], moves: [Troop, number][]) {
    const lane = this.lanes[side];
    const enemy = this.lanes[(1 - side) as Side];
    const front = enemy[0];
    const dir = side === 0 ? 1 : -1;
    const baseX = side === 0 ? MAP_LEN - BASE_EDGE : BASE_EDGE;
    for (let i = 0; i < lane.length; i++) {
      const t = lane[i] as Troop;
      const u = UNITS[t.def] as (typeof UNITS)[number];
      let blocked = false;
      const ahead = lane[i - 1];
      if (ahead) {
        const au = UNITS[ahead.def] as (typeof UNITS)[number];
        if ((ahead.x - t.x) * dir - au.length <= MIN_GAP) blocked = true;
      } else if (front) {
        if ((front.x - t.x) * dir <= MIN_GAP) blocked = true;
      } else if ((baseX - t.x) * dir <= 10) blocked = true;
      t.moving = !blocked;
      if (!blocked) moves.push([t, STEP * dir]);

      // choose target / attack mode
      let mode: 0 | 1 | 2 = 0;
      let target: Troop | null = null;
      if (front) {
        const d = (front.x - t.x) * dir;
        if (u.melee > 0 && d <= u.meleeRange) { mode = 1; target = front; }
        else if (u.ranged > 0 && d <= u.rangedRange) { mode = 2; target = front; }
      } else {
        const d = (baseX - t.x) * dir;
        if (u.melee > 0 && d <= u.meleeRange) mode = 1;
        else if (u.ranged > 0 && d <= u.rangedRange) mode = 2;
      }
      if (mode === 0) { t.cd = -1; t.mode = 0; continue; }
      if (mode !== t.mode || t.cd < 0) t.cd = mode === 1 ? u.meleeFirst : u.rangedFirst;
      t.mode = mode;
      t.cd--;
      if (t.cd > 0) continue;
      const dmg = mode === 1 ? u.melee : u.ranged;
      t.cd = mode === 1 ? u.meleeEvery : t.moving ? u.rangedWalkEvery : u.rangedStandEvery;
      strikes.push({ target, victimSide: (1 - side) as Side, dmg });
      if (mode === 1) this.ev({ k: 'melee', uid: t.uid, target: target ? target.uid : 0, side });
      else this.ev({ k: 'shot', side, from: t.x, to: target ? target.x : baseX, def: t.def, turret: -1, slot: -1, uid: t.uid });
    }
  }

  private planTurrets(side: Side, strikes: Strike[]) {
    const p = this.players[side];
    const front = (this.lanes[(1 - side) as Side] as Troop[])[0];
    const dir = side === 0 ? 1 : -1;
    for (let s = 0; s < p.slots; s++) {
      const id = p.turrets[s];
      if (id === null || id === undefined) continue;
      const td = TURRETS[id] as (typeof TURRETS)[number];
      if (!front || (front.x - (TURRET_X[side] as number)) * dir > td.range) { p.turretCd[s] = -1; continue; }
      if ((p.turretCd[s] as number) < 0) p.turretCd[s] = td.first;
      p.turretCd[s] = (p.turretCd[s] as number) - 1;
      if ((p.turretCd[s] as number) > 0) continue;
      p.turretCd[s] = td.every;
      strikes.push({ target: front, victimSide: (1 - side) as Side, dmg: td.damage + td.frag * 2 });
      this.ev({ k: 'shot', side, from: TURRET_X[side] as number, to: front.x, def: -1, turret: id, slot: s, uid: 0 });
    }
  }

  private applyStrikes(strikes: Strike[]) {
    for (const s of strikes) {
      if (s.target) {
        s.target.hp -= s.dmg;
        this.ev({ k: 'hit', x: s.target.x, side: s.victimSide, dmg: s.dmg, base: false, big: s.dmg >= 150 });
      } else {
        const p = this.players[s.victimSide];
        p.baseHp -= s.dmg;
        this.ev({ k: 'hit', x: s.victimSide === 0 ? BASE_EDGE : MAP_LEN - BASE_EDGE, side: s.victimSide, dmg: s.dmg, base: true, big: s.dmg >= 150 });
      }
    }
    this.reap();
  }

  private reap() {
    for (const side of [0, 1] as const) {
      const lane = this.lanes[side];
      if (!lane.some((t) => t.hp <= 0)) continue;
      const killer = this.players[(1 - side) as Side];
      this.lanes[side] = lane.filter((t) => {
        if (t.hp > 0) return true;
        const u = UNITS[t.def] as (typeof UNITS)[number];
        const reward = Math.round(KILL_GOLD_MULT * u.cost);
        killer.gold += reward;
        killer.xp += reward * KILL_XP_MULT;
        killer.kills++;
        this.ev({ k: 'die', uid: t.uid, side, def: t.def, x: t.x, gold: reward });
        return false;
      });
    }
  }

  private tickSpecials() {
    if (this.specials.length === 0) return;
    for (const sp of this.specials) {
      const def = SPECIALS[sp.age] as (typeof SPECIALS)[number];
      const dt = this.tick - sp.start;
      if (dt > 0 && dt % def.interval === 0 && sp.fired < def.count) {
        this.fireSpecial(sp, def, sp.fired);
        sp.fired++;
      }
    }
    this.specials = this.specials.filter((sp) => sp.fired < (SPECIALS[sp.age] as { count: number }).count);
    this.reap();
  }

  private fireSpecial(sp: ActiveSpecial, def: (typeof SPECIALS)[number], i: number) {
    let x: number;
    if (def.kind === 'meteors' || def.kind === 'arrows') x = this.rng.range(50, MAP_LEN - 50);
    else x = sp.side === 0 ? i * (def.spacing as number) : MAP_LEN - i * (def.spacing as number);
    const enemy = this.lanes[(1 - sp.side) as Side];
    let best: Troop | null = null;
    let bd = Infinity;
    for (const t of enemy) {
      const u = UNITS[t.def] as (typeof UNITS)[number];
      const d = Math.abs(t.x - x);
      if (d <= 20 + u.length / 2 && d < bd) { bd = d; best = t; }
    }
    if (best) best.hp -= def.damage;
    this.ev({ k: 'special', side: sp.side, kind: def.kind, x, dmg: def.damage, hit: !!best, idx: i });
  }

  // ───────────────────────── hashing (desync detection) ─────────────────────────
  hash(): number {
    let h = 0x811c9dc5;
    const f64 = new Float64Array(1);
    const u32 = new Uint32Array(f64.buffer);
    const mix = (n: number) => {
      f64[0] = n;
      h = Math.imul(h ^ (u32[0] as number), 16777619);
      h = Math.imul(h ^ (u32[1] as number), 16777619);
    };
    mix(this.tick); mix(this.rng.s); mix(this.winner);
    for (const p of this.players) {
      mix(p.gold); mix(p.xp); mix(p.age); mix(p.baseHp); mix(p.specialCd); mix(p.slots);
      for (const q of p.queue) { mix(q.def); mix(q.left); }
      for (const t of p.turrets) mix(t ?? -1);
    }
    for (const lane of this.lanes) for (const t of lane) { mix(t.uid); mix(t.x); mix(t.hp); mix(t.cd); }
    return h >>> 0;
  }
}
