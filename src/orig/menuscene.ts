import { Container } from 'pixi.js';
import type { OrigAssets } from './assets';
import { Atomic, type Flash } from './flash';
import type { UnitData } from './types';

const WORLD_W = 1000;
const GROUND = 425;

/**
 * Living background of the new main menu: the original painted battlefield slowly panning, with a few
 * stone-age warriors marching across it. Pure decoration — no simulation.
 */
export class MenuScene extends Container {
  private cam = new Container();
  private walkers: { a: Atomic; box: Container; speed: number; x: number; dir: 1 | -1 }[] = [];
  private t = 0;
  private acc = 0;
  viewW = 650;

  constructor(flash: Flash, assets: OrigAssets) {
    super();
    this.addChild(this.cam);
    const bg = new Atomic(flash, 50, 1);
    const bgL = new Atomic(flash, 50, 1);
    bgL.scale.x = -1;
    this.cam.addChild(bgL, bg);
    const units = assets.data.units as (UnitData | null)[];
    const kinds = [1, 2, 3, 1, 2, 1];
    kinds.forEach((id, i) => {
      const u = units[id];
      const st = u?.states.walk;
      if (!st) return;
      const a = new Atomic(flash, st.id, st.n);
      a.gotoAndPlay(1 + Math.floor(Math.random() * st.n));
      const box = new Container();
      box.addChild(a);
      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      box.scale.x = dir;
      const x = (i / kinds.length) * 1400 - 200 + Math.random() * 60;
      box.position.set(x, GROUND + 12 + (i % 3) * 5);
      this.cam.addChild(box);
      this.walkers.push({ a, box, speed: 0.55 + Math.random() * 0.3, x, dir });
    });
  }

  setViewW(w: number) {
    this.viewW = w;
  }

  /** dtMs per rendered frame */
  update(dtMs: number) {
    this.t += dtMs;
    this.acc += dtMs;
    const steps = Math.min(8, Math.floor(this.acc / 25));
    this.acc -= steps * 25;
    for (let i = 0; i < steps; i++)
      for (const w of this.walkers) {
        w.a.tick();
        w.x += w.dir * w.speed;
        if (w.x > 1300) w.x = -300;
        if (w.x < -300) w.x = 1300;
        w.box.x = w.x;
      }
    // slow pan across the 1000 px world (centred when the window is wider than the world)
    if (this.viewW >= WORLD_W) this.cam.x = (this.viewW - WORLD_W) / 2;
    else {
      const range = WORLD_W - this.viewW;
      this.cam.x = -range * (0.5 - 0.5 * Math.cos(this.t / 14000));
    }
  }
}
