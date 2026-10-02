// Builds public/orig/data.json: the numeric/structural facts of the original game needed by the port.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { makeBounds } from './bounds.mjs';
import { parseSwf } from './parse.mjs';
import { compile, GAME_DIR, spriteScripts } from './scripts.mjs';

const SWF = process.env.AOW_SWF || '/home/user/erupturatis/decompiled-flash-games-archive/Games/age of war/Age_Of_War.swf';
const OUT = process.argv[2] || 'public/orig';
const swf = parseSwf(SWF);
const { charBounds } = makeBounds(swf);
mkdirSync(`${OUT}/snd`, { recursive: true });
mkdirSync(`${OUT}/fonts`, { recursive: true });

const ID = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const mul = (m, n) => ({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, tx: m.a * n.tx + m.c * n.ty + m.tx, ty: m.b * n.tx + m.d * n.ty + m.ty });
const bbox = (r, m) => { const xs = [], ys = []; for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) { xs.push(m.a * x + m.c * y + m.tx); ys.push(m.b * x + m.d * y + m.ty); } return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };

/** persistent display list (depth -> {id,m}) after running frames 1..n of a sprite */
function displayAt(spriteId, frame) {
  const dl = new Map(); const s = swf.sprites[spriteId];
  for (let i = 0; i < frame; i++) {
    const f = s.frames[i];
    for (const d of f.remove) dl.delete(d);
    for (const p of f.place) { const cur = dl.get(p.depth) || {}; dl.set(p.depth, { ...cur, ...(p.id != null ? { id: p.id } : {}), ...(p.m ? { m: p.m } : {}), ...(p.name ? { name: p.name } : {}) }); }
  }
  return [...dl.entries()].sort((a, b) => a[0] - b[0]).map(([depth, o]) => ({ depth, ...o }));
}

function clipData(id) {
  const s = swf.sprites[id];
  const scripts = spriteScripts(id);
  const ops = {}; for (const [f, src] of Object.entries(scripts)) ops[f] = compile(src);
  const labels = {}; s.frames.forEach((f, i) => { if (f.label) labels[f.label] = i + 1; });
  const snd = {}; s.frames.forEach((f, i) => { if (f.sounds) snd[i + 1] = f.sounds; });
  return { id, n: s.numFrames, labels, ops, snd };
}

// ── constants copied from the original ActionScript (frame_13) ──
const src = readFileSync(`${GAME_DIR}/scripts/frame_13/DoAction.as`, 'utf8');
const grab = (name) => { const m = new RegExp(`${name} = (\\[[\\s\\S]*?\\]);\\n`).exec(src); return eval(m[1].replace(/\\'/g, "'")); };
const EN = grab('EN'), TU = grab('TU'), TS = grab('TS'), ES = grab('ES'), EV = grab('EV');

// ── units ──
const units = [null];
const ennemy = swf.sprites[699];
const hitzoneFrames = swf.sprites[695];
const unitsClip = swf.sprites[687];
unitsClip.frames.forEach((f, i) => {
  const u = i + 1;
  const dl = displayAt(687, u);
  const anims = dl.find((o) => o.name === 'anims') || dl.find((o) => o.depth === 2);
  const shadow = dl.find((o) => o.depth === 1);
  const A = anims.id;
  const states = {};
  swf.sprites[A].frames.forEach((st, k) => {
    const place = st.place[0]; if (!place || !swf.sprites[place.id]) return;
    const clip = clipData(place.id);
    states[st.label] = { ...clip, m: mul(anims.m || ID, place.m || ID) };
  });
  const hz = displayAt(695, u).find((o) => o.id != null);
  const hb = bbox(charBounds(hz.id), hz.m || ID);
  units.push({ id: u, A, states, shadow: shadow ? { id: shadow.id, m: shadow.m } : null, hit: hb });
});

// ── turrets ──
const turrets = [null];
const tu = swf.sprites[881];
tu.frames.forEach((f, i) => {
  const dl = displayAt(881, i + 1);
  const anim = dl.find((o) => o.name === 'anim');
  const extra = dl.filter((o) => o.name !== 'anim' && o.id != null);
  turrets.push({ id: i + 1, clip: clipData(anim.id), m: anim.m || ID, extra: extra.map((e) => ({ id: e.id, m: e.m || ID })) });
});

// ── bases ──
const baseHit = (id) => { const dl = displayAt(id, 1); const hz = dl.find((o) => o.name === 'hitzone'); const inner = displayAt(hz.id, 1)[0]; return bbox(charBounds(inner.id), mul(hz.m || ID, inner.m || ID)); };
const bases = { base1: { x: 50, y: 425, hit: baseHit(921) }, base2: { x: 950, y: 425, hit: baseHit(920) } };

// ── sounds / fonts ──
const sounds = {};
for (const f of readdirSync(`${GAME_DIR}/sounds`)) { copyFileSync(`${GAME_DIR}/sounds/${f}`, `${OUT}/snd/${f}`); sounds[f.replace(/\..*$/, '')] = f; }
const fonts = {};
for (const f of readdirSync(`${GAME_DIR}/fonts`)) { copyFileSync(`${GAME_DIR}/fonts/${f}`, `${OUT}/fonts/${f}`); fonts[f.split('_')[0]] = f; }

const unknown = [];
for (const u of units.slice(1)) for (const [n, st] of Object.entries(u.states)) for (const [f, ops] of Object.entries(st.ops)) for (const o of ops) if (o[0] === 'unknown') unknown.push(`unit${u.id}.${n}@${f}: ${o[1]}`);
for (const t of turrets.slice(1)) for (const [f, ops] of Object.entries(t.clip.ops)) for (const o of ops) if (o[0] === 'unknown') unknown.push(`turret${t.id}@${f}: ${o[1]}`);
if (unknown.length) console.log('UNKNOWN SCRIPTS:\n' + unknown.join('\n'));

const data = { fps: swf.fps, stage: { w: 650, h: 450 }, EN, TU, TS, ES, EV, units, turrets, bases, sounds, fonts, texts: Object.fromEntries(Object.entries(swf.chars).filter(([, c]) => c.type === 'edittext')) };
writeFileSync(`${OUT}/data.json`, JSON.stringify(data));
console.log('data.json', (JSON.stringify(data).length / 1024).toFixed(0) + 'KB', 'units', units.length - 1, 'turrets', turrets.length - 1);
console.log('EN', EN.length, 'TU', TU.length, 'TS', TS.length, 'ES', ES.length, 'EV', EV);
console.log('unit1 states', Object.entries(units[1].states).map(([k, v]) => `${k}:${v.n}f ops=${Object.keys(v.ops).join(',')}`).join(' | '), 'hit', JSON.stringify(units[1].hit));
console.log('unit4 attack labels', JSON.stringify(units[4].states.attack.labels), 'ops', JSON.stringify(units[4].states.attack.ops));
console.log('bases', JSON.stringify(bases));
