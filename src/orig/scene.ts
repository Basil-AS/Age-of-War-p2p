import { Container, Graphics, Matrix, Rectangle, Sprite } from 'pixi.js';
import type { OrigAssets } from './assets';
import { Atomic, Button, Clip, type Flash, TextField, walk } from './flash';
import { Particles } from './particles';
import { type Bullet, type Frag, GROUND, type OrigSim, type TurretInst, type Unit, WORLD_W } from './sim';
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
    this.position.set(u.x, u.y);
    this.refresh();
  }
  refresh() {
    const u = this.u;
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
    this.position.set(u.x, u.y);
    this.aura.visible = u.ageAura && u.health > 0;
    const bar = (this.hb as Clip).named.hb;
    if (bar) bar.scale.x = Math.max(0, u.health / u.rhealth);
    if (u.dead) this.hb.visible = false;
  }
}

class TurretView extends Container {
  private animC = new Container();
  private img = new Sprite();
  private inner = new Container();
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
    this.refresh();
  }
  refresh() {
    const fr = this.scene.assets.frame(`s${this.t.data.clip.id}.${this.t.anim.frame}`);
    if (fr) {
      this.img.texture = fr.tex;
      this.img.position.set(fr.ox, fr.oy);
      this.img.visible = true;
    } else this.img.visible = false;
    this.rotation = this.t.rotation * DEG;
  }
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
  private bullets = new Map<Bullet, Sprite>();
  private frags = new Map<Frag, Sprite>();
  private specialSprites = new Map<unknown, Container>();
  private baseOwn: Clip;
  private baseEnemy: Clip;
  /** width of the visible window in world pixels (650 in the original; wider on widescreen displays) */
  viewW = 650;
  scroll = 0;
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
    this.setScroll(EDGE_PAD);
    this.tick();
  }

  setViewW(w: number) {
    this.viewW = w;
    this.setScroll(this.scroll);
  }
  /** scroll limits: the whole 1000 px world is visible on very wide screens, so it is simply centred */
  setScroll(v: number) {
    if (this.viewW >= WORLD_W) this.scroll = (this.viewW - WORLD_W) / 2;
    else this.scroll = Math.max(this.viewW - WORLD_W - EDGE_PAD, Math.min(EDGE_PAD, v));
  }
  nudge(dx: number) {
    this.setScroll(this.scroll + dx);
  }

  /** per rendered frame: camera edge-scroll (mouse near the left/right edge), screen shake */
  update(dtMs: number) {
    const k = dtMs / 25; // original: per 40 fps frame
    const edge = Math.min(110, this.viewW * 0.14);
    if (this.mx >= 0 && this.my > 90 && this.my < 450 && this.viewW < WORLD_W) {
      if (this.mx > this.viewW - edge) this.setScroll(this.scroll - ((this.mx - (this.viewW - edge)) / 10) * k);
      if (this.mx < edge) this.setScroll(this.scroll + ((edge - this.mx) / 10) * k);
    }
    this.shake = Math.max(0, this.shake - 0.4 * k);
    this.cam.x = this.scroll + (this.shake ? (Math.random() - 0.5) * this.shake : 0);
    this.cam.y = this.shake ? (Math.random() - 0.5) * this.shake : 0;
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

    // bullets & damaging particles
    const seenB = new Set<Bullet>();
    for (const b of sim.bullets) {
      seenB.add(b);
      let s = this.bullets.get(b);
      if (!s) {
        const sp = this.assets.sprite(`s${BULLET_SPRITE[b.kind]}.1`);
        s = sp ?? new Sprite();
        this.bullets.set(b, s);
        const c = new Container();
        c.addChild(s);
        this.bulletsC.addChild(c);
        (s as Sprite & { holder?: Container }).holder = c;
      }
      const h = (s as Sprite & { holder?: Container }).holder as Container;
      h.position.set(b.x, b.y);
      h.rotation = b.rot * DEG;
      if (b.kind === 's1' || b.kind === 's2') h.scale.set(1.5);
    }
    for (const [b, s] of this.bullets)
      if (!seenB.has(b)) {
        (s as Sprite & { holder?: Container }).holder?.destroy({ children: true });
        this.bullets.delete(b);
      }
    const seenF = new Set<Frag>();
    for (const f of sim.frags) {
      seenF.add(f);
      let s = this.frags.get(f);
      if (!s) {
        const id = f.kind === 5 ? 899 : f.kind === 8 ? 948 : 898;
        const sp = this.assets.sprite(`s${id}.1`) ?? new Sprite();
        const c = new Container();
        c.addChild(sp);
        this.fxC.addChild(c);
        (sp as Sprite & { holder?: Container }).holder = c;
        this.frags.set(f, sp);
        s = sp;
      }
      const h = (s as Sprite & { holder?: Container }).holder as Container;
      h.position.set(f.x, f.y);
      h.rotation = f.rot * DEG;
    }
    for (const [f, s] of this.frags)
      if (!seenF.has(f)) {
        (s as Sprite & { holder?: Container }).holder?.destroy({ children: true });
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
        c = new Container();
        this.fxC.addChild(c);
        this.specialSprites.set(sp, c);
      }
      const fr = this.assets.frame(`s${id}.${sp.kind === 5 ? Math.min(57, sp.frame) : 1}`);
      c.removeChildren();
      if (fr) {
        const s = new Sprite(fr.tex);
        s.position.set(fr.ox, fr.oy);
        c.addChild(s);
      }
      c.position.set(sp.x, sp.y);
      c.scale.x = sp.side === 2 ? -1 : 1;
    }
    for (const [k, c] of this.specialSprites)
      if (!seenS.has(k)) {
        c.destroy({ children: true });
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
