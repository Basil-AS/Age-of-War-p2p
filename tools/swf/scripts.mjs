import { existsSync, readdirSync, readFileSync } from 'node:fs';
export const GAME_DIR = process.env.AOW_EXPORT || '/home/user/erupturatis/decompiled-flash-games-archive/Games/age of war/The game';
const sdir = `${GAME_DIR}/scripts`;
const dirs = readdirSync(sdir);
export function spriteScripts(id) {
  const d = dirs.find((x) => x === `DefineSprite_${id}` || x.startsWith(`DefineSprite_${id}_`));
  const out = {};
  if (!d) return out;
  for (const f of readdirSync(`${sdir}/${d}`)) {
    const m = /^frame_(\d+)$/.exec(f); if (!m) continue;
    const p = `${sdir}/${d}/${f}/DoAction.as`;
    if (existsSync(p)) out[Number(m[1])] = readFileSync(p, 'utf8').trim();
  }
  return out;
}
/** compile the handful of frame-script shapes used by the original unit/turret clips to opcodes */
export function compile(src) {
  const ops = [];
  const s = src.replace(/\s+/g, ' ');
  if (/^stop\(\); _root\.play\(\);$/.test(s)) return [['stop'], ['rootPlay']];
  if (s === 'stop();') return [['stop']];
  if (/^(this\.)?gotoAndPlay\((\d+)\);$/.test(s)) return [['goto', Number(/\((\d+)\)/.exec(s)[1])]];
  if (s === 'gotoAndPlay(random(25));') return [['gotoRandom', 25]];
  if (s === '_parent._parent._parent.hit();') return [['hit']];
  if (s === '_parent._parent._parent.ranged_hit();') return [['rhit']];
  if (s === '_parent._parent.shoot();') return [['shoot']];
  if (s === 'this.removeMovieClip();') return [['remove']];
  if (/^anim = random\((\d+)\) \+ 1; this\.gotoAndPlay\("attack" \+ anim\);$/.test(s)) return [['randLabel', 'attack', Number(/random\((\d+)\)/.exec(s)[1])]];
  if (/^gotoAndStop\(random\((\d+)\) \+ 1 \+ 1\);$/.test(s)) return [['stopRandom', Number(/random\((\d+)\)/.exec(s)[1]), 2]];
  return [['unknown', src]];
}
