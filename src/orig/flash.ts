/**
 * A deliberately small Flash display-list engine (Pixi) — just enough to rebuild the original's UI trees
 * (HUD panel, buttons, cursor, pause and the main-timeline screens) from the data extracted out of the SWF.
 * Animated game objects (units, turrets, bullets…) bypass it and draw atlas frames directly.
 */
import {
  ColorMatrixFilter,
  Container,
  Graphics,
  GraphicsContext,
  GraphicsPath,
  Matrix,
  Rectangle,
  Sprite,
  Text,
} from 'pixi.js';
import type { GlyphFont, OrigAssets, UiChar, UiFrame, UiMatrix, UiPlace } from './assets';

export class FObj extends Container {
  name2 = '';
  /** advance timelines (called once per 40 fps game tick) */
  tick(): void {
    for (const c of this.children) if (c instanceof FObj) c.tick();
  }
}

const mat = (m?: UiMatrix) => new Matrix(m?.a ?? 1, m?.b ?? 0, m?.c ?? 0, m?.d ?? 1, m?.tx ?? 0, m?.ty ?? 0);
/** SWF color transform: out = in*mult + add (per channel) */
function applyCx(o: Container, cx?: { mult: number[]; add: number[] }) {
  if (!cx) {
    o.alpha = 1;
    o.tint = 0xffffff;
    o.filters = null;
    return;
  }
  o.alpha = cx.mult[3] ?? 1;
  const m = cx.mult,
    a = cx.add;
  if (a[0] || a[1] || a[2]) {
    const f = new ColorMatrixFilter();
    f.matrix = [
      m[0] ?? 1,
      0,
      0,
      0,
      (a[0] ?? 0) / 255,
      0,
      m[1] ?? 1,
      0,
      0,
      (a[1] ?? 0) / 255,
      0,
      0,
      m[2] ?? 1,
      0,
      (a[2] ?? 0) / 255,
      0,
      0,
      0,
      1,
      0,
    ];
    o.filters = [f];
  } else {
    o.filters = null;
    const cl = (v: number) => Math.max(0, Math.min(255, Math.round(255 * v)));
    o.tint = (cl(m[0] ?? 1) << 16) | (cl(m[1] ?? 1) << 8) | cl(m[2] ?? 1);
  }
}

const rgb = (c: number[] | undefined, a = 1) => ((c?.[0] ?? 0) << 16) | ((c?.[1] ?? 0) << 8) | (c?.[2] ?? 0);

const glyphCtx = new Map<string, GraphicsContext>();
/** draws text from the font outlines embedded in the SWF — pixel-for-pixel the glyph shapes the original used */
class GlyphRun extends Container {
  constructor(font: GlyphFont, fontKey: string, indices: number[], size: number, color: number, advances?: number[]) {
    super();
    let pen = 0;
    const k = size / font.em;
    indices.forEach((gi, n) => {
      const d = font.glyphs[gi];
      if (d) {
        const key = `${fontKey}:${gi}`;
        let ctx = glyphCtx.get(key);
        if (!ctx) {
          ctx = new GraphicsContext().path(new GraphicsPath(d)).fill(0xffffff);
          glyphCtx.set(key, ctx);
        }
        const g = new Graphics(ctx);
        g.tint = color;
        g.scale.set(k);
        g.x = pen;
        this.addChild(g);
      }
      pen += advances ? (advances[n] as number) : ((font.adv?.[gi] ?? 0) / font.em) * size;
    });
  }
}

export class Flash {
  fontFamily = new Map<number, string>();
  constructor(readonly assets: OrigAssets) {}

  async loadFonts() {
    const loads = Object.entries(this.assets.data.fonts).map(async ([id, file]) => {
      const fam = `aow${id}`;
      try {
        const ff = new FontFace(fam, `url(${this.assets.base}fonts/${encodeURIComponent(file)})`);
        await ff.load();
        document.fonts.add(ff);
        this.fontFamily.set(Number(id), fam);
      } catch {
        /* fall back to Arial */
      }
    });
    await Promise.all(loads);
  }
  font(fontId?: number): GlyphFont | undefined {
    return fontId === undefined ? undefined : this.assets.fonts[String(fontId)];
  }
  glyphs(fontId: number, text: string, size: number, color: number): Container | null {
    const font = this.font(fontId);
    if (!font) return null;
    const idx = [...text].map((ch) => font.codes.indexOf(ch.charCodeAt(0)));
    return new GlyphRun(
      font,
      String(fontId),
      idx.map((i) => (i < 0 ? 9999 : i)),
      size,
      color,
    );
  }
  runs(fontId: number, idx: number[], size: number, color: number, adv: number[]): Container | null {
    const font = this.font(fontId);
    return font ? new GlyphRun(font, String(fontId), idx, size, color, adv) : null;
  }
  family(fontId?: number) {
    return (fontId !== undefined && this.fontFamily.get(fontId)) || 'Arial, sans-serif';
  }

  make(id: number): FObj {
    const c = this.assets.ui.chars[String(id)] as UiChar | undefined;
    if (this.assets.ui.sprites[String(id)]) return new Clip(this, id);
    if (!c) return new FObj();
    switch (c.type) {
      case 'shape':
        return new ShapeObj(this, id);
      case 'atomic':
        return new Atomic(this, id, c.n);
      case 'button':
        return new Button(this, id, c);
      case 'edittext':
        return new TextField(this, c);
      case 'text':
        return new StaticText(this, c);
      default:
        return new FObj();
    }
  }
}

class ShapeObj extends FObj {
  constructor(f: Flash, id: number) {
    super();
    const s = f.assets.sprite(`h${id}`);
    if (s) this.addChild(s);
  }
}

/** a sprite drawn as one flat atlas image per frame */
export class Atomic extends FObj {
  frame = 1;
  playing = true;
  private img: Sprite | null = null;
  constructor(
    private f: Flash,
    readonly id: number,
    readonly n: number,
  ) {
    super();
    this.show();
  }
  gotoAndStop(n: number) {
    this.frame = Math.max(1, Math.min(this.n, Math.floor(n)));
    this.playing = false;
    this.show();
  }
  gotoAndPlay(n: number) {
    this.frame = Math.max(1, Math.min(this.n, Math.floor(n)));
    this.playing = true;
    this.show();
  }
  private show() {
    const fr = this.f.assets.frame(`s${this.id}.${this.frame}`);
    if (!this.img) {
      this.img = new Sprite();
      this.addChild(this.img);
    }
    if (fr) {
      this.img.texture = fr.tex;
      this.img.position.set(fr.ox, fr.oy);
      this.img.visible = true;
    } else this.img.visible = false;
  }
  override tick() {
    if (this.playing && this.n > 1) {
      this.frame = (this.frame % this.n) + 1;
      this.show();
    }
  }
}

export class Clip extends FObj {
  frame = 1;
  playing: boolean;
  readonly named: Record<string, FObj> = {};
  private dl = new Map<
    number,
    { id: number; obj: FObj; name?: string; clip?: number; m?: UiMatrix; cx?: { mult: number[]; add: number[] } }
  >();
  private n: number;
  private frames: UiFrame[];
  private labels: Record<string, number> = {};
  private cur = 0;
  constructor(
    private f: Flash,
    readonly id: number,
  ) {
    super();
    const sp = f.assets.ui.sprites[String(id)] as { n: number; frames: UiFrame[] };
    this.n = sp.n;
    this.frames = sp.frames;
    sp.frames.forEach((fr, i) => {
      if (fr.label) this.labels[fr.label] = i + 1;
    });
    this.playing = this.n > 1;
    this.seek(1);
  }
  gotoAndStop(x: number | string) {
    this.playing = false;
    this.seek(this.resolve(x));
  }
  gotoAndPlay(x: number | string) {
    this.playing = true;
    this.seek(this.resolve(x));
  }
  play() {
    this.playing = true;
  }
  stop() {
    this.playing = false;
  }
  private resolve(x: number | string) {
    return typeof x === 'string' ? (this.labels[x] ?? 1) : Math.max(1, Math.min(this.n, Math.floor(x)));
  }
  child(name: string): FObj | undefined {
    return this.named[name];
  }

  private place(p: UiPlace) {
    let ent = this.dl.get(p.depth);
    if (p.id !== undefined && (!ent || ent.id !== p.id)) {
      const keepM = ent?.m,
        keepCx = ent?.cx,
        keepName = ent?.name;
      if (ent) {
        this.removeChild(ent.obj);
        ent.obj.destroy({ children: true });
      }
      const obj = this.f.make(p.id);
      ent = { id: p.id, obj, name: p.name ?? keepName, m: keepM, cx: keepCx };
      if (keepM) obj.setFromMatrix(mat(keepM));
      applyCx(obj, keepCx);
      this.dl.set(p.depth, ent);
      // keep depth order
      this.addChild(obj);
      this.sortChildren();
      obj.zIndex = p.depth;
      this.sortableChildren = true;
    }
    if (!ent) return;
    if (p.name) {
      ent.name = p.name;
      this.named[p.name] = ent.obj;
    }
    if (p.clipDepth) ent.clip = p.clipDepth;
    if (p.m) {
      ent.m = p.m;
      ent.obj.setFromMatrix(mat(p.m));
    }
    if (p.cx) {
      ent.cx = p.cx;
      applyCx(ent.obj, p.cx);
    }
  }

  private seek(target: number) {
    if (target === this.cur + 1) this.applyFrame(target);
    else if (target !== this.cur) {
      for (const e of this.dl.values()) {
        this.removeChild(e.obj);
        e.obj.destroy({ children: true });
      }
      this.dl.clear();
      for (const k of Object.keys(this.named)) delete this.named[k];
      for (let i = 1; i <= target; i++) this.applyFrame(i);
    }
    this.cur = target;
    this.frame = target;
  }
  private applyFrame(i: number) {
    const fr = this.frames[i - 1] as UiFrame;
    for (const d of fr.remove) {
      const e = this.dl.get(d);
      if (e) {
        this.removeChild(e.obj);
        e.obj.destroy({ children: true });
        this.dl.delete(d);
      }
    }
    for (const p of fr.place) this.place(p);
    this.applyMasks();
    this.cur = i;
  }
  /** clipDepth: the object at `depth` masks everything above it up to `clip` */
  private applyMasks() {
    for (const [depth, e] of this.dl) {
      if (!e.clip) continue;
      const m = e.obj.children[0];
      if (!(m instanceof Sprite)) continue;
      e.obj.renderable = false; // never drawn itself, only used as the mask shape
      for (const [d2, e2] of this.dl) if (d2 > depth && d2 <= e.clip && e2.obj.mask !== m) e2.obj.mask = m;
    }
  }
  override tick() {
    if (this.playing && this.n > 1) {
      let next = this.frame + 1;
      if (next > this.n) next = 1;
      this.seek(next);
      this.runOps(this.frames[next - 1] as UiFrame);
    }
    super.tick();
  }
  private runOps(fr: UiFrame) {
    if (!fr.ops) return;
    for (const op of fr.ops) {
      if (op[0] === 'stop') this.playing = false;
      else if (op[0] === 'goto') this.seek(op[1] as number);
    }
  }
}

export interface ButtonHandlers {
  onPress?: () => void;
  onRelease?: () => void;
  onRollOver?: () => void;
  onRollOut?: () => void;
}

export class Button extends FObj {
  handlers: ButtonHandlers = {};
  wired = false;
  private sets: Record<'up' | 'over' | 'down', Container>;
  hit = new Rectangle(0, 0, 0, 0);
  enabled = true;
  constructor(
    f: Flash,
    readonly id: number,
    c: Extract<UiChar, { type: 'button' }>,
  ) {
    super();
    this.sets = { up: new Container(), over: new Container(), down: new Container() };
    let hb: Rectangle | null = null;
    for (const r of c.records) {
      const objs: [keyof typeof this.sets, number][] = [];
      if (r.states & 1) objs.push(['up', 1]);
      if (r.states & 2) objs.push(['over', 2]);
      if (r.states & 4) objs.push(['down', 4]);
      for (const [k] of objs) {
        const o = f.make(r.id);
        o.setFromMatrix(mat(r.m));
        this.sets[k].addChild(o);
      }
      if (r.states & 8 || (!hb && r.states & 1)) {
        const ch = f.assets.ui.chars[String(r.id)] as UiChar | undefined;
        const b = ch && 'bounds' in ch ? ch.bounds : null;
        if (b) {
          const x0 = r.m.a * b.x0 + r.m.tx,
            x1 = r.m.a * b.x1 + r.m.tx,
            y0 = r.m.d * b.y0 + r.m.ty,
            y1 = r.m.d * b.y1 + r.m.ty;
          const rr = new Rectangle(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
          if (r.states & 8 || !hb) hb = hb && !(r.states & 8) ? hb : hb ? union(hb, rr) : rr;
        }
      }
    }
    this.addChild(this.sets.up, this.sets.over, this.sets.down);
    this.sets.over.visible = false;
    this.sets.down.visible = false;
    if (hb) this.hit = hb;
    this.eventMode = 'static';
    this.hitArea = this.hit;
    this.cursor = 'pointer';
    const show = (s: 'up' | 'over' | 'down') => {
      const hasOver = this.sets.over.children.length > 0,
        hasDown = this.sets.down.children.length > 0;
      this.sets.up.visible = s === 'up' || (s === 'over' && !hasOver) || (s === 'down' && !hasDown && !hasOver);
      this.sets.over.visible = (s === 'over' && hasOver) || (s === 'down' && !hasDown && hasOver);
      this.sets.down.visible = s === 'down' && hasDown;
    };
    this.on('pointerover', () => {
      if (!this.enabled) return;
      show('over');
      this.handlers.onRollOver?.();
    });
    this.on('pointerout', () => {
      show('up');
      this.handlers.onRollOut?.();
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      show('down');
      this.handlers.onPress?.();
    });
    this.on('pointerup', () => {
      show('over');
      this.handlers.onRelease?.();
    });
  }
}
const union = (a: Rectangle, b: Rectangle) => {
  const x0 = Math.min(a.x, b.x),
    y0 = Math.min(a.y, b.y),
    x1 = Math.max(a.right, b.right),
    y1 = Math.max(a.bottom, b.bottom);
  return new Rectangle(x0, y0, x1 - x0, y1 - y0);
};

export class TextField extends FObj {
  private t: Text | null = null;
  private g: Container | null = null;
  variable?: string;
  private value = '';
  constructor(
    private f: Flash,
    private c: Extract<UiChar, { type: 'edittext' }>,
  ) {
    super();
    this.variable = c.variable;
    this.text = c.text ?? '';
  }
  get bounds2() {
    return this.c.bounds;
  }
  set text(v: string) {
    if (v === this.value && (this.t || this.g)) return;
    this.value = v;
    const c = this.c;
    const b = c.bounds;
    if (this.g) {
      this.g.destroy({ children: true });
      this.g = null;
    }
    if (this.t) {
      this.t.destroy();
      this.t = null;
    }
    const size = c.fontSize ?? 12;
    const g = c.fontId !== undefined && v && !c.multiline ? this.f.glyphs(c.fontId, v, size, rgb(c.color)) : null;
    if (g) {
      // right/center alignment inside the field box
      const w = g.width;
      const boxW = b.x1 - b.x0 - 4;
      g.position.set(
        b.x0 + 2 + (c.align === 1 ? boxW - w : c.align === 2 ? (boxW - w) / 2 : 0),
        b.y0 + 2 + size * 0.95,
      );
      this.g = g;
      this.addChild(g);
    } else {
      this.t = new Text({
        text: v,
        style: {
          fontFamily: this.f.family(c.fontId),
          fontSize: size,
          fill: rgb(c.color),
          align: c.align === 1 ? 'right' : c.align === 2 ? 'center' : 'left',
          wordWrap: !!c.multiline,
          wordWrapWidth: b.x1 - b.x0 - 4,
        },
      });
      this.t.position.set(b.x0 + 2, b.y0 + 2);
      this.addChild(this.t);
    }
  }
  get text() {
    return this.value;
  }
}

export class StaticText extends FObj {
  constructor(f: Flash, c: Extract<UiChar, { type: 'text' }>) {
    super();
    const inner = new Container();
    inner.setFromMatrix(mat(c.m));
    this.addChild(inner);
    let penX = 0;
    for (const run of c.runs) {
      if (run.x !== undefined) penX = run.x;
      const size = run.height ?? 12;
      const g =
        run.fontId !== undefined && run.idx ? f.runs(run.fontId, run.idx, size, rgb(run.color), run.glyphs) : null;
      if (g) {
        g.position.set(penX, run.y ?? size);
        inner.addChild(g);
      }
      penX += run.glyphs.reduce((a, b) => a + b, 0);
    }
  }
}

/** depth-first walk over a display tree */
export function walk(o: Container, fn: (c: Container) => void) {
  fn(o);
  for (const c of o.children) walk(c as Container, fn);
}
