/**
 * Faithful, deterministic port of the original Age of War ActionScript (SWF, 40 fps).
 * Every rule below is transcribed from the decompiled scripts:
 *   frame_13/DoAction_3 (game setup), DefineSprite_699_ennemy (units), DefineSprite_33_base_comp (AI),
 *   DefineSprite_212_menu (training tray), DefineSprite_886_turret, bullets / particles / specials.
 * Differences are only the ones a 2-player game needs: both sides can be human, and per-side
 * variables (cash, xp, tech level, turrets, special, heal aura) exist twice. Trig is deterministic
 * (src/orig/dmath.ts) and every random() comes from one seeded stream so two browsers stay in lockstep.
 */
import { Rng } from '../sim/rng';
import { DEG, datan2, dcos, dsin, RAD2DEG } from './dmath';
import type { Box, ClipData, Cmd, Ev, Op, OrigData, Side, TurretData, UnitData } from './types';

export const FPS = 40;
export const GROUND = 425;
export const BASE1_X = 150; // spawn x of side 1
export const BASE2_X = 860; // spawn x of side 2
export const WORLD_W = 1000;
export const SPOT_X = 52;
export const SPOT_Y = [-80, -125, -172, -220];
export const SPECIAL_READY = 2000;

interface Target {
  uid: number | string;
  side: Side;
  x: number;
  y: number;
  health: number;
  hit: Box;
  isBase: boolean;
}

class Anim {
  label = '';
  clip: (ClipData & { m?: unknown }) | null = null;
  frame = 1;
  playing = true;
  constructor(
    private states: Record<string, ClipData>,
    private onOp: (op: Op, anim: Anim) => void,
    private onSound: (id: number) => void,
    private rnd: () => number,
  ) {}
  /** gotoAndStop(label) on the parent: only (re)starts the child clip when the state actually changes */
  goto(label: string) {
    if (this.label === label || !this.states[label]) return;
    this.label = label;
    this.clip = this.states[label] as ClipData;
    this.frame = 1;
    this.playing = true;
    this.run();
  }
  advance() {
    if (!this.clip || !this.playing) return;
    this.frame++;
    if (this.frame > this.clip.n) this.frame = 1;
    this.run();
  }
  play() {
    this.playing = true;
  }
  private run() {
    const c = this.clip as ClipData;
    const snd = c.snd[this.frame];
    if (snd) for (const s of snd) this.onSound(s);
    const ops = c.ops[this.frame];
    if (!ops) return;
    for (const op of ops) {
      switch (op[0]) {
        case 'stop':
          this.playing = false;
          break;
        case 'goto':
          this.frame = op[1];
          break; // frame scripts of the target frame are not re-run (gotoAndPlay: plays from there next tick)
        case 'gotoRandom':
          this.frame = Math.floor(this.rnd() * op[1]) || 1;
          break;
        case 'randLabel': {
          const k = Math.floor(this.rnd() * op[2]) + 1;
          const f = c.labels[`${op[1]}${k}`];
          if (f) this.frame = f;
          break;
        }
        default:
          this.onOp(op, this);
      }
    }
  }
}

export interface Unit extends Target {
  b: number; // creation counter (= depth)
  id: number;
  rhealth: number;
  damage: number;
  rangeDamage: number;
  speed: number;
  closestDist: number;
  ed: number;
  edId: number | string;
  c: number;
  limit: number;
  rangeShoot: number;
  rangeMelee: number;
  reward: number;
  moving: boolean;
  attackMelee: boolean;
  attackRange: boolean;
  dead: boolean;
  dc: number;
  anim: Anim;
  data: UnitData;
  w: number;
  h: number;
  ageAura: boolean;
}

export interface Bullet {
  bi: number;
  kind: string; // 'b1'..'b12' | 's1' | 's2' | 's4' | 's5'
  x: number;
  y: number;
  rot: number;
  damage: number;
  side: Side;
  xs: number;
  ys: number;
  g: number;
  gf: number;
  acc: number;
  rotSpeed: number;
  timer: number;
  cc: number;
  removed: boolean;
}

/** damaging particles: part5 (fragment 10), part11 (30), part8 (flame, damage from params) */
export interface Frag {
  kind: 5 | 8 | 11;
  x: number;
  y: number;
  xs: number;
  ys: number;
  g: number;
  gf: number;
  f: number;
  rot: number;
  rotSpeed: number;
  damage: number;
  side: Side;
  removed: boolean;
}

export interface TurretInst {
  side: Side;
  spot: number; // 1..4
  id: number;
  rx: number;
  ry: number;
  rotation: number;
  ed: number;
  edId: number | string;
  edH: number;
  c: number;
  st: number;
  shootSpeed: number;
  bulletId: number;
  damage: number;
  range: number;
  anim: Anim;
  data: TurretData;
}

export interface SpecialFx {
  kind: 1 | 2 | 3 | 4 | 5;
  side: Side;
  timer: number;
  cc: number;
  x: number;
  y: number;
  frame: number;
}

export interface PlayerState {
  side: Side;
  cash: number;
  xp: number;
  tech: number;
  addons: number;
  spots: [number, number, number, number]; // turret id per spot (0 = empty)
  tray: [number, number, number, number, number];
  cId: number;
  timer: number;
  cTimer: number;
  special: number; // sprite 78 `timer` 0..2000
  healT: number; // remaining frames of the heal aura (special3), 0 = off
}

const newPlayer = (side: Side, cash: number): PlayerState => ({
  side,
  cash,
  xp: 0,
  tech: 1,
  addons: 0,
  spots: [0, 0, 0, 0],
  tray: [0, 0, 0, 0, 0],
  cId: 0,
  timer: -1,
  cTimer: 0,
  special: 1999,
  healT: 0,
});

export interface SimOpts {
  /** side 2 is the original scripted opponent (base_comp) */
  ai: boolean;
  /** 1 normal, 2 harder (x1.3), 3 impossible (x2) */
  diff: 1 | 2 | 3;
}

export class OrigSim {
  frame = 0;
  winner: 0 | Side = 0;
  players: [PlayerState, PlayerState];
  units: Unit[] = [];
  targets: Target[] = []; // _root.ennemies (bases first, units pushed)
  bullets: Bullet[] = [];
  frags: Frag[] = [];
  turrets: TurretInst[] = [];
  specials: SpecialFx[] = [];
  bases: { 1: Target; 2: Target & { maxHealth: number } } & Record<number, Target & { maxHealth: number }>;
  rng: Rng;
  events: Ev[] = [];
  emit = true;
  private b = 1; // unit counter
  private bi = 0; // bullet counter
  // base_comp AI state
  private ai = {
    timer: 0,
    uTimer: -1,
    uTimerTotal: 0,
    checkAction: false,
    action: 0,
    uof: 0,
    techTimer: 0,
    unitLevel: 1,
    willCreate: 0,
    stepTime: 40,
    uf: 0.3,
  };

  constructor(
    readonly d: OrigData,
    seed: number,
    readonly opts: SimOpts = { ai: true, diff: 1 },
  ) {
    this.rng = new Rng(seed);
    this.players = [newPlayer(1, 175), newPlayer(2, opts.ai ? 100 : 175)];
    const mk = (side: Side, x: number, hit: Box) => ({
      uid: side === 1 ? 'base1' : 'base2',
      side,
      x,
      y: GROUND,
      health: 500,
      maxHealth: 500,
      hit,
      isBase: true,
    });
    this.bases = {
      1: mk(1, d.bases.base1.x, d.bases.base1.hit),
      2: mk(2, d.bases.base2.x, d.bases.base2.hit),
    } as never;
    this.targets.push(this.bases[1] as Target, this.bases[2] as Target);
  }

  // ───────────── helpers mirroring AS builtins ─────────────
  /** AS2 random(n) */
  private rnd(n: number): number {
    return Math.floor(this.rng.next() * n);
  }
  private r01(): number {
    return this.rng.next();
  }
  private ev(e: Ev) {
    if (this.emit) this.events.push(e);
  }
  drainEvents(): Ev[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  private part(id: number, x: number, y: number, ...params: number[]) {
    if (this.emit) this.events.push({ k: 'part', id, x, y, params });
  }
  private sound(id: number, x: number) {
    if (this.emit) this.events.push({ k: 'snd', id, x });
  }
  private find(uid: number | string): Target | undefined {
    if (uid === 'base1') return this.bases[1];
    if (uid === 'base2') return this.bases[2];
    return this.units.find((u) => u.uid === uid);
  }
  private static inBox(t: Target, x: number, y: number): boolean {
    return x >= t.x + t.hit.x0 && x <= t.x + t.hit.x1 && y >= t.y + t.hit.y0 && y <= t.y + t.hit.y1;
  }
  player(side: Side): PlayerState {
    return this.players[side - 1] as PlayerState;
  }
  private base(side: Side) {
    return this.bases[side] as Target & { maxHealth: number };
  }

  // ───────────── commands (player input) ─────────────
  can(side: Side, c: Cmd): boolean {
    const p = this.player(side);
    const d = this.d;
    switch (c.t) {
      case 'tray': {
        const en = d.EN[c.id] as [string, number, number] | undefined;
        if (!en || typeof en === 'string') return false;
        const lo = (p.tech - 1) * 3 + 1;
        const ok = (c.id >= lo && c.id <= lo + 2) || (c.id === 16 && p.tech === 5);
        return ok && p.cash >= en[1] && p.tray.includes(0);
      }
      case 'cancel':
        return c.i >= 1 && c.i < 5 && p.tray[c.i] !== 0;
      case 'turret': {
        const tu = d.TU[c.id] as [string, number, number] | undefined;
        if (!tu || typeof tu === 'string' || p.cash < tu[1]) return false;
        const lo = (p.tech - 1) * 3 + 1;
        if (c.id < lo || c.id > lo + 2) return false;
        return c.spot >= 1 && c.spot <= p.addons + 1 && p.spots[c.spot - 1] === 0;
      }
      case 'sell':
        return c.spot >= 1 && c.spot <= 4 && p.spots[c.spot - 1] !== 0;
      case 'addon':
        return p.addons < 3 && p.cash >= [1000, 3000, 7500][p.addons]!;
      case 'evolve':
        return p.tech < 5 && p.xp >= (d.EV[p.tech - 1] as number);
      case 'special':
        return p.special >= SPECIAL_READY;
    }
  }

  apply(side: Side, c: Cmd): boolean {
    if (!this.can(side, c)) return false;
    const p = this.player(side);
    const d = this.d;
    switch (c.t) {
      case 'tray': {
        const en = d.EN[c.id] as [string, number, number];
        p.cash -= en[1];
        const slot = p.tray.indexOf(0);
        p.tray[slot] = c.id;
        if (slot === 0) {
          p.cId = c.id;
          p.timer = en[2];
          p.cTimer = en[2];
        }
        return true;
      }
      case 'cancel': {
        // (refund of a waiting tray slot — not in the original UI, harmless QoL)
        const en = d.EN[p.tray[c.i] as number] as [string, number, number];
        p.cash += en[1];
        for (let i = c.i; i < 4; i++) p.tray[i] = p.tray[i + 1] as number;
        p.tray[4] = 0;
        return true;
      }
      case 'turret':
        this.createTurret(c.spot, c.id, side);
        return true;
      case 'sell': {
        const id = p.spots[c.spot - 1] as number;
        const tu = d.TU[id] as [string, number, number];
        this.removeTurret(side, c.spot);
        p.cash += Math.round(tu[1] / 2);
        return true;
      }
      case 'addon':
        p.cash -= [1000, 3000, 7500][p.addons]!;
        p.addons++;
        return true;
      case 'evolve': {
        p.tech++;
        const add = 300 * p.tech;
        const b = this.base(side);
        b.maxHealth += add;
        b.health += add;
        return true;
      }
      case 'special':
        this.startSpecial(side, p.tech);
        p.special = 0;
        return true;
    }
  }

  // ───────────── game objects ─────────────
  createEnnemy(id: number, side: Side) {
    const u = this.d.units[id] as UnitData;
    const es = this.d.ES[id] as number[];
    const en = this.d.EN[id] as [string, number, number];
    let health = es[0] as number,
      damage = es[1] as number,
      rdmg = es[2] as number;
    if (side === 2 && this.opts.ai) {
      const k = this.opts.diff === 2 ? 1.3 : this.opts.diff === 3 ? 2 : 1;
      health *= k;
      damage *= k;
      rdmg *= k;
    }
    const x = (side === 1 ? BASE1_X : BASE2_X) + this.r01(); // `_X = _X + Math.random()` in the unit script
    const unit: Unit = {
      uid: this.b,
      b: this.b,
      id,
      side,
      x,
      y: GROUND,
      health,
      rhealth: health,
      damage,
      rangeDamage: rdmg,
      speed: side === 1 ? 0.7 : -0.7,
      closestDist: side === 1 ? 300 : -300,
      ed: side === 1 ? 300 : -300,
      edId: 0,
      c: 3,
      limit: 100,
      rangeShoot: es[4] as number,
      rangeMelee: es[3] as number,
      reward: Math.round(en[1] * 1.3),
      moving: false,
      attackMelee: false,
      attackRange: false,
      dead: false,
      dc: 0,
      hit: u.hit,
      isBase: false,
      data: u,
      w: u.hit.x1 - u.hit.x0,
      h: u.hit.y1 - u.hit.y0,
      ageAura: false,
      anim: undefined as never,
    };
    unit.anim = new Anim(
      u.states,
      (op) => this.unitOp(unit, op),
      (s) => this.sound(s, unit.x),
      () => this.r01(),
    );
    unit.anim.goto('idle'); // `units.anims.stop()` — starts in the first frame
    this.units.push(unit);
    this.targets.push(unit);
    this.b++;
    this.ev({ k: 'unit', uid: unit.b, id, side });
    return unit;
  }

  private unitOp(u: Unit, op: Op) {
    if (op[0] === 'hit' || op[0] === 'rhit') {
      const t = this.find(u.edId);
      if (!t) return;
      t.health -= (op[0] === 'hit' ? u.damage : u.rangeDamage) - this.r01() * 2;
      const tt = t as Unit;
      if (!t.isBase && tt.id !== 12) this.part(2, t.x, t.y - tt.h / 1.5, 5);
    }
  }

  private createTurret(spot: number, id: number, side: Side) {
    const p = this.player(side);
    const tu = this.d.TU[id] as [string, number, number];
    const ts = this.d.TS[id] as number[];
    p.cash -= tu[1];
    p.spots[spot - 1] = id;
    const td = this.d.turrets[id] as TurretData;
    const t: TurretInst = {
      side,
      spot,
      id,
      rx: side === 1 ? SPOT_X : 1000 - SPOT_X,
      ry: GROUND + (SPOT_Y[spot - 1] as number),
      rotation: side === 2 ? -180 : 0,
      ed: 100000,
      edId: 0,
      edH: 0,
      c: 0,
      st: 0,
      shootSpeed: ts[0] as number,
      bulletId: ts[1] as number,
      damage: ts[2] as number,
      range: ts[3] as number,
      anim: undefined as never,
      data: td,
    };
    t.anim = new Anim(
      { clip: td.clip },
      (op) => {
        if (op[0] === 'shoot') this.createBullet(t.rx, t.ry, t.rotation, t.damage, String(t.bulletId), t.side);
      },
      (s) => this.sound(s, t.rx),
      () => this.r01(),
    );
    t.anim.goto('clip');
    t.anim.playing = false; // frame 1: stop();
    this.turrets.push(t);
  }
  private removeTurret(side: Side, spot: number) {
    const p = this.player(side);
    p.spots[spot - 1] = 0;
    this.turrets = this.turrets.filter((t) => !(t.side === side && t.spot === spot));
  }

  // ───────────── bullets ─────────────
  createBullet(x: number, y: number, rot: number, damage: number, kind: string, side: Side) {
    const k = /^\d+$/.test(kind) ? `b${kind}` : kind.replace('special', 's');
    const bl: Bullet = {
      bi: this.bi++,
      kind: k,
      x,
      y,
      rot,
      damage,
      side,
      xs: 0,
      ys: 0,
      g: 0,
      gf: 0.05,
      acc: 1,
      rotSpeed: 0,
      timer: 0,
      cc: 0,
      removed: false,
    };
    const r = rot * DEG;
    const sn = dsin(r),
      cs = dcos(r);
    switch (k) {
      case 'b1':
      case 'b2':
        bl.ys = 7 * sn;
        bl.xs = 7 * cs;
        bl.x += bl.xs * (k === 'b1' ? 5 : 4);
        bl.y += bl.ys * (k === 'b1' ? 5 : 4);
        if (k === 'b2') bl.rotSpeed = this.rnd(6) - 3;
        break;
      case 'b3':
      case 'b4':
        bl.ys = 7 * sn;
        bl.xs = 7 * cs;
        bl.y += side === 1 ? -bl.xs * 5 : bl.xs * 5;
        break;
      case 'b5':
        bl.x += side === 1 ? 116 : -116;
        bl.y += 7;
        bl.timer = 40;
        break;
      case 'b6':
      case 'b7':
      case 'b8':
        bl.ys = 7 * sn;
        bl.xs = 7 * cs;
        bl.x += bl.xs * 5;
        bl.y += bl.ys * 5;
        bl.gf = 0.02;
        break;
      case 'b9':
      case 'b10':
      case 'b11':
      case 'b12': {
        bl.ys = 0.2 * sn;
        bl.xs = 0.2 * cs;
        const m = k === 'b9' ? 200 : k === 'b10' ? 42 : k === 'b11' ? 42 : 100;
        bl.x += bl.xs * m;
        bl.y += bl.ys * m;
        bl.acc = 1.01;
        bl.gf = 0.02;
        break;
      }
      case 's1':
      case 's2': {
        const rr = 80 + this.rnd(20);
        const ang = side === 1 ? rr : 180 - rr; // side 2 mirrors the strike
        bl.rot = ang;
        bl.ys = 10 * dsin(ang * DEG);
        bl.xs = 10 * dcos(ang * DEG);
        const px = this.rnd(500) + 200;
        bl.x = side === 1 ? px : WORLD_W - px;
        bl.y = -100;
        this.rnd(70); // `scale = random(70)+120` (cosmetic, keeps the stream in step)
        break;
      }
      case 's4':
      case 's5':
        bl.rot = 0;
        bl.ys = 1;
        bl.xs = side === 1 ? 4 : -4;
        bl.gf = 0.2;
        bl.rotSpeed = this.rnd(10) - 5;
        break;
    }
    this.bullets.push(bl);
  }

  /** `hitzone.hitTest(_X,_Y)` against every enemy-side entry of _root.ennemies, newest first, no early exit (as in AS) */
  private bulletHits(bl: Bullet, dmg: number, onHit?: (t: Target) => void) {
    for (let a = this.targets.length - 1; a >= 0; a--) {
      const t = this.targets[a] as Target;
      if (t.side !== bl.side && OrigSim.inBox(t, bl.x, bl.y)) {
        t.health -= dmg;
        const tt = t as Unit;
        this.part(2, t.x, t.y - (t.isBase ? t.hit.y1 - t.hit.y0 : tt.h) / 1.5, 5);
        onHit?.(t);
        bl.removed = true;
      }
    }
  }

  private stepBullet(bl: Bullet) {
    const k = bl.kind;
    switch (k) {
      case 'b1':
      case 'b3': {
        bl.g += bl.gf;
        bl.x += bl.xs;
        bl.y += bl.ys + bl.g;
        bl.rot += 2;
        if (bl.y > GROUND) {
          for (let i = 0; i < 7; i++) this.part(3, bl.x, bl.y);
          bl.removed = true;
        }
        this.bulletHits(bl, bl.damage, () => {
          for (let i = 0; i < 4; i++) this.part(3, bl.x, bl.y);
        });
        break;
      }
      case 'b2': {
        bl.g += bl.gf;
        bl.x += bl.xs;
        bl.y += bl.ys + bl.g;
        bl.rot += bl.rotSpeed;
        if (bl.y > GROUND) bl.removed = true;
        this.bulletHits(bl, bl.damage);
        break;
      }
      case 'b4': {
        bl.g += bl.gf;
        bl.x += bl.xs;
        bl.y += bl.ys + bl.g;
        bl.rot += 6;
        const par = [bl.side, bl.damage];
        if (bl.y > GROUND) {
          for (let i = 0; i < 3; i++) this.spawnFrag(5, bl.x, bl.y, par);
          this.part(6, bl.x, bl.y, ...par);
          this.part(7, bl.x, bl.y, ...par);
          bl.removed = true;
        }
        this.bulletHits(bl, bl.damage, () => {
          for (let i = 0; i < 3; i++) this.spawnFrag(5, bl.x, bl.y, par);
          this.part(7, bl.x, bl.y, ...par);
        });
        break;
      }
      case 'b5': {
        bl.timer--;
        bl.cc++;
        if (bl.cc === 2) {
          this.spawnFrag(8, bl.x, bl.y, [bl.side, bl.damage]);
          bl.cc = 0;
        }
        if (bl.timer <= 0) bl.removed = true;
        break;
      }
      case 'b6':
      case 'b7':
      case 'b8': {
        for (let b = 3; b >= 0; b--) {
          bl.g += bl.gf;
          bl.x += bl.xs;
          bl.y += bl.ys + bl.g;
          if (bl.y > GROUND) {
            if (k === 'b6') for (let i = 0; i < 5; i++) this.part(10, bl.x, bl.y);
            if (k === 'b7') {
              for (let i = 0; i < 4; i++) this.spawnFrag(11, bl.x, bl.y, [bl.side, bl.damage]);
              this.part(7, bl.x, bl.y);
            }
            bl.removed = true;
          }
          this.bulletHits(bl, bl.damage, () => {
            if (k === 'b6') for (let i = 0; i < 5; i++) this.part(10, bl.x, bl.y);
            if (k === 'b7') {
              for (let i = 0; i < 3; i++) this.spawnFrag(11, bl.x, bl.y, [bl.side, bl.damage]);
              this.part(7, bl.x, bl.y);
            }
          });
        }
        break;
      }
      case 'b9':
      case 'b10':
      case 'b11':
      case 'b12': {
        for (let b = 7; b >= 0; b--) {
          if (k === 'b9' || bl.xs < 15) {
            bl.x += bl.xs;
            bl.y += bl.ys;
            bl.xs *= bl.acc;
            bl.ys *= bl.acc;
          }
          if (bl.y > GROUND) {
            if (k === 'b9') this.part(7, bl.x, bl.y);
            bl.removed = true;
          }
          this.bulletHits(bl, bl.damage, () => {
            if (k === 'b9') this.part(7, bl.x, bl.y);
          });
        }
        break;
      }
      case 's1':
      case 's2': {
        bl.g += bl.gf;
        bl.x += bl.xs;
        bl.y += bl.ys + bl.g;
        if (k === 's1') {
          bl.cc++;
          if (bl.cc === 1) {
            this.part(4, bl.x, bl.y, bl.rot);
            bl.cc = 0;
          }
        }
        if (bl.y > GROUND) {
          if (k === 's1') for (let i = 0; i < 7; i++) this.part(3, bl.x, bl.y - 10);
          bl.removed = true;
        }
        this.bulletHits(bl, bl.damage, () => {
          if (k === 's1') for (let i = 0; i < 4; i++) this.part(3, bl.x, bl.y);
        });
        break;
      }
      case 's4':
      case 's5': {
        if (bl.g < 15) bl.g += bl.gf;
        bl.xs /= 1.02;
        bl.x += bl.xs;
        bl.y += bl.ys + bl.g;
        bl.rot += bl.rotSpeed;
        if (bl.y > GROUND) {
          if (k === 's4') this.part(12, bl.x, bl.y);
          bl.removed = true;
        }
        this.bulletHits(bl, bl.damage, () => {
          if (k === 's4') this.part(12, bl.x, bl.y);
        });
        if (k === 's5') bl.removed = true; // `this.removeMovieClip()` at the end of its first frame
        break;
      }
    }
  }

  private spawnFrag(kind: 5 | 8 | 11, x: number, y: number, params: number[]) {
    const fr: Frag = {
      kind,
      x,
      y,
      xs: 0,
      ys: 0,
      g: 0,
      gf: 0.2,
      f: 0.1,
      rot: 0,
      rotSpeed: 0,
      damage: kind === 5 ? 10 : kind === 11 ? 30 : (params[1] as number),
      side: params[0] as Side,
      removed: false,
    };
    if (kind === 8) {
      fr.g = 1;
      fr.x += this.r01() * 2 - 1;
      fr.y += this.r01() * 2 - 1;
      fr.rotSpeed = this.rnd(4) - 1.5; // `xs` is never defined in part8 → x does not drift
    } else {
      fr.rot = -90 + (this.rnd(60) - 30);
      fr.ys = 7 * dsin(fr.rot * DEG);
      fr.xs = 7 * dcos(fr.rot * DEG);
      fr.ys += this.r01();
      fr.rotSpeed = this.rnd(20) - 10;
      if (kind === 11) fr.rot = 0;
    }
    this.frags.push(fr);
  }

  private stepFrag(fr: Frag) {
    fr.g += fr.gf;
    if (fr.kind === 8) {
      fr.y += fr.g; // xs /= 1+f on an undefined xs leaves x untouched
      for (let a = this.targets.length - 1; a >= 0; a--) {
        const t = this.targets[a] as Target;
        if (t.side !== fr.side && OrigSim.inBox(t, fr.x, fr.y)) {
          t.health -= fr.damage;
          for (let i = 0; i < 3; i++) this.part(9, fr.x, fr.y);
          fr.removed = true;
        }
      }
      if (fr.y > GROUND) fr.removed = true;
      return;
    }
    fr.x += fr.xs;
    fr.y += fr.ys + fr.g;
    if (fr.kind === 5) fr.rot += fr.rotSpeed;
    if (fr.ys + fr.g > 0) {
      if (fr.y > GROUND) {
        this.part(7, fr.x, fr.y);
        this.part(6, fr.x, fr.y);
        fr.removed = true;
      }
      for (let a = this.targets.length - 1; a >= 0; a--) {
        const t = this.targets[a] as Target;
        if (t.side !== fr.side && OrigSim.inBox(t, fr.x, fr.y)) {
          t.health -= fr.damage;
          this.part(7, fr.x, fr.y);
          fr.removed = true;
        }
      }
    }
  }

  // ───────────── specials ─────────────
  private startSpecial(side: Side, tech: number) {
    if (tech === 3) {
      this.player(side).healT = 600;
      return;
    }
    const sp: SpecialFx = { kind: tech as 1 | 2 | 4 | 5, side, timer: 200, cc: 0, x: 0, y: 0, frame: 1 };
    if (tech === 4) {
      sp.y = 200;
      sp.x = side === 1 ? -100 : 1100;
    }
    if (tech === 5) {
      sp.y = GROUND;
      sp.x = side === 1 ? 150 : 850;
    }
    this.specials.push(sp);
  }

  private stepSpecial(sp: SpecialFx): boolean {
    const s = sp.side;
    switch (sp.kind) {
      case 1:
        sp.cc++;
        sp.timer--;
        if (sp.cc === 9) {
          this.createBullet(0, 0, 0, 200, 'special1', s);
          sp.cc = 0;
        }
        this.ev({ k: 'shake', amount: 10 });
        return sp.timer !== 0;
      case 2:
        sp.cc++;
        sp.timer--;
        if (sp.cc === 5) {
          this.createBullet(0, 0, 0, 200, 'special2', s);
          sp.cc = 0;
        }
        this.ev({ k: 'shake', amount: 4 });
        return sp.timer !== 0;
      case 4: {
        sp.cc++;
        if (sp.cc === 15) {
          if (s === 1 ? sp.x < 700 : sp.x > 300) {
            this.createBullet(sp.x, sp.y, 0, 400, 'special4', s);
            sp.cc = 0;
          }
        }
        sp.x += s === 1 ? 4 : -4;
        this.ev({ k: 'shake', amount: 3 });
        return s === 1 ? sp.x <= 1000 : sp.x >= 0;
      }
      case 5: {
        sp.frame++;
        sp.cc++;
        if (sp.cc === 5) {
          if (s === 1 ? sp.x < 700 : sp.x > 300) {
            this.createBullet(s === 1 ? sp.x + 30 : sp.x - 30, sp.y - 5, 0, 1000, 'special5', s);
            sp.x += s === 1 ? 50 : -50;
            sp.cc = 0;
          }
        }
        this.ev({ k: 'shake', amount: 3 });
        return sp.frame < 57;
      }
      default:
        return false;
    }
  }

  // ───────────── per-frame update ─────────────
  step(cmds1: Cmd[] = [], cmds2: Cmd[] = []) {
    if (this.winner) return;
    for (const c of cmds1) this.apply(1, c);
    for (const c of cmds2) this.apply(2, c);
    this.frame++;

    // base_player / base_comp: loss check, AI, turrets
    if (Math.round(this.base(1).health) < 0) {
      this.finish(2);
      return;
    }
    if (Math.round(this.base(2).health) < 0) {
      this.finish(1);
      return;
    }
    if (this.opts.ai) this.stepAi();
    for (const t of this.turrets) this.stepTurret(t);

    // bullets (container depth 12)
    for (const bl of this.bullets.slice()) {
      if (!bl.removed) this.stepBullet(bl);
    }
    this.bullets = this.bullets.filter((b) => !b.removed);

    // units (depth 100, creation order)
    for (const u of this.units.slice()) this.stepUnit(u);
    this.units = this.units.filter((u) => !(u.dead && u.dc > 80));

    // damaging particles (depth 200)
    for (const fr of this.frags.slice()) {
      if (!fr.removed) this.stepFrag(fr);
    }
    this.frags = this.frags.filter((f) => !f.removed);

    // menu timeline (training tray + special recharge), per human side
    for (const p of this.players) {
      if (p.side === 2 && this.opts.ai) continue;
      this.stepMenu(p);
    }
    this.specials = this.specials.filter((sp) => this.stepSpecial(sp));
    for (const p of this.players) if (p.healT > 0) p.healT--;
  }

  private finish(w: Side) {
    this.winner = w;
    this.ev({ k: 'end', winner: w });
  }

  private stepMenu(p: PlayerState) {
    if (p.special < SPECIAL_READY) p.special++; // sprite 78: `if(timer<2000) timer++`
    if (p.timer > 0) p.timer--;
    if (p.timer === 0) {
      this.createEnnemy(p.cId, p.side);
      p.cId = 0;
      p.cTimer = 0;
      p.timer = -1;
      p.tray[0] = p.tray[1] as number;
      p.tray[1] = p.tray[2] as number;
      p.tray[2] = p.tray[3] as number;
      p.tray[3] = p.tray[4] as number;
      p.tray[4] = 0;
      if (p.tray[0] !== 0) {
        const en = this.d.EN[p.tray[0]] as [string, number, number];
        p.cId = p.tray[0];
        p.timer = en[2];
        p.cTimer = en[2];
      }
    }
  }

  private stepUnit(u: Unit) {
    if (u.health > 0) {
      const heal = this.player(u.side).healT > 0;
      u.ageAura = heal;
      if (heal && u.health < u.rhealth) u.health++;
      if (Math.abs(u.closestDist) > u.limit) {
        u.x += u.speed;
        u.moving = true;
      } else u.moving = false;
      if (Math.abs(u.ed) < u.rangeMelee) {
        u.attackMelee = true;
        u.attackRange = false;
      } else if (Math.abs(u.ed) < u.rangeShoot) {
        u.attackMelee = false;
        u.attackRange = true;
      } else {
        u.attackMelee = false;
        u.attackRange = false;
      }
      const { attackMelee: m, attackRange: r, moving: mv } = u;
      if (!m && !mv && !r) u.anim.goto('idle');
      else if (m && !mv) u.anim.goto('attack');
      else if (r && mv) u.anim.goto('shootwalk');
      else if (r && !mv) u.anim.goto('shoot');
      else if (!m && mv && !r) u.anim.goto('walk');
      u.c--;
      if (u.c === 0) this.scan(u);
      u.anim.advance();
    } else {
      if (!u.dead) {
        const idx = this.targets.indexOf(u);
        if (idx >= 0) this.targets.splice(idx, 1);
        const killer = this.player(u.side === 1 ? 2 : 1);
        const owner = this.player(u.side);
        killer.cash += u.reward;
        killer.xp += u.reward * 2;
        owner.xp += Math.round(u.reward / 2);
        if (this.emit) this.ev({ k: 'cash', side: u.side === 1 ? 2 : 1, x: u.x, y: u.y - u.h, amount: u.reward });
        if (u.side === 2 && this.opts.ai) this.ai.uof--;
        for (let i = 0; i < 9; i++) this.part(2, u.x, u.y - u.h / 1.5, 1);
        u.dead = true;
      }
      u.anim.goto('die');
      u.anim.advance();
      u.dc++;
    }
  }

  /** every 5 frames: nearest blocker (any unit) and nearest enemy surface, scanning _root.ennemies newest-first */
  private scan(u: Unit) {
    u.edId = 0;
    if (u.side === 1) {
      u.closestDist = 300;
      u.ed = 300;
    } else {
      u.closestDist = -300;
      u.ed = -300;
    }
    for (let a = this.targets.length - 1; a >= 0; a--) {
      const t = this.targets[a] as Target;
      const dist = t.x - u.x;
      const tw = (t as Unit).w ?? t.hit.x1 - t.hit.x0;
      if (u.side === 1) {
        if (dist > 0) {
          if (u.closestDist > dist) {
            u.closestDist = dist;
            u.limit = Math.abs(u.w / 2) + Math.abs(tw / 2) + 2;
          }
          if (t.side !== u.side && u.ed > dist - Math.abs(tw / 2)) {
            u.ed = dist - Math.abs(tw / 2);
            u.edId = t.uid;
          }
        }
      } else if (dist < 0) {
        if (u.closestDist < dist) {
          u.closestDist = dist;
          u.limit = Math.abs(u.w / 2) + Math.abs(tw / 2) + 2;
        }
        if (t.side !== u.side && u.ed < dist + Math.abs(tw / 2)) {
          u.ed = dist + Math.abs(tw / 2);
          u.edId = t.uid;
        }
      }
    }
    u.c = 5;
  }

  private stepTurret(t: TurretInst) {
    t.c++;
    if (t.c === 10) {
      t.ed = 100000;
      for (let a = this.targets.length - 1; a >= 0; a--) {
        const o = this.targets[a] as Target;
        const dx = o.x - t.rx,
          dy = o.y - t.ry;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (o.side !== t.side && t.ed > dist) {
          t.ed = dist;
          t.edH = (o as Unit).h ?? o.hit.y1 - o.hit.y0;
          t.edId = o.uid;
        }
      }
      t.c = 0;
    }
    if (t.ed < t.range) {
      if (t.id !== 6) {
        const o = this.find(t.edId);
        if (o) t.rotation = Math.round(datan2(o.y - t.edH / 1.3 - t.ry, o.x - t.rx) * RAD2DEG);
      }
      t.st++;
      if (t.st >= t.shootSpeed) {
        t.anim.play();
        t.st = 0;
      }
    }
    t.anim.advance();
  }

  // ───────────── base_comp (the scripted opponent) ─────────────
  private stepAi() {
    const ai = this.ai;
    const p = this.players[1];
    ai.techTimer++;
    if (ai.unitLevel === 1) {
      if (ai.techTimer === 1500) ai.unitLevel++;
    } else if (ai.unitLevel === 2) {
      if (ai.techTimer === 5000) ai.unitLevel++;
    }
    if (ai.techTimer === 8000 && p.tech !== 5) {
      p.tech++;
      const b = this.base(2);
      b.health += 300 * p.tech;
      b.maxHealth += 300 * p.tech;
      ai.unitLevel = 1;
      ai.techTimer = 0;
    }
    const T = ai.techTimer;
    const ct = (spot: number, id: number) => {
      if (p.spots[spot - 1] === 0) this.createTurret(spot, id, 2);
    };
    const st = (spot: number) => {
      if (p.spots[spot - 1] !== 0) this.removeTurret(2, spot);
    };
    switch (p.tech) {
      case 1:
        if (T === 1000) ct(1, 1);
        else if (T === 4000) {
          st(1);
          ct(1, 2);
        } else if (T === 6000) {
          st(1);
          ct(1, 3);
        }
        break;
      case 2:
        if (T === 1000) {
          st(1);
          ct(1, 4);
        } else if (T === 4000) {
          p.addons = 1;
          st(1);
          ct(1, 6);
        } else if (T === 6000) ct(2, 5);
        break;
      case 3:
        if (T === 1000) {
          st(1);
          ct(1, 7);
        } else if (T === 4000) {
          p.addons = 2;
          st(2);
          ct(2, 7);
        } else if (T === 6000) {
          st(2);
          st(1);
          ct(3, 9);
        }
        break;
      case 4:
        if (T === 5000) ct(1, 10);
        else if (T === 7000) {
          p.addons = 2;
          st(3);
          st(1);
          ct(2, 11);
        }
        break;
      case 5:
        if (T === 5000) ct(1, 13);
        else if (T === 12000) {
          st(2);
          st(1);
          st(3);
          ct(2, 14);
        } else if (T === 20000) {
          p.addons = 3;
          st(2);
          st(1);
          st(3);
          if (p.spots[3] === 0) this.createTurret(4, 15, 2);
        }
        break;
    }
    ai.timer++;
    if (ai.stepTime === ai.timer) {
      ai.action = this.r01() < ai.uf ? 1 : 3;
      ai.timer = 0;
      ai.checkAction = true;
    }
    if (ai.checkAction && ai.action === 1 && ai.uTimer < -5 && ai.uof < 6) {
      let id = this.rnd(ai.unitLevel) + 1;
      id += (p.tech - 1) * 3;
      ai.willCreate = id;
      const en = this.d.EN[id] as [string, number, number];
      ai.uTimer = en[2];
      ai.uTimerTotal = en[2];
      ai.uof++;
      ai.checkAction = false;
    }
    if (ai.uTimer === 0) this.createEnnemy(ai.willCreate, 2);
    ai.uTimer--;
  }

  /** training progress 0..1 for the HUD */
  trainingProgress(side: Side): number {
    const p = this.player(side);
    return p.cTimer > 0 && p.timer > 0 ? 1 - p.timer / p.cTimer : 0;
  }

  // ───────────── hashing (desync detection) ─────────────
  hash(): number {
    let h = 0x811c9dc5;
    const f64 = new Float64Array(1);
    const u32 = new Uint32Array(f64.buffer);
    const mix = (n: number) => {
      f64[0] = n;
      h = Math.imul(h ^ (u32[0] as number), 16777619);
      h = Math.imul(h ^ (u32[1] as number), 16777619);
    };
    mix(this.frame);
    mix(this.rng.s);
    mix(this.winner);
    for (const p of this.players) {
      mix(p.cash);
      mix(p.xp);
      mix(p.tech);
      mix(p.addons);
      mix(p.timer);
      mix(p.special);
      mix(p.healT);
      for (const s of p.spots) mix(s);
      for (const s of p.tray) mix(s);
    }
    mix(this.base(1).health);
    mix(this.base(2).health);
    for (const u of this.units) {
      mix(u.uid as number);
      mix(u.x);
      mix(u.health);
      mix(u.c);
      mix(u.anim.frame);
    }
    for (const b of this.bullets) {
      mix(b.x);
      mix(b.y);
    }
    for (const f of this.frags) {
      mix(f.x);
      mix(f.y);
    }
    for (const t of this.turrets) {
      mix(t.rotation);
      mix(t.st);
      mix(t.anim.frame);
    }
    return h >>> 0;
  }
}
