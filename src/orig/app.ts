import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import { startKeepAlive } from '../lib/keepalive';
import type { Match } from '../net/match';
import { OrigAssets } from './assets';
import { Clip, Flash } from './flash';
import { GameScene } from './scene';
import { Screens } from './screens';
import { OrigAudio } from './snd';
import type { Cmd, Side } from './types';

export interface OrigHooks {
  /** "Play with a friend" pressed on the title screen */
  multiplayer(): void;
  /** a difficulty was chosen on the original screen → start a solo match */
  play(diff: 1 | 2 | 3): void;
  /** the HTML shell wants to know when a game starts/ends so it can show its own overlays */
  phase(p: 'title' | 'game' | 'result', info?: { winner?: 0 | Side; me?: Side; online?: boolean }): void;
  /** Escape / menu button */
  menu(): void;
}

const W = 650,
  H = 450;

/** Owns the Pixi canvas: the original screens, the in-game scene and the glue to a running Match. */
export class OrigApp {
  readonly app = new Application();
  assets!: OrigAssets;
  flash!: Flash;
  audio!: OrigAudio;
  private root = new Container();
  private screens: Screens | null = null;
  private scene: GameScene | null = null;
  private pauseClip: Clip | null = null;
  private frame = new Graphics();
  match: Match | null = null;
  paused = false;
  private resultShown = false;
  private loadingBuckets = new Set<number>();
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private fit = 1;
  /** `?norender` — logic only (no drawing): lets tests measure netcode without a GPU, same path as a hidden tab */
  private noRender = new URLSearchParams(location.search).has('norender');

  constructor(
    private hooks: OrigHooks,
    private base: string,
  ) {}

  async init(canvas: HTMLCanvasElement, opts: { webgpu?: boolean } = {}) {
    await this.app.init({
      canvas,
      resizeTo: window,
      antialias: true,
      background: 0x000000,
      resolution: pickResolution(),
      autoDensity: true,
      preference: opts.webgpu ? 'webgpu' : 'webgl',
    });
    this.assets = new OrigAssets(this.base);
    await this.assets.init();
    this.flash = new Flash(this.assets);
    await this.flash.loadFonts();
    this.audio = new OrigAudio((id) => this.assets.snd(id));
    await this.assets.loadBucket('e1');
    // the next era streams in once a match starts (prefetchEras), not before the title is up
    this.app.stage.addChild(this.root);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(-5000, -5000, 10000, 10000);
    // Pixi resizes its screen from its own window listener; lay out after *its* resize event so we never use a stale size
    this.app.renderer.on('resize', () => this.layout());
    window.addEventListener('resize', () => {
      const r = pickResolution();
      if (Math.abs(this.app.renderer.resolution - r) > 0.01) this.app.renderer.resolution = r;
      this.layout();
    });
    window.addEventListener('keydown', this.keyHandler);
    // a solo game pauses by itself when the tab/app is backgrounded (online games keep running — the friend is waiting)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.match && !this.match.online && !this.paused) this.togglePause();
    });
    this.layout();
    this.showTitle();
    this.start();
    if (this.noRender) this.app.ticker.stop();
  }

  /** logical 650x450 stage coordinates → page (CSS pixel) coordinates (used by tests and overlays) */
  toPage(x: number, y: number) {
    const r = this.app.canvas.getBoundingClientRect();
    const k = this.fit * (this.app.screen.width / r.width ? r.width / this.app.screen.width : 1);
    return {
      x: r.left + (this.root.x + x * this.fit) * (r.width / this.app.screen.width),
      y: r.top + (this.root.y + y * this.fit) * (r.height / this.app.screen.height),
      k,
    };
  }

  private layout() {
    const w = this.app.screen.width,
      h = this.app.screen.height;
    this.fit = Math.min(w / W, h / H);
    this.root.scale.set(this.fit);
    this.root.position.set((w - W * this.fit) / 2, (h - H * this.fit) / 2);
    // crop anything that scrolls outside the 650x450 stage (the original's SWF stage clips the same way)
    this.frame.clear();
    this.root.mask = null;
    const m = new Graphics().rect(0, 0, W, H).fill(0xffffff);
    this.root.addChild(m);
    this.root.mask = m;
  }

  // ───────── lifecycle ─────────
  private clear() {
    if (this.screens) {
      this.screens.destroy({ children: true });
      this.screens = null;
    }
    if (this.scene) {
      this.scene.destroyScene();
      this.scene = null;
    }
    if (this.pauseClip) {
      this.pauseClip.destroy({ children: true });
      this.pauseClip = null;
    }
    this.paused = false;
    this.resultShown = false;
  }

  showTitle(frame: number | string = 'menuframe') {
    this.clear();
    this.match?.destroy();
    this.match = null;
    this.audio.stopMusic();
    this.screens = new Screens(
      this.flash,
      this.assets,
      {
        play: (d) => this.hooks.play(d),
        multiplayer: () => this.hooks.multiplayer(),
        open: (u) => window.open(u, '_blank', 'noopener'),
      },
      frame,
    );
    this.root.addChildAt(this.screens, 0);
    this.hooks.phase('title');
  }

  /** begin showing a running match (solo or online) */
  attachMatch(m: Match) {
    this.clear();
    this.match?.destroy?.();
    this.match = m;
    m.onTick = () => this.scene?.tick();
    const me = m.side;
    const sim = m.sim;
    this.scene = new GameScene({
      assets: this.assets,
      flash: this.flash,
      audio: this.audio,
      sim,
      me,
      send: (c: Cmd) => this.send(c),
    });
    this.root.addChildAt(this.scene, 0);
    this.prefetchEras();
    this.audio.startMusic();
    this.hooks.phase('game', { me, online: m.online });
  }

  /** hand a *released* transport's match over (rematch) without recreating the Pixi objects twice */
  send(c: Cmd) {
    if (!this.paused) this.match?.command(c);
  }

  private prefetchEras() {
    const sim = this.match?.sim;
    if (!sim) return;
    const need = Math.min(5, Math.max(sim.player(1).tech, sim.player(2).tech) + 1);
    for (let e = 1; e <= need; e++)
      if (!this.loadingBuckets.has(e)) {
        this.loadingBuckets.add(e);
        void this.assets.loadBucket(`e${e}`);
      }
  }

  private start() {
    startKeepAlive(() => {
      if ((document.hidden || this.noRender) && this.match?.online && !this.paused)
        this.match.update(performance.now());
    });
    this.app.ticker.add((t) => {
      const now = performance.now();
      this.screens?.tick();
      if (this.match && this.scene) {
        if (!this.paused) this.match.update(now);
        this.scene.update(t.deltaMS);
        this.prefetchEras();
        const w = this.match.sim.winner;
        if (w && !this.resultShown) {
          this.resultShown = true;
          this.onResult(w);
        }
      }
    });
  }

  private onResult(w: 1 | 2) {
    const m = this.match as Match;
    const me = m.side;
    this.audio.stopMusic();
    // show the original victory / defeat screen after a beat
    setTimeout(() => {
      if (this.match !== m) return;
      const win = w === me;
      if (this.scene) {
        this.scene.visible = false;
      }
      this.screens = new Screens(
        this.flash,
        this.assets,
        { play: () => {}, multiplayer: () => {}, open: (u) => window.open(u, '_blank', 'noopener') },
        win ? 'win' : 'gameover',
      );
      this.root.addChild(this.screens);
      this.hooks.phase('result', { winner: w, me, online: m.online });
    }, 1200);
  }

  togglePause() {
    if (!this.match || this.match.online || this.match.sim.winner) return;
    this.paused = !this.paused;
    if (this.paused) {
      const id = this.assets.ui.rootIds.pause;
      this.pauseClip = new Clip(this.flash, id);
      this.pauseClip.position.set(325, 225);
      this.root.addChild(this.pauseClip);
      if (this.scene) this.scene.hud.visible = false;
    } else {
      this.pauseClip?.destroy({ children: true });
      this.pauseClip = null;
      if (this.scene) this.scene.hud.visible = true;
    }
  }

  private onKey(e: KeyboardEvent) {
    if (!this.scene || e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    const sim = this.match?.sim,
      me = this.match?.side;
    if (!sim || !me) return;
    if (k === ' ') {
      e.preventDefault();
      this.togglePause();
      return;
    }
    if (k === 'escape') {
      this.hooks.menu();
      return;
    }
    if (k === 'arrowleft' || k === 'a') this.scene.nudge(40);
    else if (k === 'arrowright' || k === 'd') this.scene.nudge(-40);
    else if (k >= '1' && k <= '4') {
      const p = sim.player(me);
      const id = k === '4' ? 16 : (p.tech - 1) * 3 + Number(k);
      this.send({ t: 'tray', id });
    } else if (k === 'q') this.send({ t: 'special' });
    else if (k === 'e') this.send({ t: 'evolve' });
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.clear();
    this.app.destroy(false, { children: true });
  }
}

/** sharp on HiDPI screens, but never more than ~9 megapixels of canvas (keeps phones/laptops smooth) */
function pickResolution(): number {
  const dpr = window.devicePixelRatio || 1;
  const px = window.innerWidth * window.innerHeight;
  return Math.max(1, Math.min(dpr, 3, Math.sqrt(9_000_000 / Math.max(1, px))));
}
