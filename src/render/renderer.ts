import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { sfx } from '../audio';
import type { Match } from '../net/match';
import { BASE_EDGE, MAP_LEN, SIM_HZ, TURRET_SLOT_Y, TURRETS, UNITS, WALK_SPEED } from '../sim/data';
import type { Ev, Side, Troop } from '../sim/types';
import {
  animateRig,
  buildBase,
  buildRig,
  buildTurret,
  drawSlotLedge,
  type Rig,
  skyGradient,
  TEAM,
  THEMES,
} from './art';

const PAD = 80;
export const WORLD_W = MAP_LEN + PAD * 2; // 1080
const GROUND = 340; // y of the walking line inside the world
const BELOW_GROUND = 34;
const VISIBLE_H = 232 + BELOW_GROUND; // base tops (~215 above ground) … just below the ground line
const STEP = WALK_SPEED / SIM_HZ;
const UNIT_SCALE = 1.2;

interface UnitView {
  uid: number;
  rig: Rig;
  def: number;
  side: Side;
  t: number;
  atk: number; // seconds since last strike, 99 = idle
  mode: number;
  flash: number;
  hpBar: Graphics;
  lastHp: number;
  yOff: number;
}
interface TurretView {
  id: number;
  c: Container;
  barrel: Container;
  recoil: number;
}
interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  grow: number;
}
interface Proj {
  g: Graphics;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  arc: number;
  kind: string;
  spin: number;
  trail: boolean;
}
interface Float {
  t: Text;
  life: number;
  vy: number;
}
interface Fall {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: string;
  ground: number;
}

export class GameRenderer {
  app = new Application();
  private ready = false;
  private match!: Match;
  private bgG = new Graphics();
  private cloudG = new Graphics();
  private stars = new Graphics();
  private world = new Container();
  private bases: Container[] = [];
  private baseAge = [-1, -1];
  private baseBars = [new Graphics(), new Graphics()];
  private scaffolds = [new Container(), new Container()];
  private ledges: Graphics[][] = [[], []];
  private turretViews: (TurretView | null)[][] = [
    [null, null, null, null],
    [null, null, null, null],
  ];
  private units = new Map<number, UnitView>();
  private unitLayer = new Container();
  private fxLayer = new Container();
  private textLayer = new Container();
  private particles: Particle[] = [];
  private projs: Proj[] = [];
  private floats: Float[] = [];
  private falls: Fall[] = [];
  private dotTex!: Texture;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private insetTop = 70;
  private insetBottom = 150;
  private themeAge = -1;
  private cloudT = 0;
  private shake = 0;
  private lastNow = 0;
  private flashRect = new Graphics();
  private flashA = 0;
  banner: ((msg: string, kind: string) => void) | null = null;

  async init(canvas: HTMLCanvasElement, opts: { webgpu?: boolean } = {}) {
    await this.app.init({
      canvas,
      resizeTo: window,
      antialias: true,
      backgroundAlpha: 1,
      background: 0x0b1020,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: opts.webgpu ? 'webgpu' : 'webgl',
    });
    const dot = new Graphics().circle(0, 0, 8).fill(0xffffff);
    this.dotTex = this.app.renderer.generateTexture(dot);
    this.app.stage.addChild(this.bgG, this.stars, this.cloudG, this.world, this.flashRect);
    this.world.addChild(
      (this.bases[0] = new Container()),
      (this.bases[1] = new Container()),
      ...this.scaffolds,
      this.unitLayer,
      this.fxLayer,
      this.textLayer,
      ...this.baseBars,
    );
    this.unitLayer.sortableChildren = true;
    this.ready = true;
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** Renders every unit/turret once to a PNG data-URL so the HUD can show the real art. */
  async makeIcons(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const ex = this.app.renderer.extract;
    for (const u of UNITS) {
      const rig = buildRig(u, true);
      animateRig(rig, u, 0, false, 0, 0);
      out[`u${u.id}`] = await ex.base64({ target: rig.root, resolution: 2, antialias: true });
      rig.root.destroy({ children: true });
    }
    for (const t of TURRETS) {
      const tr = buildTurret(t.id, true);
      const c = new Container();
      c.addChild(tr.root);
      out[`t${t.id}`] = await ex.base64({ target: c, resolution: 3, antialias: true });
      c.destroy({ children: true });
    }
    return out;
  }

  setInsets(top: number, bottom: number) {
    this.insetTop = top;
    this.insetBottom = bottom;
    if (this.ready) this.layout();
  }

  attach(match: Match) {
    this.match = match;
    for (const v of this.units.values()) v.rig.root.destroy({ children: true });
    this.units.clear();
    for (const f of this.floats) f.t.destroy();
    this.floats = [];
    this.fxLayer.removeChildren().forEach((c) => {
      c.destroy();
    });
    this.projs = [];
    this.particles = [];
    this.falls = [];
    this.baseAge = [-1, -1];
    this.themeAge = -1;
    this.turretViews = [
      [null, null, null, null],
      [null, null, null, null],
    ];
    for (const s of this.scaffolds)
      s.removeChildren().forEach((c) => {
        c.destroy({ children: true });
      });
    this.ledges = [[], []];
    this.shake = 0;
  }

  // ── layout ──
  private layout() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const availH = Math.max(120, h - this.insetTop - this.insetBottom);
    this.scale = Math.min(w / WORLD_W, availH / VISIBLE_H);
    this.ox = (w - WORLD_W * this.scale) / 2;
    // centre the visible band (base tops → just below the ground) in the free area
    const groundY = this.insetTop + (availH - VISIBLE_H * this.scale) / 2 + (VISIBLE_H - BELOW_GROUND) * this.scale;
    this.oy = groundY - GROUND * this.scale;
    this.world.scale.set(this.scale);
    this.themeAge = -1; // force bg redraw
  }

  private vx(x: number, side = this.match.side): number {
    return PAD + (side === 0 ? x : MAP_LEN - x);
  }

  private drawBackground(age: number) {
    const th = THEMES[age] as (typeof THEMES)[number];
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const gy = this.oy + GROUND * this.scale + 6 * this.scale;
    const g = this.bgG;
    g.clear();
    g.rect(0, 0, w, gy).fill(skyGradient(th));
    // far + mid silhouettes (static parallax layers)
    const s = this.scale;
    g.poly(ridge(w, gy, 90 * s, 0.7, 11, this.ox)).fill(th.far);
    g.poly(ridge(w, gy, 46 * s, 1.3, 5, this.ox)).fill(th.mid);
    g.rect(0, gy, w, h - gy).fill(th.ground);
    g.rect(0, gy, w, 10 * s).fill(th.ground2);
    g.rect(0, gy + 38 * s, w, h).fill({ color: th.ground2, alpha: 0.35 });
    this.stars.clear();
    if (th.stars) {
      let sd = 17;
      for (let i = 0; i < 90; i++) {
        sd = (sd * 1103515245 + 12345) & 0x7fffffff;
        const x = ((sd % 1000) / 1000) * w;
        sd = (sd * 1103515245 + 12345) & 0x7fffffff;
        const y = ((sd % 1000) / 1000) * gy * 0.8;
        this.stars.circle(x, y, 0.6 + (sd % 3) * 0.4).fill({ color: 0xffffff, alpha: 0.35 + (sd % 5) * 0.12 });
      }
    }
    this.themeAge = age;
  }

  // ── main per-frame entry ──
  draw(now: number) {
    if (!this.ready || !this.match) return;
    const dtMs = this.lastNow ? Math.min(100, now - this.lastNow) : 16;
    this.lastNow = now;
    const dt = dtMs / 1000;
    const m = this.match;
    const sim = m.sim;
    const age = Math.max(sim.players[0].age, sim.players[1].age);
    if (age !== this.themeAge) this.drawBackground(age);

    this.world.position.set(this.ox + (Math.random() - 0.5) * this.shake, this.oy + (Math.random() - 0.5) * this.shake);
    this.shake = Math.max(0, this.shake - dt * 30);

    // clouds
    this.cloudT += dt * 6;
    this.drawClouds(age);

    for (const e of sim.drainEvents()) this.onEvent(e);
    this.syncBases();
    this.syncTurrets();
    this.syncUnits(dt);
    this.stepProjectiles(dt);
    this.stepFalls(dt);
    this.stepParticles(dt);
    this.stepFloats(dt);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.flashRect.clear();
    if (this.flashA > 0)
      this.flashRect
        .rect(0, 0, this.app.screen.width, this.app.screen.height)
        .fill({ color: 0xffffff, alpha: this.flashA * 0.5 });
  }

  private drawClouds(age: number) {
    const th = THEMES[age] as (typeof THEMES)[number];
    const g = this.cloudG;
    g.clear();
    const w = this.app.screen.width;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 237 + this.cloudT * (0.6 + (i % 3) * 0.3)) % (w + 240)) - 120;
      const y = this.oy + (30 + ((i * 53) % 110)) * this.scale;
      const r = (22 + (i % 3) * 8) * this.scale;
      g.ellipse(x, y, r * 2.2, r * 0.7).fill({ color: th.cloud, alpha: age === 4 ? 0.12 : 0.55 });
      g.ellipse(x - r, y + r * 0.1, r * 1.2, r * 0.55).fill({ color: th.cloud, alpha: age === 4 ? 0.1 : 0.45 });
    }
  }

  // ── bases ──
  private syncBases() {
    const sim = this.match.sim;
    const me = this.match.side;
    for (const side of [0, 1] as const) {
      const p = sim.players[side];
      const slot = side === me ? 0 : 1; // my base is always drawn on the left
      if (this.baseAge[slot] !== p.age) {
        const c = this.bases[slot] as Container;
        c.removeChildren().forEach((x) => {
          x.destroy({ children: true });
        });
        c.addChild(buildBase(p.age, side === me));
        c.scale.x = slot === 0 ? 1 : -1;
        c.position.set(slot === 0 ? PAD + BASE_EDGE : PAD + MAP_LEN - BASE_EDGE, GROUND);
        this.baseAge[slot] = p.age;
        if (p.age > 0) this.burst(c.x + (slot === 0 ? -50 : 50), GROUND - 90, 0xfacc15, 40, 220);
      }
      // hp bar
      const bar = this.baseBars[slot] as Graphics;
      const bx = slot === 0 ? PAD + BASE_EDGE - 100 : PAD + MAP_LEN - BASE_EDGE + 0;
      const frac = Math.max(0, p.baseHp / p.baseMax);
      bar.clear();
      bar.roundRect(bx, GROUND - 205, 100, 9, 4).fill({ color: 0x000000, alpha: 0.5 });
      bar
        .roundRect(bx + 1, GROUND - 204, 98 * frac, 7, 3)
        .fill(frac > 0.5 ? 0x4ade80 : frac > 0.25 ? 0xfacc15 : 0xf87171);
    }
  }

  private syncTurrets() {
    const sim = this.match.sim;
    const me = this.match.side;
    for (const side of [0, 1] as const) {
      const p = sim.players[side];
      const slotSide = side === me ? 0 : 1;
      const scaf = this.scaffolds[slotSide] as Container;
      const cx = slotSide === 0 ? PAD + BASE_EDGE + 14 : PAD + MAP_LEN - BASE_EDGE - 14;
      if (scaf.children.length === 0) {
        const post = new Graphics();
        post.rect(-14, -(TURRET_SLOT_Y[3] as number) - 4, 3, (TURRET_SLOT_Y[3] as number) + 4).fill(0x57534e);
        post.rect(11, -(TURRET_SLOT_Y[3] as number) - 4, 3, (TURRET_SLOT_Y[3] as number) + 4).fill(0x57534e);
        scaf.addChild(post);
        scaf.position.set(cx, GROUND);
        for (let s = 0; s < 4; s++) {
          const l = new Graphics();
          l.position.set(0, -(TURRET_SLOT_Y[s] as number));
          scaf.addChild(l);
          (this.ledges[slotSide] as Graphics[])[s] = l;
        }
      }
      for (let s = 0; s < 4; s++) {
        drawSlotLedgeCached((this.ledges[slotSide] as Graphics[])[s] as Graphics, s < p.slots);
        const id = p.turrets[s] ?? null;
        const cur = (this.turretViews[slotSide] as (TurretView | null)[])[s] ?? null;
        if (cur && cur.id !== id) {
          cur.c.destroy({ children: true });
          (this.turretViews[slotSide] as (TurretView | null)[])[s] = null;
        }
        if (id !== null && !(this.turretViews[slotSide] as (TurretView | null)[])[s]) {
          const t = buildTurret(id, side === me);
          t.root.position.set(0, -(TURRET_SLOT_Y[s] as number));
          if (slotSide === 1) t.root.scale.x = -1;
          scaf.addChild(t.root);
          (this.turretViews[slotSide] as (TurretView | null)[])[s] = { id, c: t.root, barrel: t.barrel, recoil: 0 };
        }
        const v = (this.turretViews[slotSide] as (TurretView | null)[])[s];
        if (v) {
          v.recoil = Math.max(0, v.recoil - 0.06);
          v.barrel.x = -v.recoil * 5;
        }
      }
    }
  }

  // ── units ──
  private syncUnits(dt: number) {
    const sim = this.match.sim;
    const me = this.match.side;
    const alpha = this.match.alpha;
    const seen = new Set<number>();
    for (const side of [0, 1] as const) {
      for (const t of sim.lanes[side] as Troop[]) {
        seen.add(t.uid);
        let v = this.units.get(t.uid);
        if (!v) v = this.makeUnit(t, side === me);
        const dir = side === 0 ? 1 : -1;
        const x = t.x + (t.moving ? dir * STEP * alpha : 0);
        v.t += dt;
        v.atk += dt;
        v.flash = Math.max(0, v.flash - dt * 6);
        const def = UNITS[t.def] as (typeof UNITS)[number];
        const mode = v.atk < 0.35 ? (def.melee > 0 && t.mode !== 2 ? 1 : t.mode || 1) : 0;
        animateRig(v.rig, def, v.t * (def.mount === 'none' ? 1 : 0.8), t.moving, Math.min(1, v.atk / 0.35), mode);
        const root = v.rig.root;
        root.position.set(this.vx(x, this.match.side), GROUND + v.yOff);
        root.scale.set(side === me ? UNIT_SCALE : -UNIT_SCALE, UNIT_SCALE);
        root.zIndex = v.yOff;
        const tint = v.flash > 0 ? 0xffffff : 0xffffff;
        void tint;
        root.alpha = 1;
        if (v.lastHp !== t.hp) {
          this.drawHp(v, t.hp / t.maxHp);
          v.lastHp = t.hp;
        }
        if (t.regenUntil > sim.tick && Math.random() < 0.08)
          this.spark(root.x + (Math.random() - 0.5) * 14, root.y - 14 - Math.random() * 18, 0x4ade80, 1);
      }
    }
    for (const [uid, v] of this.units) {
      if (seen.has(uid)) continue;
      // unit vanished → corpse ghost
      this.units.delete(uid);
      this.ghost(v);
    }
  }

  private makeUnit(t: Troop, mine: boolean): UnitView {
    const def = UNITS[t.def] as (typeof UNITS)[number];
    const rig = buildRig(def, mine);
    const hpBar = new Graphics();
    hpBar.position.set(0, -rig.height - 8);
    rig.root.addChild(hpBar);
    const v: UnitView = {
      uid: t.uid,
      rig,
      def: t.def,
      side: t.side,
      t: Math.random() * 6,
      atk: 99,
      mode: 0,
      flash: 0,
      hpBar,
      lastHp: -1,
      yOff: (((t.uid * 7) % 5) - 2) * 2.2,
    };
    this.unitLayer.addChild(rig.root);
    this.units.set(t.uid, v);
    return v;
  }

  private drawHp(v: UnitView, f: number) {
    const w = Math.max(18, v.rig.reach * 1.4);
    v.hpBar.clear();
    if (f >= 0.999) return;
    v.hpBar.rect(-w / 2, 0, w, 3.2).fill({ color: 0x000000, alpha: 0.55 });
    v.hpBar.rect(-w / 2, 0, w * Math.max(0, f), 3.2).fill(f > 0.5 ? 0x4ade80 : f > 0.25 ? 0xfacc15 : 0xf87171);
  }

  private ghost(v: UnitView) {
    const c = v.rig.root;
    v.hpBar.visible = false;
    const dir = Math.sign(c.scale.x);
    let life = 0;
    const tick = () => {
      life += 1 / 60;
      c.rotation = dir * Math.min(1.5, life * 5);
      c.y += 0.2;
      c.alpha = Math.max(0, 1 - life * 1.8);
      c.x -= dir * 0.4;
      if (life > 0.6) {
        this.app.ticker.remove(tick);
        c.destroy({ children: true });
      }
    };
    this.app.ticker.add(tick);
  }

  // ── events → visuals + sound ──
  private onEvent(e: Ev) {
    const me = this.match.side;
    switch (e.k) {
      case 'spawn': {
        sfx('spawn');
        const x = this.vx(e.x);
        this.burst(x, GROUND - 4, 0xe5e7eb, 5, 40);
        break;
      }
      case 'melee': {
        const v = this.units.get(e.uid);
        if (v) v.atk = 0;
        const tv = this.units.get(e.target);
        if (tv) tv.flash = 1;
        sfx('swing');
        break;
      }
      case 'shot':
        this.onShot(e);
        break;
      case 'hit': {
        const x = this.vx(e.x);
        const y = e.base ? GROUND - 60 : GROUND - 22;
        this.burst(x, y, e.side === me ? 0xfb7185 : 0xfde68a, e.big ? 12 : 4, e.big ? 160 : 90);
        if (e.big) {
          this.shake = Math.min(10, this.shake + 3);
        }
        if (e.base || e.dmg >= 20)
          this.floatText(`${Math.round(e.dmg)}`, x, y - 18, e.side === me ? '#fecaca' : '#fef9c3', e.big ? 17 : 13);
        sfx(e.big ? 'boom' : 'hit');
        break;
      }
      case 'die': {
        const x = this.vx(e.x);
        this.burst(x, GROUND - 18, 0xfca5a5, 10, 120);
        if (e.side !== me) {
          this.floatText(`+${e.gold}`, x, GROUND - 56, '#fde047', 15);
          sfx('coin');
        }
        break;
      }
      case 'turret':
        sfx('buy');
        break;
      case 'evolve': {
        sfx('evolve');
        this.flashA = 0.9;
        this.shake = 8;
        this.banner?.(String(e.age), e.side === me ? 'evolve-me' : 'evolve-them');
        break;
      }
      case 'special':
        this.onSpecial(e);
        break;
      case 'end':
        sfx(e.winner === me ? 'win' : 'lose');
        this.shake = 14;
        break;
    }
  }

  private onShot(e: Extract<Ev, { k: 'shot' }>) {
    const v = this.units.get(e.uid);
    if (v) v.atk = 0;
    let kind = 'bullet';
    let y0 = GROUND - 24;
    let arc = 0;
    let speed = 900;
    if (e.turret >= 0) {
      const td = TURRETS[e.turret] as (typeof TURRETS)[number];
      kind = td.proj;
      y0 = GROUND - (TURRET_SLOT_Y[e.slot] as number) - 16;
      const side = e.side === this.match.side ? 0 : 1;
      const tv = (this.turretViews[side] as (TurretView | null)[])[e.slot];
      if (tv) tv.recoil = 1;
    } else {
      const u = UNITS[e.def] as (typeof UNITS)[number];
      kind =
        u.mount === 'cannon'
          ? 'ball'
          : u.mount === 'tank'
            ? 'shell'
            : u.mount === 'mech'
              ? 'plasma'
              : u.look === 'sling'
                ? 'rock'
                : u.look === 'bow'
                  ? 'arrow'
                  : u.look === 'blaster' || u.look === 'super'
                    ? 'laser'
                    : 'bullet';
      y0 = GROUND - (u.mount === 'none' ? 26 : u.mount === 'tank' ? 40 : u.mount === 'mech' ? 70 : 38);
    }
    switch (kind) {
      case 'rock':
      case 'egg':
        speed = 380;
        arc = 22;
        break;
      case 'arrow':
        speed = 520;
        arc = 12;
        break;
      case 'catapult':
      case 'ball':
      case 'fire':
      case 'shell':
        speed = 420;
        arc = 55;
        break;
      case 'oil':
        speed = 300;
        arc = 6;
        break;
      case 'rocket':
        speed = 650;
        arc = 4;
        break;
      case 'laser':
        speed = 2400;
        break;
      case 'plasma':
        speed = 700;
        break;
      default:
        speed = 1500;
    }
    const x0 = this.vx(e.from);
    const x1 = this.vx(e.to);
    const dist = Math.abs(x1 - x0);
    const dur = Math.min(0.5, Math.max(0.05, dist / speed));
    const g = new Graphics();
    drawProjectile(g, kind);
    this.fxLayer.addChild(g);
    this.projs.push({
      g,
      x0,
      y0,
      x1,
      y1: GROUND - 22,
      t: 0,
      dur,
      arc,
      kind,
      spin: kind === 'rock' || kind === 'egg' ? 14 : 0,
      trail: kind === 'rocket' || kind === 'plasma' || kind === 'fire',
    });
    sfx(
      kind === 'arrow'
        ? 'arrow'
        : kind === 'laser' || kind === 'plasma'
          ? 'laser'
          : kind === 'ball' || kind === 'shell' || kind === 'catapult'
            ? 'boom'
            : kind === 'rock' || kind === 'egg'
              ? 'swing'
              : 'gun',
    );
    if (e.turret < 0 || kind === 'laser' || kind === 'bullet') this.spark(x0 + (x1 > x0 ? 14 : -14), y0, 0xfde047, 1);
  }

  private onSpecial(e: Extract<Ev, { k: 'special' }>) {
    const me = this.match.side;
    if (e.idx < 0) {
      this.banner?.(e.kind, e.side === me ? 'special-me' : 'special-them');
      sfx('special');
      if (e.kind === 'heal')
        for (let i = 0; i < 30; i++)
          this.spark(
            this.vx(e.side === 0 ? 40 : 860) + (Math.random() - 0.5) * 400,
            GROUND - Math.random() * 60,
            0x4ade80,
            2,
          );
      return;
    }
    const x = this.vx(e.x);
    const g = new Graphics();
    let vx = 0,
      vy = 900,
      y = -40;
    if (e.kind === 'meteors') {
      drawProjectile(g, 'meteor');
      vx = 260;
      vy = 800;
      y = -60;
    } else if (e.kind === 'arrows') {
      drawProjectile(g, 'arrow');
      g.rotation = Math.PI / 2;
      vy = 1000;
    } else if (e.kind === 'bombs') {
      drawProjectile(g, 'bomb');
      vy = 700;
    } else {
      // lasers: vertical beam
      g.rect(-3, 0, 6, GROUND).fill({ color: 0x22d3ee, alpha: 0.9 });
      g.rect(-9, 0, 18, GROUND).fill({ color: 0x22d3ee, alpha: 0.25 });
      g.position.set(x, 0);
      this.fxLayer.addChild(g);
      this.falls.push({ g, x, y: 0, vx: 0, vy: 0, kind: 'beam', ground: 0.18 });
      this.burst(x, GROUND - 12, 0x67e8f9, 14, 200);
      this.shake = Math.min(10, this.shake + 2);
      sfx('laser');
      return;
    }
    const fall = (y + 0) as number;
    void fall;
    g.position.set(x - vx * (GROUND / vy), y);
    this.fxLayer.addChild(g);
    this.falls.push({ g, x, y, vx, vy, kind: e.kind, ground: GROUND - 14 });
  }

  private stepFalls(dt: number) {
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i] as Fall;
      if (f.kind === 'beam') {
        f.ground -= dt;
        f.g.alpha = Math.max(0, f.ground / 0.18);
        if (f.ground <= 0) {
          f.g.destroy();
          this.falls.splice(i, 1);
        }
        continue;
      }
      f.g.x += f.vx * dt;
      f.g.y += f.vy * dt;
      if (f.kind === 'meteors' && Math.random() < 0.6) this.spark(f.g.x, f.g.y, 0xfb923c, 1);
      if (f.g.y >= f.ground) {
        this.burst(
          f.g.x,
          GROUND - 10,
          f.kind === 'arrows' ? 0xe5e7eb : 0xfb923c,
          f.kind === 'arrows' ? 4 : 18,
          f.kind === 'arrows' ? 60 : 220,
        );
        if (f.kind !== 'arrows') {
          this.shake = Math.min(12, this.shake + 3);
          sfx('boom');
        }
        f.g.destroy();
        this.falls.splice(i, 1);
      }
    }
  }

  private stepProjectiles(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i] as Proj;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const x = p.x0 + (p.x1 - p.x0) * k;
      const y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * p.arc;
      const dx = x - p.g.x,
        dy = y - p.g.y;
      p.g.position.set(x, y);
      if (p.spin) p.g.rotation += p.spin * dt;
      else if (dx !== 0 || dy !== 0) p.g.rotation = Math.atan2(dy, dx || 0.0001);
      if (p.trail && Math.random() < 0.7) this.spark(x, y, p.kind === 'plasma' ? 0xa78bfa : 0xfdba74, 1);
      if (k >= 1) {
        if (
          p.kind === 'ball' ||
          p.kind === 'shell' ||
          p.kind === 'catapult' ||
          p.kind === 'rocket' ||
          p.kind === 'fire'
        )
          this.burst(x, y, 0xfdba74, 8, 140);
        p.g.destroy();
        this.projs.splice(i, 1);
      }
    }
  }

  // ── particles / text ──
  private spark(x: number, y: number, color: number, size: number) {
    this.addParticle(x, y, (Math.random() - 0.5) * 30, -Math.random() * 30, color, size * 0.5, 0.35, 0);
  }
  private burst(x: number, y: number, color: number, n: number, speed: number) {
    if (this.particles.length > 450) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      this.addParticle(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s - speed * 0.3,
        color,
        0.25 + Math.random() * 0.45,
        0.35 + Math.random() * 0.35,
        380,
      );
    }
  }
  private addParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
    size: number,
    life: number,
    g: number,
  ) {
    const s = new Sprite(this.dotTex);
    s.anchor.set(0.5);
    s.tint = color;
    s.scale.set(size);
    s.position.set(x, y);
    this.fxLayer.addChild(s);
    this.particles.push({ s, vx, vy, g, life, max: life, grow: 0 });
  }
  private stepParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.alpha = p.life / p.max;
    }
  }
  private floatText(text: string, x: number, y: number, color: string, size: number) {
    if (this.floats.length > 24) return;
    const t = new Text({
      text,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '800',
        fontSize: size,
        fill: color,
        stroke: { color: '#000000', width: 3 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.textLayer.addChild(t);
    this.floats.push({ t, life: 0.9, vy: -42 });
  }
  private stepFloats(dt: number) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i] as Float;
      f.life -= dt;
      f.t.y += f.vy * dt;
      f.t.alpha = Math.min(1, f.life * 2);
      if (f.life <= 0) {
        f.t.destroy();
        this.floats.splice(i, 1);
      }
    }
  }

  destroy() {
    this.app.destroy(false, { children: true });
  }
}

const ledgeState = new WeakMap<Graphics, boolean>();
function drawSlotLedgeCached(g: Graphics, unlocked: boolean) {
  if (ledgeState.get(g) === unlocked) return;
  ledgeState.set(g, unlocked);
  drawSlotLedge(g, unlocked);
}

function ridge(w: number, gy: number, amp: number, freq: number, seed: number, phase: number): number[] {
  const pts: number[] = [0, gy];
  for (let x = 0; x <= w + 20; x += 20) {
    const y =
      gy -
      amp *
        (0.55 +
          0.25 * Math.sin((x + phase) * 0.004 * freq + seed) +
          0.2 * Math.sin((x + phase) * 0.011 * freq + seed * 2));
    pts.push(x, y);
  }
  pts.push(w, gy);
  return pts;
}

function drawProjectile(g: Graphics, kind: string) {
  switch (kind) {
    case 'rock':
      g.circle(0, 0, 3.4).fill(0x9ca3af);
      break;
    case 'egg':
      g.ellipse(0, 0, 3.4, 2.6).fill(0xfef3c7);
      break;
    case 'arrow':
      g.moveTo(-8, 0).lineTo(8, 0).stroke({ width: 1.6, color: 0xe5e7eb });
      g.poly([8, 0, 4, -2.4, 4, 2.4]).fill(0xe5e7eb);
      break;
    case 'catapult':
      g.circle(0, 0, 4.6).fill(0x6b7280);
      break;
    case 'fire':
      g.circle(0, 0, 4.6).fill(0xf97316);
      g.circle(0, 0, 2.4).fill(0xfde047);
      break;
    case 'oil':
      g.circle(0, 0, 3.6).fill(0xf59e0b);
      break;
    case 'ball':
      g.circle(0, 0, 4.2).fill(0x1f2937);
      break;
    case 'shell':
      g.ellipse(0, 0, 6, 3.2).fill(0x334155);
      g.rect(3, -2, 3, 4).fill(0xfacc15);
      break;
    case 'bullet':
      g.rect(-6, -1, 12, 2).fill(0xfde047);
      break;
    case 'rocket':
      g.rect(-7, -2, 12, 4).fill(0xe5e7eb);
      g.poly([5, -2, 10, 0, 5, 2]).fill(0xef4444);
      g.rect(-9, -1.4, 3, 2.8).fill(0xfb923c);
      break;
    case 'laser':
      g.rect(-12, -1.6, 24, 3.2).fill({ color: 0x22d3ee, alpha: 0.35 });
      g.rect(-10, -0.8, 20, 1.6).fill(0xe0ffff);
      break;
    case 'plasma':
      g.circle(0, 0, 7).fill({ color: 0x8b5cf6, alpha: 0.35 });
      g.circle(0, 0, 4).fill(0xc4b5fd);
      break;
    case 'meteor':
      g.circle(0, 0, 9).fill(0x7c2d12);
      g.circle(-2, -2, 5).fill(0xf97316);
      g.circle(-3, -3, 2.4).fill(0xfde047);
      break;
    case 'bomb':
      g.ellipse(0, 0, 4.4, 8).fill(0x1f2937);
      g.rect(-2, -11, 4, 4).fill(0x6b7280);
      break;
    default:
      g.circle(0, 0, 2).fill(0xffffff);
  }
}

export { TEAM };
