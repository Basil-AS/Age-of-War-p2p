/**
 * The in-game menu panel (DefineSprite_212_menu) wired to the simulation. Behaviour is transcribed from the
 * original button / frame scripts: units menu, turrets menu, sell mode, add-turret-spot, evolve, the 5-slot
 * training tray, special attack charge, and the hover descriptions.
 */
import { Container } from 'pixi.js';
import type { OrigAssets } from './assets';
import { Atomic, Button, Clip, type Flash, TextField, walk } from './flash';
import type { OrigSim } from './sim';
import type { Cmd, Side } from './types';

const UNIT_BTN: Record<number, number> = {
  89: 1,
  92: 2,
  101: 3,
  103: 4,
  105: 5,
  107: 6,
  109: 7,
  111: 8,
  113: 9,
  115: 10,
  117: 11,
  119: 12,
  122: 13,
  138: 14,
  140: 15,
  141: 16,
};
const TURRET_BTN: Record<number, number> = {
  145: 1,
  147: 2,
  149: 3,
  151: 4,
  153: 5,
  155: 6,
  157: 7,
  159: 8,
  161: 9,
  163: 10,
  165: 11,
  167: 12,
  169: 13,
  171: 14,
  176: 15,
};
const SPECIAL_BTN: Record<number, number> = { 58: 1, 71: 2, 73: 3, 75: 4, 77: 5 };
const BUILD_BTN: Record<number, number> = { 38: 1, 39: 2, 40: 3, 41: 4 };
const SELL_BTN: Record<number, number> = { 42: 1, 43: 2, 44: 3, 45: 4 };

export type HudView = 'main' | 'units' | 'turrets';

export class Hud extends Container {
  readonly clip: Clip;
  view: HudView = 'main';
  /** cursor.mod: 1 normal, 2 placing a turret, 3 selling */
  mod: 1 | 2 | 3 = 1;
  cursorTurret = 0;
  private fields: TextField[] = [];
  private buttons: Button[] = [];
  private desc!: TextField;
  private bdesc!: TextField;
  private mt!: TextField;
  private mtShadow!: TextField;
  private baseButtons: { build: (Button | null)[]; sell: (Button | null)[] } = { build: [], sell: [] };
  onModeChange: (() => void) | null = null;

  constructor(
    private flash: Flash,
    private assets: OrigAssets,
    private sim: OrigSim,
    private side: Side,
    private send: (c: Cmd) => void,
  ) {
    super();
    this.clip = new Clip(flash, assets.ui.rootIds.menu);
    this.addChild(this.clip);
    walk(this.clip, (c) => {
      if (c instanceof TextField) this.fields.push(c);
      else if (c instanceof Button) this.buttons.push(c);
    });
    this.desc = this.clip.named.desc as TextField;
    this.bdesc = this.clip.named.bdesc as TextField;
    this.mt = this.clip.named.mt as TextField;
    this.mtShadow = this.fields.find((f) => f.variable === 'menu_text') as TextField;
    this.setView('main');
    this.update();
  }

  /** build/sell buttons live on the player's base sprite */
  bindBase(base: Clip) {
    const get = (n: string) => (base.named[n] as Button | undefined) ?? null;
    this.baseButtons = { build: [1, 2, 3, 4].map((i) => get(`b${i}`)), sell: [1, 2, 3, 4].map((i) => get(`s${i}`)) };
    for (const b of [...this.baseButtons.build, ...this.baseButtons.sell])
      if (b && !b.wired) {
        b.wired = true;
        this.wire(b);
      }
  }

  private p() {
    return this.sim.player(this.side);
  }
  private info(id: number) {
    const e = this.sim.d.EN[id] as [string, number, number];
    return `${e[1]}$ - ${e[0]}`;
  }
  private tinfo(id: number) {
    const e = this.sim.d.TU[id] as [string, number, number];
    return `${e[1]}$ - ${e[0]}`;
  }
  private say(t: string) {
    this.desc.text = t;
  }

  setView(v: HudView) {
    this.view = v;
    this.mod = 1;
    this.mt.text = v === 'main' ? 'Menu' : v === 'units' ? 'Menu - Units' : 'Menu - Turrets';
    this.say('');
    this.onModeChange?.();
  }
  startPlacing(id: number) {
    this.mod = 2;
    this.cursorTurret = id;
    this.say('');
    this.onModeChange?.();
  }
  startSelling() {
    this.mod = 3;
    this.mt.text = 'Sell a turret';
    this.say('');
    this.onModeChange?.();
  }
  cancelMode() {
    this.setView('main');
  }

  private wire(b: Button) {
    const id = b.id;
    const h = b.handlers;
    if (UNIT_BTN[id]) {
      const u = UNIT_BTN[id] as number;
      h.onPress = () => this.send({ t: 'tray', id: u });
      h.onRollOver = () => this.say(this.info(u));
      h.onRollOut = () => this.say('');
    } else if (TURRET_BTN[id]) {
      const t = TURRET_BTN[id] as number;
      h.onPress = () => {
        if (this.p().cash >= (this.sim.d.TU[t] as [string, number, number])[1]) this.startPlacing(t);
      };
      h.onRollOver = () => this.say(this.tinfo(t));
      h.onRollOut = () => this.say('');
    } else if (SPECIAL_BTN[id]) {
      h.onPress = () => {
        if (this.p().special >= 2000) this.send({ t: 'special' });
      };
    } else if (BUILD_BTN[id]) {
      h.onPress = () => {
        if (this.mod === 2) {
          this.send({ t: 'turret', spot: BUILD_BTN[id] as number, id: this.cursorTurret });
          this.setView('main');
        }
      };
    } else if (SELL_BTN[id]) {
      const spot = SELL_BTN[id] as number;
      h.onPress = () => {
        if (this.mod === 3) {
          this.send({ t: 'sell', spot });
          this.setView('main');
        }
      };
      h.onRollOver = () => {
        const tid = this.p().spots[spot - 1] as number;
        if (tid) {
          const tu = this.sim.d.TU[tid] as [string, number, number];
          this.say(`Sell ${tu[0]} for ${Math.round(tu[1] / 2)}$`);
        }
      };
      h.onRollOut = () => this.say('');
    } else {
      switch (id) {
        case 179:
          h.onPress = () => this.setView('units');
          h.onRollOver = () => this.say('Train units menu');
          h.onRollOut = () => this.say('');
          break;
        case 181:
          h.onPress = () => this.setView('turrets');
          h.onRollOver = () => this.say('Build turrets menu');
          h.onRollOut = () => this.say('');
          break;
        case 184:
          h.onPress = () => this.startSelling();
          h.onRollOver = () => this.say('Sell a turret');
          h.onRollOut = () => this.say('');
          break;
        case 186:
          h.onPress = () => this.send({ t: 'addon' });
          h.onRollOver = () => {
            const a = this.p().addons;
            this.say(a === 3 ? "Can't build any more" : `${[1000, 3000, 7500][a]}$ - Add a turret spot`);
          };
          h.onRollOut = () => this.say('');
          break;
        case 188:
          h.onPress = () => this.send({ t: 'evolve' });
          h.onRollOver = () => {
            const t = this.p().tech;
            this.say(t < 5 ? `${this.sim.d.EV[t - 1]} Xp - Evolve to next age` : 'You cannot evolve anymore');
          };
          h.onRollOut = () => this.say('');
          break;
        case 83:
        case 143:
          h.onPress = () => this.setView('main');
          h.onRollOver = () => this.say('Return to previous menu');
          h.onRollOut = () => this.say('');
          break;
        case 195:
        case 196:
          h.onPress = () => this.cancelMode();
          break;
        default:
          break;
      }
    }
  }

  /** once per rendered frame */
  update() {
    const p = this.p();
    const c = this.clip;
    for (const f of this.fields) {
      if (f.variable === '_root.cash') f.text = String(Math.floor(p.cash));
      else if (f.variable === '_root.xp') f.text = String(Math.floor(p.xp));
      else if (f.variable === 'menu_text') f.text = this.mt.text;
    }
    // age-dependent groups
    for (const n of ['bf1', 'bt1']) {
      const g = c.named[n];
      if (g instanceof Clip && g.frame !== p.tech) g.gotoAndStop(p.tech);
    }
    const mainG = c.named.m1,
      units = c.named.bf1,
      turr = c.named.bt1,
      btc = c.named.btc,
      stc = c.named.stc;
    const placing = this.mod === 2,
      selling = this.mod === 3;
    if (mainG) mainG.visible = this.view === 'main' && !placing && !selling;
    if (units) units.visible = this.view === 'units' && !placing && !selling;
    if (turr) turr.visible = this.view === 'turrets' && !placing && !selling;
    if (btc) btc.visible = placing;
    if (stc) stc.visible = selling;
    // special panel (frame = age) and its charge bar
    walk(c, (o) => {
      if (o instanceof Clip && o.named.spt) {
        /* the 78 clip */
      }
    });
    const sp = this.specialClip();
    if (sp) {
      sp.gotoAndStop(p.tech);
      const spt = sp.named.spt;
      if (spt instanceof Clip) spt.gotoAndStop(Math.max(1, Math.round(p.special / 2)));
    }
    // training progress + tray
    const prog = c.named.prog;
    if (prog) prog.scale.x = this.sim.trainingProgress(this.side) || 0.0001;
    this.bdesc.text = p.cId ? `Training ${(this.sim.d.EN[p.cId] as [string, number, number])[0]}...` : '';
    for (let i = 0; i < 5; i++) {
      const t = c.named[`t${i + 1}`];
      if (t instanceof Clip) t.gotoAndStop((p.tray[i] as number) + 1);
    }
    // (re)wire any buttons created by a frame change (age-dependent unit/turret buttons)
    walk(c, (o) => {
      if (o instanceof Button && !o.wired) {
        o.wired = true;
        this.wire(o);
      }
    });
    // base turret buttons
    this.baseButtons.build.forEach((b, i) => {
      if (b) b.visible = placing && i < p.addons + 1 && p.spots[i] === 0;
    });
    this.baseButtons.sell.forEach((b, i) => {
      if (b) b.visible = selling && p.spots[i] !== 0;
    });
  }
  private sp: Clip | null | undefined;
  private specialClip(): Clip | null {
    if (this.sp !== undefined) return this.sp;
    let found: Clip | null = null;
    walk(this.clip, (o) => {
      if (!found && o instanceof Clip && o !== this.clip && o.id === 78) found = o;
    });
    this.sp = found;
    return found;
  }
  /** keep unused import tree-shake friendly */
  static readonly Atomic = Atomic;
}
