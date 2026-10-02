/**
 * Cosmetic particles — transcribed from the part* / bullet scripts of the original. They never touch the
 * simulation, so they use plain Math.random() and run in each client's own time.
 */
import { Container, Sprite } from 'pixi.js';
import type { OrigAssets } from './assets';
import { Atomic, type Clip, type Flash, TextField } from './flash';
import { GROUND } from './sim';

interface P {
  obj: Container;
  step(): boolean; // false = remove
}
const R = () => Math.random();
const rnd = (n: number) => Math.floor(Math.random() * n);

export class Particles extends Container {
  private list: P[] = [];
  /** popups ("+25") live outside any mirrored container */
  readonly overlay = new Container();
  constructor(
    private assets: OrigAssets,
    private flash: Flash,
    private mirrored: boolean,
  ) {
    super();
  }

  private sprite(id: number, frame = 1): Container {
    const c = new Container();
    const s = this.assets.sprite(`s${id}.${frame}`);
    if (s) c.addChild(s);
    return c;
  }
  private add(obj: Container, x: number, y: number, step: () => boolean, overlay = false) {
    obj.position.set(x, y);
    (overlay ? this.overlay : this).addChild(obj);
    this.list.push({ obj, step });
  }

  spawn(id: number, x: number, y: number, params: number[]) {
    if (this.list.length > 500) return;
    switch (id) {
      case 1:
        return; // handled by cash()
      case 2: {
        // hit spark (949): small random piece of 946
        const n = params[0] ?? 1;
        for (let i = 0; i < n; i++) {
          const a = new Atomic(this.flash, 946, 12);
          a.gotoAndStop(rnd(12) + 1);
          let xs = R() * 2 - 1,
            g = R() * 1.5 - 1;
          const rot = rnd(4) - 1.5;
          this.add(a, x + R() * 6 - 3, y + R() * 6 - 3, () => {
            g += 0.2;
            xs /= 1.1;
            a.x += xs;
            a.y += g;
            a.rotation += rot * 0.01745;
            return a.y <= GROUND;
          });
        }
        return;
      }
      case 3:
      case 9:
      case 10: {
        const sid = id === 3 ? 929 : id === 9 ? 925 : 927;
        const c = this.sprite(sid);
        const sc = (rnd(40) + 100) / 100;
        c.scale.set(sc);
        let xs = R() * 6 - 3,
          g = -R() * 3 + 1;
        const rot = rnd(4) - 1.5;
        this.add(c, x + R() * 9 - 4, y + R() * 9 - 4, () => {
          g += 0.15;
          xs /= 1.1;
          c.x += xs;
          c.y += g;
          c.rotation += rot * 0.01745;
          return c.y <= GROUND;
        });
        return;
      }
      case 4: {
        // smoke trail of meteors
        const c = this.sprite(923);
        c.rotation = (params[0] ?? 0) * 0.01745;
        let scale = rnd(20) + 100,
          alpha = 100;
        c.scale.set(scale / 100);
        this.add(c, x + R() * 9 - 4, y + R() * 9 - 4, () => {
          c.y -= 1;
          scale -= 4;
          alpha -= 4;
          c.scale.set(Math.max(0, scale) / 100);
          c.alpha = Math.max(0, alpha / 100);
          return !(alpha <= 0 || scale <= 0 || c.y > GROUND);
        });
        return;
      }
      case 6: {
        // fading dust (933)
        const c = this.sprite(933);
        let alpha = 100;
        this.add(c, x + R() * 6 - 3, y + R() * 6 - 3, () => {
          alpha -= 1;
          c.alpha = alpha / 100;
          return alpha > 0;
        });
        return;
      }
      case 7:
      case 12: {
        // 40-frame explosion
        const sid = id === 7 ? 931 : 930;
        const holder = new Container();
        const sp = new Sprite();
        holder.addChild(sp);
        let f = 1;
        const show = () => {
          const fr = this.assets.frame(`s${sid}.${f}`);
          if (fr) {
            sp.texture = fr.tex;
            sp.position.set(fr.ox, fr.oy);
            sp.visible = true;
          } else sp.visible = false;
        };
        show();
        this.add(holder, x, y, () => {
          f++;
          if (f >= 28) return false;
          show();
          return true;
        });
        return;
      }
      default:
        return;
    }
  }

  /** the yellow "+N" that floats up where an enemy died */
  cash(x: number, y: number, amount: number) {
    const clip = this.flash.make(961) as Clip;
    const set = (o: Container) => {
      for (const c of o.children) {
        if (c instanceof TextField && c.variable === 'cash') c.text = `+ ${amount}`;
        set(c as Container);
      }
    };
    set(clip);
    let ymove = 3,
      alpha = 100;
    const ox = this.mirrored ? 1000 - x : x;
    this.add(
      clip,
      ox,
      y,
      () => {
        clip.y -= ymove;
        ymove /= 1.1;
        if (ymove <= 0.2) alpha -= 2;
        clip.alpha = Math.max(0, alpha / 100);
        return alpha > 0;
      },
      true,
    );
  }

  tick() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i] as P;
      if (!p.step()) {
        p.obj.destroy({ children: true });
        this.list.splice(i, 1);
      }
    }
  }
  clear() {
    for (const p of this.list) p.obj.destroy({ children: true });
    this.list = [];
  }
}
