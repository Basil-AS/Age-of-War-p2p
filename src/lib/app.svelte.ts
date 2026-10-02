import { sfx, setVolume } from '../audio';
import { createLocalTransport } from '../net/local';
import { type Match, OnlineMatch, SoloMatch } from '../net/match';
import { guestHandshake, hostHandshake } from '../net/session';
import { makeRoomCode, normalizeCode, type Msg, type Transport } from '../net/transport';
import { createTrysteroTransport, type Relay } from '../net/trystero';
import { GameRenderer } from '../render/renderer';
import { SIM_HZ, SPECIALS, SLOT_COST, SPECIAL_COOLDOWN, TURRETS, UNITS, XP_TO_EVOLVE, turretsOfAge, unitsOfAge } from '../sim/data';
import type { Cmd, Difficulty } from '../sim/types';
import { detectLang, type Lang } from './i18n';

export type Screen = 'menu' | 'lobby' | 'game';

export interface Hud {
  gold: number; xp: number; xpNeed: number | null; canEvolve: boolean; age: number;
  baseHp: number; baseMax: number; eAge: number; eHp: number; eMax: number;
  queue: { def: number; frac: number }[];
  units: { def: number; cost: number; ok: boolean }[];
  turretBuy: { id: number; cost: number; ok: boolean }[];
  slots: (number | null)[]; slotsOwned: number; slotCost: number | null; canSlot: boolean;
  specialCd: number; specialReady: boolean; specialKind: string;
  alive: number; time: number; kills: number; winner: number;
}

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export const app = $state({
  screen: 'menu' as Screen,
  lang: detectLang() as Lang,
  name: read('aow.name', ''),
  volume: Number(read('aow.vol', '0.6')),
  difficulty: (read('aow.diff', 'normal') as Difficulty),
  relay: (read('aow.relay', 'nostr') as Relay),
  speed: 1,
  hud: null as Hud | null,
  icons: {} as Record<string, string>,
  lobby: { role: 'host' as 'host' | 'guest', code: '', link: '', state: 'idle' as 'idle' | 'waiting' | 'connecting' | 'connected' | 'error', slow: false, error: '' },
  net: { online: false, rtt: 0, stalled: false, desync: false, peerLeft: false, delay: 0 },
  paused: false,
  menuOpen: false,
  rematch: { mine: false, theirs: false },
  banner: null as { text: string; kind: string; id: number } | null,
  peerName: '',
  ready: false,
});

let renderer: GameRenderer | null = null;
let match: Match | null = null;
let transport: Transport | null = null;
let lastHud = 0;
let bannerId = 0;

export const getMatch = () => match;

export function setLang(l: Lang) { app.lang = l; write('aow.lang', l); }
export function setName(n: string) { app.name = n.slice(0, 16); write('aow.name', app.name); }
export function setVol(v: number) { app.volume = v; setVolume(v); write('aow.vol', String(v)); }
export function setDifficulty(d: Difficulty) { app.difficulty = d; write('aow.diff', d); }
export function setRelay(r: Relay) { app.relay = r; write('aow.relay', r); }
export function myName() { return app.name.trim() || (app.lang === 'ru' ? 'Игрок' : 'Player'); }

export async function boot(canvas: HTMLCanvasElement) {
  setVolume(app.volume);
  renderer = new GameRenderer();
  await renderer.init(canvas, { webgpu: new URLSearchParams(location.search).has('gpu') });
  renderer.banner = (text, kind) => { app.banner = { text, kind, id: ++bannerId }; };
  app.icons = await renderer.makeIcons();
  app.ready = true;
  const loop = (now: number) => {
    if (match && app.screen === 'game') {
      if (!app.paused) match.update(now);
      renderer?.draw(now);
      if (now - lastHud > 80) { lastHud = now; refreshHud(); }
    } else if (renderer && match) renderer.draw(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __aow: unknown }).__aow = { get match() { return match; }, app };
  window.addEventListener('hashchange', checkLink);
  checkLink();
}

export function setInsets(top: number, bottom: number) { renderer?.setInsets(top, bottom); }

function attach(m: Match) {
  match?.destroy?.();
  match = m;
  renderer?.attach(m);
  app.screen = 'game';
  app.paused = false;
  app.menuOpen = false;
  app.rematch = { mine: false, theirs: false };
  app.banner = null;
  app.net = { online: m.online, rtt: 0, stalled: false, desync: false, peerLeft: false, delay: m.status.delay };
  refreshHud();
}

export function startSolo(diff = app.difficulty) {
  sfx('click');
  disposeTransport();
  const speed = app.speed;
  const m = new SoloMatch((Math.random() * 2 ** 32) >>> 0, diff);
  m.speed = speed;
  app.peerName = '';
  attach(m);
}

function disposeTransport() { try { transport?.close(); } catch { /* */ } transport = null; }

async function makeTransport(code: string): Promise<Transport> {
  if (new URLSearchParams(location.search).get('net') === 'local') return createLocalTransport(code);
  const custom = new URLSearchParams(location.search).get('relayUrl');
  return createTrysteroTransport(code, app.relay, custom ? [custom] : undefined);
}

function linkFor(code: string) {
  const u = new URL(location.href);
  u.hash = `join=${code}&relay=${app.relay}`;
  u.search = u.search.includes('net=local') ? '?net=local' : '';
  return u.toString();
}

export async function hostRoom() {
  sfx('click');
  disposeTransport();
  const code = makeRoomCode();
  app.lobby = { role: 'host', code, link: linkFor(code), state: 'waiting', slow: false, error: '' };
  app.screen = 'lobby';
  try {
    transport = await makeTransport(code);
    const slow = setTimeout(() => { app.lobby.slow = true; }, 25000);
    const hs = await hostHandshake(transport, myName());
    clearTimeout(slow);
    app.lobby.state = 'connected';
    app.peerName = hs.peerName;
    startOnline(hs.seed, hs.side, hs.delay);
  } catch (e) { app.lobby.state = 'error'; app.lobby.error = String(e); }
}

export async function joinRoom(raw: string) {
  const code = normalizeCode(raw);
  if (code.length < 4) return;
  sfx('click');
  disposeTransport();
  app.lobby = { role: 'guest', code, link: '', state: 'connecting', slow: false, error: '' };
  app.screen = 'lobby';
  try {
    transport = await makeTransport(code);
    const slow = setTimeout(() => { app.lobby.slow = true; }, 25000);
    const hs = await guestHandshake(transport, myName());
    clearTimeout(slow);
    app.lobby.state = 'connected';
    app.peerName = hs.peerName;
    startOnline(hs.seed, hs.side, hs.delay);
  } catch (e) { app.lobby.state = 'error'; app.lobby.error = String(e); }
}

function startOnline(seed: number, side: 0 | 1, delay: number) {
  if (!transport) return;
  const m = new OnlineMatch(seed, side, transport, delay);
  m.onOther = onOther;
  attach(m);
}

function onOther(msg: Msg) {
  if (msg.k === 'rematch') {
    app.rematch.theirs = true;
    maybeRematch();
  } else if (msg.k === 'init' && match?.online && match.side === 1) {
    // host launched the rematch
    startOnline(msg.seed, 1, msg.delay);
  }
}

export function requestRematch() {
  if (!match?.online) { startSolo(); return; }
  sfx('click');
  app.rematch.mine = true;
  match.send({ k: 'rematch' });
  maybeRematch();
}
function maybeRematch() {
  if (!match?.online || !app.rematch.mine || !app.rematch.theirs || match.side !== 0) return;
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const delay = match.status.delay;
  match.send({ k: 'init', seed, delay, hostName: myName() });
  startOnline(seed, 0, delay);
}

export function leave() {
  sfx('click');
  match?.destroy();
  match = null;
  transport = null;
  app.screen = 'menu';
  app.menuOpen = false;
  app.lobby.state = 'idle';
  history.replaceState(null, '', location.pathname + location.search);
}

export function cancelLobby() {
  sfx('click');
  disposeTransport();
  app.lobby.state = 'idle';
  app.screen = 'menu';
  history.replaceState(null, '', location.pathname + location.search);
}

function checkLink() {
  const m = /join=([A-Za-z0-9]+)/.exec(location.hash);
  const r = /relay=(nostr|torrent|mqtt)/.exec(location.hash);
  if (r) app.relay = r[1] as Relay;
  if (m && app.screen === 'menu') void joinRoom(m[1] as string);
}

export function cmd(c: Cmd) {
  if (!match || app.paused) return;
  const side = match.side;
  if (!match.sim.can(side, c)) { sfx('denied'); return; }
  if (match.sim.winner !== -1) return;
  match.command(c);
  if (c.t === 'buy') sfx('click');
}

export function toggleMenu() {
  if (app.screen !== 'game') return;
  app.menuOpen = !app.menuOpen;
  if (!match?.online) app.paused = app.menuOpen;
}

export function setSpeed(v: number) {
  app.speed = v;
  if (match && !match.online) match.speed = v;
}

function refreshHud() {
  if (!match) return;
  const sim = match.sim;
  const me = match.side;
  const p = sim.players[me];
  const e = sim.players[(1 - me) as 0 | 1];
  const age = p.age;
  const lane = sim.lanes[me].length;
  app.hud = {
    gold: p.gold, xp: p.xp, xpNeed: age < 4 ? (XP_TO_EVOLVE[age] as number) : null,
    canEvolve: sim.can(me, { t: 'evolve' }), age,
    baseHp: Math.max(0, p.baseHp), baseMax: p.baseMax, eAge: e.age, eHp: Math.max(0, e.baseHp), eMax: e.baseMax,
    queue: p.queue.map((q, i) => ({ def: q.def, frac: i === 0 ? 1 - q.left / q.total : 0 })),
    units: unitsOfAge(age).map((u) => ({ def: u.id, cost: u.cost, ok: sim.can(me, { t: 'buy', u: u.id }) })),
    turretBuy: turretsOfAge(age).map((t) => ({ id: t.id, cost: t.cost, ok: freeSlot(p) >= 0 && sim.can(me, { t: 'turret', id: t.id, slot: freeSlot(p) }) })),
    slots: p.turrets.slice(), slotsOwned: p.slots,
    slotCost: p.slots < 4 ? (SLOT_COST[p.slots - 1] as number) : null, canSlot: sim.can(me, { t: 'slot' }),
    specialCd: p.specialCd / SPECIAL_COOLDOWN, specialReady: p.specialCd <= 0, specialKind: (SPECIALS[age] as { kind: string }).kind,
    alive: lane, time: sim.tick / SIM_HZ, kills: p.kills,
    winner: sim.winner === -1 ? -1 : sim.winner === 2 ? 2 : sim.winner === me ? 1 : 0,
  };
  const s = match.status;
  app.net = { online: match.online, rtt: Math.round(s.rtt), stalled: s.stalled, desync: s.desync, peerLeft: s.peerLeft, delay: s.delay };
}

function freeSlot(p: { turrets: (number | null)[]; slots: number }) {
  for (let i = 0; i < p.slots; i++) if (p.turrets[i] === null) return i;
  return -1;
}
export const freeSlotIndex = freeSlot;

export function buyUnit(def: number) { cmd({ t: 'buy', u: def }); }
export function cancelQueue(i: number) { cmd({ t: 'cancel', i }); }
export function buyTurret(id: number) {
  if (!match) return;
  const s = freeSlot(match.sim.players[match.side]);
  if (s >= 0) cmd({ t: 'turret', id, slot: s });
  else sfx('denied');
}
export function sellSlot(slot: number) { cmd({ t: 'sell', slot }); }
export function sellLast() {
  if (!match) return;
  const t = match.sim.players[match.side].turrets;
  for (let i = t.length - 1; i >= 0; i--) if (t[i] !== null) return sellSlot(i);
}
export function buySlot() { cmd({ t: 'slot' }); }
export function evolve() { cmd({ t: 'evolve' }); }
export function special() { cmd({ t: 'special' }); }

export { TURRETS, UNITS };

import { AGE_NAMES, SPECIAL_NAMES, STRINGS, TURRET_NAMES, UNIT_NAMES, type Key } from './i18n';
export const tr = (k: Key): string => {
  const v = STRINGS[app.lang][k];
  return Array.isArray(v) ? v.join(' ') : (v as string);
};
export const trList = (k: 'howToText'): string[] => STRINGS[app.lang][k];
export const unitName = (id: number) => UNIT_NAMES[app.lang][id] as string;
export const turretName = (id: number) => TURRET_NAMES[app.lang][id] as string;
export const ageName = (a: number) => AGE_NAMES[app.lang][a] as string;
export const specialName = (a: number) => SPECIAL_NAMES[app.lang][a] as string;
export const fmt = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000)}k` : String(Math.floor(n)));
