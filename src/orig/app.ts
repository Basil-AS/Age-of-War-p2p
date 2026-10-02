import { Application, Container, Graphics } from 'pixi.js';
import { startKeepAlive } from '../lib/keepalive';
import { keyName } from '../lib/keys';
import type { Match } from '../net/match';
import { OrigAssets } from './assets';
import { Flash } from './flash';
import { MenuScene } from './menuscene';
import { GameScene } from './scene';
import { OrigAudio } from './snd';
import type { Cmd, Side } from './types';

export interface OrigHooks {
  /** the HTML shell wants to know when a game starts/ends so it can show its own overlays */
  phase(p: 'title' | 'game' | 'result', info?: { winner?: 0 | Side; me?: Side; online?: boolean }): void;
  /** Escape pressed */
  menu(): void;
  /** the game paused/resumed on its own (tab hidden, Space) */
  paused(on: boolean): void;
}

/** the original stage: 450 px tall, 650 px wide at the narrowest */
const W = 650,
  H = 450;
const MAX_VIEW_W = 2000;
const MIN_H = 280;
const SKY = 0x3fb1ff;
const DIRT = 0x6b4a26;

/**
 * Owns the Pixi canvas: the menu backdrop, the in-game world and the glue to a running Match. The HUD
 * and all menus are HTML (Svelte) on top. The world keeps the original 450 px height and simply shows
 * more of it on wide screens (the visible width is whatever fits), instead of a small 4:3 box.
 */
export class OrigApp {
  readonly app = new Application();
  assets!: OrigAssets;
  flash!: Flash;
  audio!: OrigAudio;
  private root = new Container();
  private fill = new Graphics();
  private menu: MenuScene | null = null;
  private scene: GameScene | null = null;
  match: Match | null = null;
  paused = false;
  private resultShown = false;
  private loadingBuckets = new Set<number>();
  /** pause a solo game when the window is hidden (user setting) */
  autoPause = true;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private fit = 1;
  /** logical width of the visible world window (650 on 16:9 — the original proportions — up to 2000) */
  viewW = W;
  /** screen pixels per world pixel */
  get scale() {
    return this.fit;
  }
  /** height in CSS px of the HTML control bar at the bottom: the world is laid out above it */
  private bottomInset = 0;
  private drag: { x: number; scroll: number; moved: boolean } | null = null;
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
      background: SKY,
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
    this.app.stage.addChild(this.fill, this.root);
    // Pixi resizes its screen from its own window listener; lay out after *its* resize event so we never use a stale size
    this.app.renderer.on('resize', () => this.layout());
    window.addEventListener('resize', () => {
      const r = pickResolution();
      if (Math.abs(this.app.renderer.resolution - r) > 0.01) this.app.renderer.resolution = r;
      this.layout();
    });
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.scene?.setKeyDir(0));
    this.bindPointer(canvas);
    // a solo game pauses by itself when the tab/app is backgrounded (online games keep running — the friend is waiting)
    document.addEventListener('visibilitychange', () => {
      if (this.autoPause && document.hidden && this.match && !this.match.online && !this.paused) this.setPaused(true);
    });
    this.layout();
    this.showTitle();
    this.start();
    if (this.noRender) this.app.ticker.stop();
  }

  /** the HTML control bar tells us how much of the bottom of the window it covers */
  setInsets(bottom: number) {
    if (Math.abs(bottom - this.bottomInset) < 1) return;
    this.bottomInset = bottom;
    this.layout();
  }

  /** world coordinates (view space) → page (CSS pixel) coordinates; used by tests */
  toPage(x: number, y: number) {
    const r = this.app.canvas.getBoundingClientRect();
    return {
      x: r.left + (this.root.x + x * this.fit) * (r.width / this.app.screen.width),
      y: r.top + (this.root.y + y * this.fit) * (r.height / this.app.screen.height),
      k: this.fit,
    };
  }

  private toView(clientX: number, clientY: number) {
    const r = this.app.canvas.getBoundingClientRect();
    const sx = this.app.screen.width / r.width;
    const sy = this.app.screen.height / r.height;
    return {
      x: ((clientX - r.left) * sx - this.root.x) / this.fit,
      y: ((clientY - r.top) * sy - this.root.y) / this.fit,
    };
  }

  private bindPointer(canvas: HTMLCanvasElement) {
    window.addEventListener('pointermove', (e) => {
      const p = this.toView(e.clientX, e.clientY);
      if (this.scene) {
        this.scene.mx = e.pointerType === 'mouse' ? p.x : -1;
        this.scene.my = p.y;
      }
      if (this.drag && this.scene) {
        const dx = p.x - this.drag.x;
        if (Math.abs(dx) > 4) this.drag.moved = true;
        this.scene.setScroll(this.drag.scroll + dx, true);
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.scene) return;
      this.drag = { x: this.toView(e.clientX, e.clientY).x, scroll: this.scene.scroll, moved: false };
    });
    window.addEventListener('pointerup', () => {
      this.drag = null;
    });
    document.addEventListener('pointerleave', () => {
      if (this.scene) this.scene.mx = this.scene.my = -1;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.scene) return;
        e.preventDefault();
        this.scene.nudge(-(e.deltaX || e.deltaY) / this.fit);
      },
      { passive: false },
    );
  }

  private layout() {
    const w = this.app.screen.width,
      h = this.app.screen.height;
    const availH = Math.max(120, h - this.bottomInset);
    // Keep the original proportions: the window shows ~650 world px across (units are as big, and the 1000 px
    // map as wide, as in the original). On wide screens that crops some empty sky from the top instead of
    // shrinking the units; at least MIN_H of the 450 px height always stays visible.
    let fit = Math.min(w / W, availH / MIN_H);
    fit = Math.max(fit, availH / H); // never show more than the full height
    let vw = w / fit;
    if (vw < W) {
      // narrow window (portrait): fit the width instead
      fit = w / W;
      vw = W;
    }
    vw = Math.min(vw, MAX_VIEW_W);
    const hv = Math.min(H, availH / fit); // visible world height
    this.fit = fit;
    this.viewW = vw;
    this.root.scale.set(fit);
    // bottom-anchored: the ground stays just above the control bar, the sky is what gets cropped
    const y = hv < H ? availH - H * fit : (availH - H * fit) / 2;
    this.root.position.set((w - vw * fit) / 2, y);
    // crop whatever scrolls outside the visible window
    this.root.mask = null;
    for (const c of this.root.children.filter((x) => x.label === 'mask')) c.destroy();
    const top = hv < H ? H - hv : 0;
    const m = new Graphics().rect(0, top, vw, H - top).fill(0xffffff);
    m.label = 'mask';
    this.root.addChild(m);
    this.root.mask = m;
    // sky above / earth below the world when the window is taller than the stage
    this.fill.clear();
    const bottom = this.root.y + H * fit;
    this.fill.rect(0, 0, w, h).fill(SKY);
    this.fill.rect(0, bottom, w, Math.max(0, h - bottom)).fill(DIRT);
    this.scene?.setViewW(vw);
    this.menu?.setViewW(vw);
  }

  // ───────── lifecycle ─────────
  private clear() {
    if (this.menu) {
      this.menu.destroy({ children: true });
      this.menu = null;
    }
    if (this.scene) {
      this.scene.destroyScene();
      this.scene = null;
    }
    this.paused = false;
    this.resultShown = false;
  }

  showTitle() {
    this.clear();
    this.match?.destroy();
    this.match = null;
    this.audio.stopMusic();
    this.menu = new MenuScene(this.flash, this.assets);
    this.menu.setViewW(this.viewW);
    this.root.addChildAt(this.menu, 0);
    this.hooks.phase('title');
  }

  /** begin showing a running match (solo or online) */
  attachMatch(m: Match) {
    this.clear();
    this.match?.destroy?.();
    this.match = m;
    m.onTick = () => this.scene?.tick();
    const me = m.side;
    this.scene = new GameScene({
      assets: this.assets,
      flash: this.flash,
      audio: this.audio,
      sim: m.sim,
      me,
      send: (c: Cmd) => this.send(c),
    });
    this.scene.setViewW(this.viewW);
    this.root.addChildAt(this.scene, 0);
    this.prefetchEras();
    this.audio.startMusic();
    this.hooks.phase('game', { me, online: m.online });
  }

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
      this.menu?.update(t.deltaMS);
      if (this.match && this.scene) {
        if (!this.paused) this.match.update(now);
        this.scene.update(t.deltaMS, this.match.alpha);
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
    this.audio.stopMusic();
    setTimeout(() => {
      if (this.match !== m) return;
      this.hooks.phase('result', { winner: w, me: m.side, online: m.online });
    }, 1400);
  }

  setPaused(on: boolean) {
    if (!this.match || this.match.online || this.match.sim.winner || on === this.paused) return;
    this.paused = on;
    this.hooks.paused(on);
  }
  togglePause() {
    this.setPaused(!this.paused);
  }

  /** first free turret slot (1…addons+1) or 0 */
  private freeSpot(side: Side) {
    const p = this.match?.sim.player(side);
    if (!p) return 0;
    for (let s = 1; s <= p.addons + 1; s++) if (p.spots[s - 1] === 0) return s;
    return 0;
  }

  private onKey(e: KeyboardEvent) {
    if (!this.scene || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyName(e);
    const sim = this.match?.sim,
      me = this.match?.side;
    if (!sim || !me) return;
    const p = sim.player(me);
    if (k === ' ') {
      e.preventDefault();
      if (!this.match?.online) this.hooks.menu(); // shows the pause menu and pauses
    } else if (k === 'escape') this.hooks.menu();
    else if (k === 'arrowleft' || k === 'a') {
      e.preventDefault();
      this.scene.setKeyDir(-1);
    } else if (k === 'arrowright' || k === 'd') {
      e.preventDefault();
      this.scene.setKeyDir(1);
    } else if (k >= '1' && k <= '4') this.send({ t: 'tray', id: k === '4' ? 16 : (p.tech - 1) * 3 + Number(k) });
    else if (k === 'z' || k === 'x' || k === 'c') {
      const spot = this.freeSpot(me);
      if (spot) this.send({ t: 'turret', spot, id: (p.tech - 1) * 3 + 'zxc'.indexOf(k) + 1 });
    } else if (k === 'f') this.send({ t: 'addon' });
    else if (k === 'q') this.send({ t: 'special' });
    else if (k === 'e') this.send({ t: 'evolve' });
  }

  private onKeyUp(e: KeyboardEvent) {
    const k = keyName(e);
    if (k === 'arrowleft' || k === 'a' || k === 'arrowright' || k === 'd') this.scene?.setKeyDir(0);
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
