import { Container, Graphics, Matrix, Rectangle, Sprite } from 'pixi.js';
import type { OrigAssets } from './assets';
import { Atomic, Button, Clip, type Flash, TextField, walk } from './flash';
import { Particles } from './particles';
import { type Bullet, type Frag, GROUND, type OrigSim, type TurretInst, type Unit, WORLD_W } from './sim';
import { Smooth } from './smooth';
import type { OrigAudio } from './snd';
import type { Cmd, Side, UnitData } from './types';

const BULLET_SPRITE: Record<string, number> = {
  b1: 917,
  b2: 888,
  b3: 915,
  b4: 902,
  b5: 901,
  b6: 913,
  b7: 911,
  b8: 909,
  b9: 907,
  b10: 905,
  b11: 904,
  b12: 903,
  s1: 896,
  s2: 894,
  s4: 892,
  s5: 890,
};
/** the camera may go a bit past the world edges so the whole base art is visible */
const EDGE_PAD = 56;
/** keyboard camera speed, world px per second */
const KEY_SPEED = 640;
const DEG = Math.PI / 180;
const M = (m: { a: number; b: number; c: number; d: number; tx: number; ty: number }) =>
  new Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty);

class UnitView extends Container {
  private flip = new Container();
  private animC = new Container();
  private img = new Sprite();
  private shadow: Sprite | null = null;
  private aura: Container;
  private hb: Clip;
  private curLabel = '';
  readonly sm = new Smooth();
  constructor(
    private scene: GameScene,
    readonly u: Unit,
  ) {
    super();
    const data = u.data as UnitData;
    if (data.shadow) {
      const s = scene.assets.sprite(`h${data.shadow.id}`);
      if (s) {
        const w = new Container();
        w.setFromMatrix(M(data.shadow.m));
        w.addChild(s);
        this.flip.addChild(w);
      }
    }
    this.animC.addChild(this.img);
    this.flip.addChild(this.animC);
    this.flip.scale.x = u.side === 2 ? -1 : 1;
    this.addChild(this.flip);
    this.aura = new Container();
    const a = scene.assets.sprite('s698.1');
    if (a) {
      const w = new Container();
      w.position.set(0, -20.1);
      w.addChild(a);
      this.aura.addChild(w);
    }
    this.aura.visible = false;
    this.addChild(this.aura);
    this.hb = new Clip(scene.flash, 216);
    this.hb.position.set(0, -67.5);
    this.hb.visible = false;
    this.addChild(this.hb);
    this.eventMode = 'static';
    this.hitArea = new Rectangle(data.hit.x0, data.hit.y0, data.hit.x1 - data.hit.x0, data.hit.y1 - data.hit.y0);
    this.on('pointerover', () => {
      if (this.u.health > 0) this.hb.visible = true;
    });
    this.on('pointerout', () => {
      this.hb.visible = false;
    });
    this.sm.set(u.x, u.y);
    this.position.set(u.x, u.y);
    this.refresh(true);
  }
  /** a simulation tick happened */
  refresh(first = false) {
    const u = this.u;
    if (!first) this.sm.push(u.x, u.y);
    const st = (u.data as UnitData).states[u.anim.label];
    if (st) {
      if (u.anim.label !== this.curLabel) {
        this.curLabel = u.anim.label;
        this.animC.setFromMatrix(M(st.m));
      }
      const fr = this.scene.assets.frame(`s${st.id}.${u.anim.frame}`);
      if (fr) {
        this.img.texture = fr.tex;
        this.img.position.set(fr.ox, fr.oy);
        this.img.visible = true;
      } else this.img.visible = false;
    }
    this.aura.visible = u.ageAura && u.health > 0;
    const bar = (this.hb as Clip).named.hb;
    if (bar) bar.scale.x = Math.max(0, u.health / u.rhealth);
    if (u.dead) this.hb.visible = false;
  }
}

/** draw between the last two ticks */
function unitFrame(v: UnitView, a: number) {
  v.position.set(v.sm.x(a), v.sm.y(a));
}

class TurretView extends Container {
  private animC = new Container();
  private img = new Sprite();
  private inner = new Container();
  readonly sm = new Smooth();
  constructor(
    private scene: GameScene,
    readonly t: TurretInst,
  ) {
    super();
    const td = t.data;
    this.animC.setFromMatrix(M(td.m));
    this.animC.addChild(this.img);
    for (const ex of td.extra) {
      const s = scene.assets.sprite(`s${ex.id}.1`);
      if (s) {
        const w = new Container();
        w.setFromMatrix(M(ex.m));
        w.addChild(s);
        this.inner.addChild(w);
      }
    }
    this.inner.addChild(this.animC);
    if (t.side === 2) this.inner.scale.y = -1;
    this.addChild(this.inner);
    this.position.set(t.rx, t.ry);
    this.sm.set(t.rx, t.ry, t.rotation);
    this.refresh(true);
  }
  refresh(first = false) {
    if (!first) this.sm.push(this.t.rx, this.t.ry, this.t.rotation);
    const fr = this.scene.assets.frame(`s${this.t.data.clip.id}.${this.t.anim.frame}`);
    if (fr) {
      this.img.texture = fr.tex;
      this.img.position.set(fr.ox, fr.oy);
      this.img.visible = true;
    } else this.img.visible = false;
    this.rotation = this.sm.r(1) * DEG;
  }
}
/** a flying thing (bullet, debris): a holder container around its sprite, reused from a pool */
interface Prop {
  holder: Container;
  sm: Smooth;
}

export interface SceneOpts {
  assets: OrigAssets;
  flash: Flash;
  audio: OrigAudio;
  sim: OrigSim;
  me: Side;
  send: (c: Cmd) => void;
}

/** The whole in-game picture: scrolling world + HUD, driven by a simulation. Logical size is the original 650x450. */
export class GameScene extends Container {
  readonly assets: OrigAssets;
  readonly flash: Flash;
  private audio: OrigAudio;
  private sim: OrigSim;
  readonly me: Side;
  private cam = new Container();
  private mirror = new Container();
  private world = new Container();
  private turretsC = new Container();
  private bulletsC = new Container();
  private unitsC = new Container();
  private partC: Particles;
  private fxC = new Container();
  private units = new Map<number, UnitView>();
  private turrets = new Map<TurretInst, TurretView>();
  private bullets = new Map<Bullet, Prop>();
  private frags = new Map<Frag, Prop>();
  private specialSprites = new Map<unknown, { box: Container; sm: Smooth }>();
  private bulletPool = new Map<string, Prop[]>();
  private fragPool = new Map<string, Prop[]>();
  private baseOwn: Clip;
  private baseEnemy: Clip;
  /** width of the visible window in world pixels (650 in the original; wider on widescreen displays) */
  viewW = 650;
  scroll = 0;
  private target = 0;
  private keyDir: -1 | 0 | 1 = 0;
  private vel = 0;
  private shake = 0;
  /** pointer position in world-view coordinates (set by the app), -1 = outside */
  mx = -1;
  my = -1;
  private hitText: TextField[] = [];

  constructor(o: SceneOpts) {
    super();
    this.assets = o.assets;
    this.flash = o.flash;
    this.audio = o.audio;
    this.sim = o.sim;
    this.me = o.me;
    const mirrored = o.me === 2;
    this.addChild(this.cam);
    this.cam.addChild(this.mirror);
    if (mirrored) {
      this.mirror.scale.x = -1;
      this.mirror.x = WORLD_W;
    }
    this.mirror.addChild(this.world);
    this.partC = new Particles(o.assets, o.flash, mirrored);
    const bg = new Atomic(o.flash, 50, 1);
    // widescreen: the painted backdrop is mirrored to the left so any window width stays filled
    const bgL = new Atomic(o.flash, 50, 1);
    bgL.scale.x = -1;
    this.world.addChild(bgL, bg);
    // bases: my own base always uses the player sprite (it carries the build/sell buttons)
    const own = new Clip(o.flash, o.assets.ui.rootIds.basePlayer);
    const enemy = new Clip(o.flash, o.assets.ui.rootIds.baseComp);
    this.baseOwn = own;
    this.baseEnemy = enemy;
    const ownX = o.me === 1 ? 0 : WORLD_W,
      enemyX = o.me === 1 ? WORLD_W : 0;
    own.position.set(ownX, GROUND);
    enemy.position.set(enemyX, GROUND);
    if (o.me === 2) {
      own.scale.x = -1;
      enemy.scale.x = -1;
    }
    this.world.addChild(own, enemy, this.turretsC, this.bulletsC, this.unitsC, this.partC, this.fxC);
    this.unitsC.sortableChildren = true;
    this.cam.addChild(this.partC.overlay); // popups stay un-mirrored; Particles maps their x themselves
    // the base sprite carries the original build/sell buttons — the new HTML HUD replaces them
    for (const b of [own, enemy])
      walk(b, (c) => {
        if (c instanceof Button) c.visible = false;
      });
    // the original in-world base health bar/number is replaced by the HTML HUD bars
    for (const b of [own, enemy])
      walk(b, (c) => {
        if (c instanceof TextField && c.variable === 'h') {
          c.visible = false;
          this.hitText.push(c);
        }
      });
    for (const b of [own, enemy]) {
      // keep only the base artwork (+ its extension slots); drop the original health-bar frame and build buttons
      const keep = new Set<unknown>([b.named.base, b.named.bu, b.named.e1, b.named.e2, b.named.e3]);
      for (const c of b.children) if (!keep.has(c)) c.visible = false;
    }
    this.eventMode = 'passive';
    this.setScroll(EDGE_PAD, true);
    this.tick();
  }

  private takeProp(pool: Map<string, Prop[]>, key: string, make: () => Container): Prop {
    const free = pool.get(key)?.pop();
    if (free) {
      free.holder.visible = true;
      return free;
    }
    const holder = new Container();
    holder.addChild(make());
    (key.startsWith('b') || key.startsWith('s') ? this.bulletsC : this.fxC).addChild(holder);
    return { holder, sm: new Smooth() };
  }
  private freeProp(pool: Map<string, Prop[]>, key: string, p: Prop) {
    p.holder.visible = false;
    (pool.get(key) ?? pool.set(key, []).get(key))?.push(p);
  }

  /** place everything between the last two simulation ticks (alpha 0…1) so motion is smooth at any refresh rate */
  private interp(a: number) {
    for (const c of this.unitsC.children) unitFrame(c as UnitView, a);
    for (const v of this.turrets.values()) v.rotation = v.sm.r(a) * DEG;
    for (const v of this.bullets.values()) {
      v.holder.position.set(v.sm.x(a), v.sm.y(a));
      v.holder.rotation = v.sm.r(a) * DEG;
    }
    for (const v of this.frags.values()) {
      v.holder.position.set(v.sm.x(a), v.sm.y(a));
      v.holder.rotation = v.sm.r(a) * DEG;
    }
    for (const c of this.specialSprites.values()) c.box.position.set(c.sm.x(a), c.sm.y(a));
  }

  setViewW(w: number) {
    this.viewW = w;
    this.setScroll(this.target, true);
  }
  /** scroll limits: the whole 1000 px world is visible on very wide screens, so it is simply centred */
  private clampScroll(v: number) {
    if (this.viewW >= WORLD_W) return (this.viewW - WORLD_W) / 2;
    return Math.max(this.viewW - WORLD_W - EDGE_PAD, Math.min(EDGE_PAD, v));
  }
  /** move the camera goal; the picture eases towards it (snap = jump, used while dragging) */
  setScroll(v: number, snap = false) {
    this.target = this.clampScroll(v);
    if (snap) this.scroll = this.target;
  }
  nudge(dx: number) {
    this.setScroll(this.target + dx);
  }
  /** held arrow keys / A D: -1 = look left, +1 = look right, 0 = none */
  setKeyDir(d: -1 | 0 | 1) {
    this.keyDir = d;
  }

  /** per rendered frame: eased camera, edge-scroll (mouse near the left/right edge), screen shake, tick interpolation */
  update(dtMs: number, alpha = 1) {
    const dt = Math.min(100, dtMs);
    const k = dt / 25; // original: per 40 fps frame
    const edge = Math.min(110, this.viewW * 0.14);
    if (this.mx >= 0 && this.my < 450 && this.viewW < WORLD_W) {
      if (this.mx > this.viewW - edge) this.setScroll(this.target - ((this.mx - (this.viewW - edge)) / 10) * k);
      if (this.mx < edge) this.setScroll(this.target + ((edge - this.mx) / 10) * k);
    }
    // keyboard: smooth acceleration / deceleration instead of key-repeat steps
    const want = -this.keyDir * KEY_SPEED;
    this.vel += (want - this.vel) * (1 - Math.exp(-dt / (this.keyDir ? 120 : 90)));
    if (Math.abs(this.vel) < 0.5 && !this.keyDir) this.vel = 0;
    if (this.vel) this.setScroll(this.target + (this.vel * dt) / 1000);
    // ease the picture towards the goal (frame-rate independent)
    this.scroll += (this.target - this.scroll) * (1 - Math.exp(-dt / 55));
    if (Math.abs(this.target - this.scroll) < 0.02) this.scroll = this.target;
    this.shake = Math.max(0, this.shake - 0.4 * k);
    this.cam.x = this.scroll + (this.shake ? (Math.random() - 0.5) * this.shake : 0);
    this.cam.y = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.interp(Math.max(0, Math.min(1, alpha)));
  }

  /** once per simulation tick (40 Hz) */
  tick() {
    const sim = this.sim;
    const mirrored = this.me === 2;
    // events → particles / sound / shake
    for (const e of sim.drainEvents()) {
      if (e.k === 'part') this.partC.spawn(e.id, e.x, e.y, e.params);
      else if (e.k === 'snd') this.audio.play(e.id);
      else if (e.k === 'shake') this.shake = Math.max(this.shake, e.amount);
      else if (e.k === 'cash' && e.side === this.me) this.partC.cash(e.x, e.y, e.amount);
    }
    this.partC.tick();

    // bases
    const bar = (clip: Clip, side: Side) => {
      const p = sim.player(side);
      const b = sim.bases[side];
      const base = clip.named.base ?? clip.named.bu;
      if (base instanceof Atomic && base.frame !== p.tech) base.gotoAndStop(p.tech);
      ['e1', 'e2', 'e3'].forEach((n, i) => {
        const e = clip.named[n];
        if (e instanceof Atomic) {
          e.visible = p.addons > i;
          if (e.frame !== p.tech) e.gotoAndStop(p.tech);
        }
      });
      const hb = clip.named.hb;
      if (hb) hb.scale.y = Math.max(0, b.health / (b as unknown as { maxHealth: number }).maxHealth);
    };
    bar(this.baseOwn, this.me);
    bar(this.baseEnemy, this.me === 1 ? 2 : 1);
    for (const t of this.hitText) {
      const side = this.baseOwn.named.hb && this.isIn(t, this.baseOwn) ? this.me : this.me === 1 ? 2 : 1;
      t.text = String(Math.round(sim.bases[side].health));
      if (mirrored && !('flipped' in t)) {
        (t as unknown as { flipped: boolean }).flipped = true;
        const b = t.bounds2;
        t.scale.x = -1;
        t.x += b.x0 + b.x1;
      }
    }

    // units
    const alive = new Set<number>();
    for (const u of sim.units) {
      alive.add(u.b);
      let v = this.units.get(u.b);
      if (!v) {
        v = new UnitView(this, u);
        v.zIndex = u.b;
        this.units.set(u.b, v);
        this.unitsC.addChild(v);
      }
      v.refresh();
    }
    for (const [b, v] of this.units)
      if (!alive.has(b)) {
        v.destroy({ children: true });
        this.units.delete(b);
      }

    // turrets
    const seenT = new Set<TurretInst>();
    for (const t of sim.turrets) {
      seenT.add(t);
      let v = this.turrets.get(t);
      if (!v) {
        v = new TurretView(this, t);
        this.turrets.set(t, v);
        this.turretsC.addChild(v);
      }
      v.refresh();
    }
    for (const [t, v] of this.turrets)
      if (!seenT.has(t)) {
        v.destroy({ children: true });
        this.turrets.delete(t);
      }

    // bullets & damaging particles (pooled: eggs/arrows fly by the dozen, creating/destroying sprites would stutter)
    const seenB = new Set<Bullet>();
    for (const b of sim.bullets) {
      seenB.add(b);
      let v = this.bullets.get(b);
      if (!v) {
        v = this.takeProp(this.bulletPool, b.kind, () => {
          const sp = this.assets.sprite(`s${BULLET_SPRITE[b.kind]}.1`) ?? new Sprite();
          return sp;
        });
        if (b.kind === 's1' || b.kind === 's2') v.holder.scale.set(1.5);
        v.sm.set(b.x, b.y, b.rot);
        this.bullets.set(b, v);
      } else v.sm.push(b.x, b.y, b.rot);
    }
    for (const [b, v] of this.bullets)
      if (!seenB.has(b)) {
        this.freeProp(this.bulletPool, b.kind, v);
        this.bullets.delete(b);
      }
    const seenF = new Set<Frag>();
    for (const f of sim.frags) {
      seenF.add(f);
      let v = this.frags.get(f);
      if (!v) {
        const id = f.kind === 5 ? 899 : f.kind === 8 ? 948 : 898;
        v = this.takeProp(this.fragPool, String(id), () => this.assets.sprite(`s${id}.1`) ?? new Sprite());
        v.sm.set(f.x, f.y, f.rot);
        this.frags.set(f, v);
      } else v.sm.push(f.x, f.y, f.rot);
    }
    for (const [f, v] of this.frags)
      if (!seenF.has(f)) {
        this.freeProp(this.fragPool, String(f.kind === 5 ? 899 : f.kind === 8 ? 948 : 898), v);
        this.frags.delete(f);
      }

    // special-attack props (plane / laser strike)
    const seenS = new Set<unknown>();
    for (const sp of sim.specials) {
      if (sp.kind !== 4 && sp.kind !== 5) continue;
      seenS.add(sp);
      let c = this.specialSprites.get(sp);
      const id = sp.kind === 4 ? 973 : 976;
      if (!c) {
        c = { box: new Container(), sm: new Smooth() };
        this.fxC.addChild(c.box);
        c.sm.set(sp.x, sp.y);
        this.specialSprites.set(sp, c);
      } else c.sm.push(sp.x, sp.y);
      const fr = this.assets.frame(`s${id}.${sp.kind === 5 ? Math.min(57, sp.frame) : 1}`);
      c.box.removeChildren();
      if (fr) {
        const s = new Sprite(fr.tex);
        s.position.set(fr.ox, fr.oy);
        c.box.addChild(s);
      }
      c.box.scale.x = sp.side === 2 ? -1 : 1;
    }
    for (const [k, c] of this.specialSprites)
      if (!seenS.has(k)) {
        c.box.destroy({ children: true });
        this.specialSprites.delete(k);
      }

    this.baseOwn.tick();
    this.baseEnemy.tick();
  }

  private isIn(t: Container, root: Container): boolean {
    let p: Container | null = t;
    while (p) {
      if (p === root) return true;
      p = p.parent;
    }
    return false;
  }

  destroyScene() {
    this.partC.clear();
    this.destroy({ children: true });
  }
  /** used by the shell to hide the HUD during overlays */
  static readonly Debug = Graphics;
  readonly _unused = Button;
}
