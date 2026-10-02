import { Application } from 'pixi.js';
import { OrigAssets } from './assets';
import { Clip, Flash } from './flash';
import { GameScene } from './scene';
import { OrigSim } from './sim';
import { OrigAudio } from './snd';
import type { Cmd } from './types';

const q = new URLSearchParams(location.search);
const app = new Application();
await app.init({
  canvas: document.getElementById('c') as HTMLCanvasElement,
  width: 651,
  height: 451,
  background: 0x000000,
  antialias: true,
  resolution: 1,
});
const assets = new OrigAssets(`${import.meta.env.BASE_URL}orig/`);
await assets.init();
const flash = new Flash(assets);
await flash.loadFonts();
(assets.ui.sprites as Record<string, unknown>).main = { n: assets.ui.main.length, frames: assets.ui.main };
let root: Clip | GameScene;
const what = q.get('what') ?? 'main';
if (what === 'game') {
  await Promise.all([1, 2, 3, 4, 5].map((e) => assets.loadBucket(`e${e}`)));
  const sim = new OrigSim(assets.data, Number(q.get('seed') ?? 7), { ai: true, diff: 1 });
  const audio = new OrigAudio((id) => assets.snd(id));
  const cmds: Cmd[] = [];
  const scene = new GameScene({ assets, flash, audio, sim, me: 1, send: (c) => cmds.push(c) });
  root = scene;
  (window as unknown as Record<string, unknown>).sim = sim;
  (window as unknown as Record<string, unknown>).send = (c: Cmd) => cmds.push(c);
  (window as unknown as Record<string, unknown>).scene = scene;
  let acc = 0,
    last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= 25) {
      acc -= 25;
      sim.step(cmds.splice(0));
      scene.tick();
    }
    scene.update(16);
  });
} else if (what === 'main') {
  root = new Clip(flash, 'main' as unknown as number);
  root.gotoAndStop(Number(q.get('frame') ?? 8));
} else {
  root = new Clip(flash, assets.ui.rootIds[what as 'menu']);
}
app.stage.addChild(root);
(window as unknown as { ready: boolean }).ready = true;
