import { Container } from 'pixi.js';
import type { OrigAssets, UiChar } from './assets';
import { Button, Clip, type Flash, walk } from './flash';

export interface ScreenHandlers {
  play: (diff: 1 | 2 | 3) => void;
  multiplayer: () => void;
  open: (url: string) => void;
}

/** Replaces the original "Play more games" row with a "Play with a friend" entry, drawn with the same font. */
function patchTitle(assets: OrigAssets) {
  const c = assets.ui.chars['1012'] as Extract<UiChar, { type: 'text' }> | undefined;
  const font = assets.fonts['962'];
  if (!c || !font) return;
  const run = c.runs[3];
  if (!run?.idx) return;
  // glyph advances (in em) harvested from every static text the original drew with this font
  const emAdv = new Map<number, number>();
  for (const ch of Object.values(assets.ui.chars)) {
    if (ch.type !== 'text') continue;
    for (const r of ch.runs) {
      if (r.fontId !== 962 || !r.idx || !r.height) continue;
      r.idx.forEach((gi, i) => {
        if (!emAdv.has(gi)) emAdv.set(gi, (r.glyphs[i] as number) / (r.height as number));
      });
    }
  }
  const old = run.glyphs.reduce((a, b) => a + b, 0);
  const text = 'Play with a friend';
  const size = run.height ?? 22;
  const idx = [...text].map((ch) => font.codes.indexOf(ch.charCodeAt(0)));
  if (idx.some((i) => i < 0)) return;
  const adv = idx.map((i) => (emAdv.get(i) ?? 0.5) * size);
  const width = adv.reduce((a, b) => a + b, 0);
  const cx = (run.x ?? 0) + old / 2;
  run.idx = idx;
  run.glyphs = adv;
  run.x = cx - width / 2;
}

/** The original main-timeline screens (title, instructions, extras, difficulty, victory, defeat) from the SWF. */
export class Screens extends Container {
  private clip: Clip;
  constructor(
    flash: Flash,
    assets: OrigAssets,
    private h: ScreenHandlers,
    frame: number | string = 'menuframe',
  ) {
    super();
    patchTitle(assets);
    (assets.ui.sprites as Record<string, unknown>).main = { n: assets.ui.main.length, frames: assets.ui.main };
    this.clip = new Clip(flash, 'main' as unknown as number);
    this.addChild(this.clip);
    this.show(frame);
  }
  show(frame: number | string) {
    this.clip.gotoAndStop(frame);
    walk(this.clip, (o) => {
      if (o instanceof Button) this.wire(o);
    });
  }
  private wire(b: Button) {
    const go = (f: string) => () => this.show(f);
    const h = b.handlers;
    switch (b.id) {
      case 1019:
        h.onPress = go('sta');
        break;
      case 1020:
        h.onPress = go('ins');
        break;
      case 1021:
        h.onPress = go('ext');
        break;
      case 1022:
        h.onPress = () => this.h.multiplayer();
        break;
      case 1023:
        h.onRelease = () => this.h.open('http://louissi.newgrounds.com');
        break;
      case 992:
        h.onRelease = () => this.h.open('http://www.maxgames.com');
        break;
      case 1026:
        h.onPress = go('menuframe');
        break;
      case 1032:
        h.onPress = () => this.h.play(1);
        break;
      case 1033:
        h.onPress = () => this.h.play(2);
        break;
      case 1034:
        h.onPress = () => this.h.play(3);
        break;
      default:
        break;
    }
  }
  tick() {
    this.clip.tick();
  }
}
