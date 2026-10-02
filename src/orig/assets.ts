import { Assets, Rectangle, Sprite, Texture } from 'pixi.js';
import type { OrigData } from './types';

export interface FrameInfo {
  a: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}
interface Manifest {
  size: number;
  /** atlas pixels per stage pixel (3 = rendered at 3× for sharp scaling) */
  scale?: number;
  atlases: { file: string; bucket: string; w: number; h: number; bytes: number }[];
  frames: Record<string, FrameInfo>;
}

/** Lazy, bucketed access to the packed original artwork (core + ui up front, one bucket per era on demand). */
export class OrigAssets {
  data!: OrigData;
  ui!: UiData;
  fonts!: Record<string, GlyphFont>;
  manifest!: Manifest;
  private tex = new Map<string, Texture>();
  private atlasTex = new Map<number, Promise<Texture>>();
  private loadedBuckets = new Set<string>();
  constructor(readonly base: string) {}

  async init(): Promise<void> {
    const get = async <T>(f: string) => (await fetch(this.base + f)).json() as Promise<T>;
    [this.data, this.ui, this.manifest, this.fonts] = await Promise.all([
      get<OrigData>('data.json'),
      get<UiData>('ui.json'),
      get<Manifest>('manifest.json'),
      get<Record<string, GlyphFont>>('fonts.json'),
    ]);
    await Promise.all([this.loadBucket('core'), this.loadBucket('ui')]);
  }

  bucketsFor(...eras: number[]): string[] {
    return eras.map((e) => `e${e}`);
  }

  async loadBucket(bucket: string): Promise<void> {
    if (this.loadedBuckets.has(bucket)) return;
    this.loadedBuckets.add(bucket);
    const idx = this.manifest.atlases.map((a, i) => (a.bucket === bucket ? i : -1)).filter((i) => i >= 0);
    await Promise.all(idx.map((i) => this.atlas(i)));
  }

  private atlas(i: number): Promise<Texture> {
    let p = this.atlasTex.get(i);
    if (!p) {
      p = Assets.load<Texture>({
        src: this.base + (this.manifest.atlases[i] as { file: string }).file,
        data: { scaleMode: 'linear', autoGenerateMipmaps: true },
      });
      this.atlasTex.set(i, p);
    }
    return p;
  }

  /** texture + registration offset for a key like `s246.3` (sprite frame) or `h917` (shape); null if empty/unloaded */
  frame(key: string): { tex: Texture; ox: number; oy: number } | null {
    const f = this.manifest.frames[key];
    if (!f) return null;
    if (f.a < 0) return null;
    let t = this.tex.get(key);
    if (!t) {
      const atlas = this.atlasTexSync(f.a);
      if (!atlas) return null;
      // hi-res atlases: the texture keeps its original (stage-pixel) size via `orig`, so sprites need no rescaling
      const k = this.manifest.scale ?? 1;
      t = new Texture({
        source: atlas.source,
        frame: new Rectangle(f.x, f.y, f.w, f.h),
        orig: new Rectangle(0, 0, f.w / k, f.h / k),
      });
      this.tex.set(key, t);
    }
    return { tex: t, ox: f.ox, oy: f.oy };
  }
  private atlasTexSync(i: number): Texture | null {
    return Assets.get<Texture>(this.base + (this.manifest.atlases[i] as { file: string }).file) ?? null;
  }
  has(key: string) {
    return key in this.manifest.frames;
  }

  /** a ready Sprite at the registration point of `key` (child of whatever container positions the symbol) */
  sprite(key: string): Sprite | null {
    const f = this.frame(key);
    if (!f) return null;
    const s = new Sprite(f.tex);
    s.position.set(f.ox, f.oy);
    return s;
  }
  snd(id: number): string | null {
    const f = this.data.sounds[String(id)];
    return f ? `${this.base}snd/${f}` : null;
  }
}

// ── UI data (ui.json) ──
export interface UiMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}
export interface UiPlace {
  depth: number;
  id?: number;
  name?: string;
  m?: UiMatrix;
  cx?: { mult: number[]; add: number[] };
  move?: boolean;
  ratio?: number;
  clipDepth?: number;
}
export interface UiFrame {
  place: UiPlace[];
  remove: number[];
  label?: string;
  ops?: unknown[][];
  snd?: number[];
}
export interface UiSprite {
  n: number;
  frames: UiFrame[];
}
export type UiChar =
  | { type: 'shape'; bounds: { x0: number; x1: number; y0: number; y1: number } }
  | { type: 'atomic'; n: number }
  | { type: 'button'; records: { states: number; id: number; depth: number; m: UiMatrix }[] }
  | {
      type: 'edittext';
      bounds: { x0: number; x1: number; y0: number; y1: number };
      fontId?: number;
      fontSize?: number;
      color?: number[];
      align?: number;
      variable?: string;
      text?: string;
      multiline?: boolean;
    }
  | {
      type: 'text';
      bounds: { x0: number; x1: number; y0: number; y1: number };
      m: UiMatrix;
      runs: {
        glyphs: number[];
        idx?: number[];
        fontId?: number;
        color?: number[];
        x?: number;
        y?: number;
        height?: number;
      }[];
      str: string[] | null;
    }
  | { type: 'morph'; bounds: { x0: number; x1: number; y0: number; y1: number } };
export interface UiData {
  sprites: Record<string, UiSprite>;
  chars: Record<string, UiChar>;
  main: UiFrame[];
  rootIds: { menu: number; cursor: number; pause: number; basePlayer: number; baseComp: number; hb: number };
}

export interface GlyphFont {
  name: string;
  em: number;
  codes: number[];
  glyphs: string[];
  adv?: number[];
}
