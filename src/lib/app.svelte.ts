import { connectLadder, type Ladder, type RungId, type RungState } from '../net/connect';
import { ManualPeer } from '../net/manual';
import { type Match, OnlineMatch, SoloMatch } from '../net/match';
import { MultiTransport } from '../net/multi';
import { guestHandshake, hostHandshake } from '../net/session';
import { type Msg, makeRoomCode, normalizeCode, type Transport } from '../net/transport';
import { OrigApp } from '../orig/app';
import type { Cmd, Side } from '../orig/types';
import { healOnce } from './heal';
import { detectLang, type Key, type Lang, STRINGS } from './i18n';

export type Phase = 'loading' | 'title' | 'game' | 'result';
export type Overlay = 'none' | 'lobby' | 'menu';
export type MenuView = 'home' | 'solo' | 'friend' | 'howto' | 'settings' | 'about';

/** what the HTML HUD shows, refreshed ~10×/s from the simulation */
export interface HudState {
  me: Side;
  tech: number;
  cash: number;
  xp: number;
  evolveCost: number | null;
  canEvolve: boolean;
  hp: number;
  hpMax: number;
  eHp: number;
  eHpMax: number;
  eTech: number;
  special: number;
  specialReady: boolean;
  units: { id: number; cost: number; ok: boolean }[];
  turrets: { id: number; cost: number; ok: boolean }[];
  slots: { spot: number; open: boolean; id: number }[];
  addonCost: number | null;
  canAddon: boolean;
  tray: number[];
  progress: number;
  seconds: number;
  winner: number;
}

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const app = $state({
  phase: 'loading' as Phase,
  overlay: 'none' as Overlay,
  menu: 'home' as MenuView,
  paused: false,
  hud: null as HudState | null,
  /** HUD icons rendered from the original art: u<id> units, t<id> turrets */
  icons: {} as Record<string, string>,
  lang: detectLang() as Lang,
  name: read('aow.name', ''),
  sfx: Number(read('aow.sfx', '0.6')),
  music: Number(read('aow.musicv', '0.35')),
  musicOn: read('aow.music', '1') === '1',
  compat: read('aow.compat', '0') === '1',
  smartAi: read('aow.smartai', '1') === '1',
  speed: 1,
  lobby: {
    role: 'host' as 'host' | 'guest',
    code: '',
    link: '',
    state: 'idle' as 'idle' | 'waiting' | 'connecting' | 'connected' | 'error',
    slow: false,
    error: '',
    rungs: [] as RungState[],
    via: '' as RungId | 'manual' | '',
    manual: {
      step: 'off' as 'off' | 'offer' | 'paste-offer' | 'paste-answer' | 'show-answer' | 'connecting',
      offer: '',
      answer: '',
      error: '',
      busy: false,
    },
  },
  net: {
    online: false,
    rtt: 0,
    stalled: false,
    desync: false,
    peerLeft: false,
    delay: 0,
    via: '' as RungId | 'manual' | '',
    routes: [] as { id: string; rtt: number; alive: boolean; active: boolean }[],
  },
  rematch: { mine: false, theirs: false },
  result: { winner: 0 as 0 | 1 | 2, me: 1 as Side, online: false },
  peerName: '',
  loadError: '',
});

let orig: OrigApp | null = null;
let match: Match | null = null;
let transport: Transport | null = null;
let ladder: Ladder | null = null;
let manual: ManualPeer | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

export const getOrig = () => orig;
export const getMatch = () => match;

export function setLang(l: Lang) {
  app.lang = l;
  document.documentElement.lang = l;
  write('aow.lang', l);
}
export function setName(n: string) {
  app.name = n.slice(0, 16);
  write('aow.name', app.name);
}
export function setSfx(v: number) {
  app.sfx = v;
  write('aow.sfx', String(v));
  orig?.audio.setSfx(v);
}
export function setMusicVol(v: number) {
  app.music = v;
  write('aow.musicv', String(v));
  orig?.audio.setMusicVolume(v);
}
export function setMusicOn(on: boolean) {
  app.musicOn = on;
  write('aow.music', on ? '1' : '0');
  orig?.audio.setMusicOn(on);
  if (on && app.phase === 'game') orig?.audio.startMusic();
}
export function setCompat(on: boolean) {
  app.compat = on;
  write('aow.compat', on ? '1' : '0');
}
export function setSmartAi(on: boolean) {
  app.smartAi = on;
  write('aow.smartai', on ? '1' : '0');
}
export function myName() {
  return app.name.trim() || (app.lang === 'ru' ? 'Игрок' : 'Player');
}

export async function boot(canvas: HTMLCanvasElement) {
  try {
    orig = new OrigApp(
      {
        phase: (p, info) => {
          if (p === 'result' && info)
            app.result = { winner: (info.winner ?? 0) as 0 | 1 | 2, me: (info.me ?? 1) as Side, online: !!info.online };
          app.phase = p;
          if (p === 'title') {
            app.hud = null;
            app.paused = false;
          }
        },
        menu: () => toggleMenu(),
        paused: (on) => {
          app.paused = on;
        },
      },
      `${import.meta.env.BASE_URL}orig/`,
    );
    await orig.init(canvas, { webgpu: new URLSearchParams(location.search).has('gpu') });
    orig.audio.setSfx(app.sfx);
    orig.audio.setMusicVolume(app.music);
    orig.audio.setMusicOn(app.musicOn);
    app.phase = 'title';
    document.documentElement.lang = app.lang;
    (window as unknown as { __aow: unknown }).__aow = {
      get match() {
        return match;
      },
      get orig() {
        return orig;
      },
      app,
      hostRoom,
      joinRoom,
      toPage: (x: number, y: number) => orig?.toPage(x, y),
      startSolo,
      act,
    };
    window.addEventListener('hashchange', checkLink);
    poll = setInterval(() => {
      refreshNet();
      refreshHud();
    }, 100);
    checkLink();
  } catch (e) {
    if (healOnce()) return;
    app.loadError = e instanceof Error ? e.message : String(e);
  }
}

function snapshotHud(m: Match): HudState {
  const sim = m.sim;
  const me = m.side;
  const foe: Side = me === 1 ? 2 : 1;
  const p = sim.player(me);
  const q = sim.player(foe);
  const d = sim.d;
  const lo = (p.tech - 1) * 3 + 1;
  const ids = p.tech === 5 ? [lo, lo + 1, lo + 2, 16] : [lo, lo + 1, lo + 2];
  const base = sim.bases[me];
  const fbase = sim.bases[foe];
  const addonCost = p.addons < 3 ? ([1000, 3000, 7500][p.addons] as number) : null;
  const evolveCost = p.tech < 5 ? (d.EV[p.tech - 1] as number) : null;
  return {
    me,
    tech: p.tech,
    cash: Math.floor(p.cash),
    xp: Math.floor(p.xp),
    evolveCost,
    canEvolve: sim.can(me, { t: 'evolve' }),
    hp: Math.max(0, Math.round(base.health)),
    hpMax: (base as { maxHealth: number }).maxHealth,
    eHp: Math.max(0, Math.round(fbase.health)),
    eHpMax: (fbase as { maxHealth: number }).maxHealth,
    eTech: q.tech,
    special: Math.min(1, p.special / 2000),
    specialReady: p.special >= 2000,
    units: ids.map((id) => ({
      id,
      cost: (d.EN[id] as [string, number, number])[1],
      ok: sim.can(me, { t: 'tray', id }),
    })),
    turrets: [lo, lo + 1, lo + 2].map((id) => ({
      id,
      cost: (d.TU[id] as [string, number, number])[1],
      ok: p.cash >= (d.TU[id] as [string, number, number])[1],
    })),
    slots: [1, 2, 3, 4].map((spot) => ({ spot, open: spot <= p.addons + 1, id: p.spots[spot - 1] as number })),
    addonCost,
    canAddon: sim.can(me, { t: 'addon' }),
    tray: [...p.tray],
    progress: sim.trainingProgress(me),
    seconds: Math.floor(sim.frame / 40),
    winner: sim.winner,
  };
}

let hudTick = 0;
function refreshHud() {
  if (!match || app.phase !== 'game') return;
  const h = snapshotHud(match);
  app.hud = h;
  if (hudTick++ % 4 === 0) ensureIcons(h.tech, h.tech + 1 > 5 ? 5 : h.tech + 1);
}

/** send a command as the local player (ignored while paused) */
export function act(c: Cmd) {
  orig?.send(c);
}

/**
 * Renders the HUD icons (units 'u<id>', turrets 't<id>') from the original art as soon as their atlas
 * is on the GPU; called until every icon of the ages in play exists.
 */
function ensureIcons(...techs: number[]) {
  const a = orig?.assets;
  if (!a) return;
  const data = a.data;
  const want: [string, string | null][] = [];
  for (const t of new Set(techs)) {
    const lo = (t - 1) * 3 + 1;
    for (const id of t === 5 ? [lo, lo + 1, lo + 2, 16] : [lo, lo + 1, lo + 2]) {
      const c = (data.units[id] as { states: { idle: { id: number } } } | null)?.states.idle.id;
      want.push([`u${id}`, c ? `s${c}.1` : null]);
    }
    for (const id of [lo, lo + 1, lo + 2]) {
      const c = (data.turrets[id] as { clip: { id: number } } | null)?.clip.id;
      want.push([`t${id}`, c ? `s${c}.1` : null]);
    }
  }
  for (const [key, frame] of want) {
    if (app.icons[key] || !frame) continue;
    const url = a.frameDataUrl(frame);
    if (url) app.icons[key] = url;
  }
}

/** unit base stats from the original tables: [health, melee damage, ranged damage, …] */
export function unitStats(id: number): number[] {
  return (orig?.assets.data.ES[id] as number[] | undefined) ?? [];
}

function refreshNet() {
  if (!match) return;
  const s = match.status;
  app.net = {
    online: match.online,
    rtt: Math.round(s.rtt),
    stalled: s.stalled,
    desync: s.desync,
    peerLeft: s.peerLeft,
    delay: s.delay,
    via: match.online ? best() : '',
    routes: transport instanceof MultiTransport ? transport.info() : [],
  };
}

function best() {
  return (transport instanceof MultiTransport ? transport.best : app.lobby.via) as RungId | 'manual' | '';
}

function attach(m: Match) {
  if (match?.online && m.online && match.release) match.release();
  else if (match && match !== m) match.destroy?.();
  match = m;
  app.overlay = 'none';
  app.rematch = { mine: false, theirs: false };
  app.net = {
    online: m.online,
    rtt: 0,
    stalled: false,
    desync: false,
    peerLeft: false,
    delay: m.status.delay,
    via: m.online ? app.lobby.via : '',
    routes: [],
  };
  orig?.attachMatch(m);
}

export function startSolo(diff: 1 | 2 | 3 = 1) {
  disposeTransport();
  const data = orig?.assets.data;
  if (!data) return;
  const m = new SoloMatch(data, (Math.random() * 2 ** 32) >>> 0, { ai: !app.smartAi, bot: app.smartAi, diff });
  m.speed = app.speed;
  app.peerName = '';
  attach(m);
}

function disposeTransport() {
  ladder?.cancel();
  ladder = null;
  manual?.transport.close();
  manual = null;
  try {
    transport?.close();
  } catch {
    /* */
  }
  transport = null;
}

function linkFor(code: string) {
  const u = new URL(location.href);
  u.hash = `join=${code}`;
  return u.toString();
}

function resetLobby(role: 'host' | 'guest', code: string, link: string, state: 'waiting' | 'connecting') {
  app.lobby = {
    role,
    code,
    link,
    state,
    slow: false,
    error: '',
    rungs: [],
    via: '',
    manual: { step: 'off', offer: '', answer: '', error: '', busy: false },
  };
  app.overlay = 'lobby';
}

function runLadder(code: string, role: 'host' | 'guest') {
  const params = new URLSearchParams(location.search);
  if (app.compat && !params.has('rungs')) params.set('rungs', 'relay-nostr,relay-mqtt,relay-ws');
  const slow = setTimeout(() => {
    app.lobby.slow = true;
  }, 25000);
  const l = connectLadder(code, role, myName(), params, () => {
    if (ladder) app.lobby.rungs = ladder.rungs.map((r) => ({ ...r }));
  });
  ladder = l;
  app.lobby.rungs = l.rungs.map((r) => ({ ...r }));
  l.result
    .then(({ transport: t, rung, hs }) => {
      clearTimeout(slow);
      transport = t;
      app.lobby.state = 'connected';
      app.lobby.via = rung;
      app.peerName = hs.peerName;
      startOnline(hs.seed, (hs.side + 1) as Side, hs.delay);
    })
    .catch((e) => {
      clearTimeout(slow);
      if (ladder !== l) return;
      app.lobby.state = 'error';
      app.lobby.error = e instanceof Error ? e.message : String(e);
      app.lobby.slow = true;
    });
}

export function hostRoom() {
  disposeTransport();
  const code = makeRoomCode();
  resetLobby('host', code, linkFor(code), 'waiting');
  runLadder(code, 'host');
}

export function joinRoom(raw: string) {
  const code = normalizeCode(raw);
  if (code.length < 4) return;
  disposeTransport();
  resetLobby('guest', code, '', 'connecting');
  runLadder(code, 'guest');
}

export async function manualStart(role: 'host' | 'guest') {
  disposeTransport();
  resetLobby(role, '', '', role === 'host' ? 'waiting' : 'connecting');
  app.lobby.via = 'manual';
  const m = app.lobby.manual;
  if (typeof RTCPeerConnection === 'undefined') {
    m.error = 'WebRTC unavailable';
    return;
  }
  manual = new ManualPeer();
  if (role === 'host') {
    m.step = 'offer';
    m.busy = true;
    try {
      m.offer = await manual.createOffer();
    } catch (e) {
      m.error = String(e);
    }
    m.busy = false;
  } else m.step = 'paste-offer';
}

export async function manualSubmit(text: string) {
  const m = app.lobby.manual;
  const peer = manual;
  if (!peer) return;
  m.error = '';
  m.busy = true;
  try {
    if (app.lobby.role === 'host') {
      await peer.acceptAnswer(text);
      m.step = 'connecting';
      finishManual(peer, await hostHandshake(peer.transport, myName()));
    } else {
      m.answer = await peer.acceptOffer(text);
      m.step = 'show-answer';
      finishManual(peer, await guestHandshake(peer.transport, myName()));
    }
  } catch {
    m.error = 'bad code';
  }
  m.busy = false;
}

function finishManual(peer: ManualPeer, hs: { seed: number; side: 0 | 1; delay: number; peerName: string }) {
  transport = peer.transport;
  manual = null;
  app.lobby.state = 'connected';
  app.peerName = hs.peerName;
  startOnline(hs.seed, (hs.side + 1) as Side, hs.delay);
}

function startOnline(seed: number, side: Side, delay: number) {
  const data = orig?.assets.data;
  if (!transport || !data) return;
  const m = new OnlineMatch(data, seed, side, transport, delay, { ai: false, diff: 1 });
  m.onOther = onOther;
  attach(m);
}

function onOther(msg: Msg) {
  if (msg.k === 'rematch') {
    app.rematch.theirs = true;
    maybeRematch();
  } else if (msg.k === 'init' && match?.online && match.side === 2) startOnline(msg.seed, 2, msg.delay);
}

export function requestRematch() {
  if (!match?.online) {
    startSolo();
    return;
  }
  app.rematch.mine = true;
  match.send({ k: 'rematch' });
  maybeRematch();
}
function maybeRematch() {
  if (!match?.online || !app.rematch.mine || !app.rematch.theirs || match.side !== 1) return;
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const delay = match.status.delay;
  match.send({ k: 'init', seed, delay, hostName: myName() });
  startOnline(seed, 1, delay);
}

export function leave() {
  match?.destroy();
  match = null;
  transport = null;
  app.overlay = 'none';
  app.lobby.state = 'idle';
  history.replaceState(null, '', location.pathname + location.search);
  app.menu = 'home';
  orig?.showTitle();
}

export function cancelLobby() {
  disposeTransport();
  app.lobby.state = 'idle';
  app.overlay = 'none';
  app.menu = 'friend';
  history.replaceState(null, '', location.pathname + location.search);
}

export function closeOverlay() {
  app.overlay = 'none';
}
export function setMenu(v: MenuView) {
  app.menu = v;
}
export function toggleMenu() {
  if (app.phase !== 'game') return;
  app.overlay = app.overlay === 'menu' ? 'none' : 'menu';
  if (!match?.online) orig?.setPaused(app.overlay === 'menu');
}
export function setSpeed(v: number) {
  app.speed = v;
  if (match && !match.online) match.speed = v;
}

function checkLink() {
  const m = /join=([A-Za-z0-9]+)/.exec(location.hash);
  if (m && app.phase === 'title' && app.overlay === 'none') joinRoom(m[1] as string);
}

export function dispose() {
  if (poll) clearInterval(poll);
  orig?.destroy();
}

// ── i18n helpers for the HTML overlays ──
import { AGE_NAMES } from './i18n';
export const tr = (k: Key): string => {
  const v = STRINGS[app.lang][k];
  return Array.isArray(v) ? v.join(' ') : (v as string);
};
export const trList = (k: 'howToText'): string[] => STRINGS[app.lang][k];
export const ageName = (a: number) => AGE_NAMES[app.lang][a] as string;
