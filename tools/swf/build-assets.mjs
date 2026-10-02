// Rebuilds the atlas pack + manifest from the exported original game. Usage: node tools/swf/build-assets.mjs [outDir]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { makeBounds } from './bounds.mjs';
import { parseSwf } from './parse.mjs';
import { Packer } from './pack.mjs';
import { GAME_DIR, compile, spriteScripts } from './scripts.mjs';
import { writeFileSync } from 'node:fs';

const SWF = process.env.AOW_SWF || '/home/user/erupturatis/decompiled-flash-games-archive/Games/age of war/Age_Of_War.swf';
const OUT = process.argv[2] || 'public/orig';
// hi-res: AOW_SCALE=3 AOW_HI=<ffdec sprite export made with -zoom 3> (see docs/ASSETS.md)
const S = Number(process.env.AOW_SCALE || 1);
const SPR_DIR = process.env.AOW_HI || `${GAME_DIR}/sprites`;
const swf = parseSwf(SWF);
const { spriteBounds, charBounds } = makeBounds(swf);
const sdirs = readdirSync(SPR_DIR);
const spriteDir = (id) => sdirs.find((d) => d === `DefineSprite_${id}` || d.startsWith(`DefineSprite_${id}_`));
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const packer = new Packer(OUT, { pad: S > 1 ? 4 : 2, lossy: process.env.LOSSLESS ? false : true, scale: S, size: Number(process.env.AOW_ATLAS || 2048), quality: Number(process.env.AOW_Q || 92) });
const era = (u) => (u >= 16 ? 5 : Math.ceil(u / 3));

export const spriteKey = (id, f) => `s${id}.${f}`;
export const shapeKey = (id) => `h${id}`;

function addSprite(id, f, bucket) {
  const d = spriteDir(id); if (!d) return false;
  const file = `${SPR_DIR}/${d}/${f}.png`; if (!existsSync(file)) return false;
  const b = spriteBounds(id) || { x0: 0, y0: 0 };
  packer.add(spriteKey(id, f), bucket, async () => readFileSync(file), b.x0, b.y0);
  return true;
}
function addAllFrames(id, bucket) { const s = swf.sprites[id]; if (!s) return; for (let f = 1; f <= s.numFrames; f++) addSprite(id, f, bucket); }
function addShape(id, bucket) {
  const file = `${GAME_DIR}/shapes/${id}.svg`; if (!existsSync(file)) return false;
  const b = swf.chars[id].bounds;
  packer.add(shapeKey(id), bucket, async () => sharp(readFileSync(file), { density: 72 * S }).png().toBuffer(), b.x0, b.y0);
  return true;
}
/** add a character of any kind (sprite flat frames or shape) */
function addChar(id, bucket) { const c = swf.chars[id]; if (c?.type === 'sprite') addAllFrames(id, bucket); else if (c?.type === 'shape') addShape(id, bucket); }

// ── units (per era) ──
const units = swf.sprites[687];
const unitInfo = [];
units.frames.forEach((f, i) => {
  const u = i + 1;
  const A = (f.place.find((p) => p.name === 'anims') || f.place.find((p) => p.depth === 2)).id;
  for (const st of swf.sprites[A].frames) { const clip = st.place[0]?.id; if (clip && swf.sprites[clip]) addAllFrames(clip, `e${era(u)}`); }
  unitInfo.push(A);
});
addShape(217, 'core'); addShape(213, 'core'); addAllFrames(215, 'core'); addAllFrames(698, 'core');

// ── turrets (per era) ──
swf.sprites[881].frames.forEach((f, i) => {
  for (const p of f.place) if (p.id != null && swf.sprites[p.id]) addAllFrames(p.id, `e${Math.min(5, Math.ceil((i + 1 > 7 ? i : i + 1) / 3))}`);
});

// ── bullets / particles / specials / cursor ──
for (const id of [888, 890, 892, 894, 896, 898, 899, 901, 902, 903, 904, 905, 907, 909, 911, 913, 915, 917, 923, 925, 927, 929, 930, 931, 933, 948, 949, 961, 973, 976, 589, 883, 884, 882, 965]) addChar(id, 'core');
for (const id of [895, 893, 891, 889, 897, 900, 906, 908, 910, 912, 914, 916, 887, 922, 924, 926, 928, 932, 946, 947, 782, 175, 872, 183, 967, 971, 968, 969, 970, 974, 975]) addChar(id, 'core');

// ── bases ──
for (const id of [8, 14, 20, 26]) for (let f = 1; f <= 5; f++) addSprite(id, f, `e${f}`);
for (const id of [31, 29, 32, 30, 50]) addChar(id, 'core');

// ── UI trees (menu panel, cursor, pause, screens) rebuilt at runtime by the generic display-list engine ──
const ATOMIC = new Set(); // sprites that are drawn as one flat image per frame
for (const [key] of packer.items) { const m = /^s(\d+)\./.exec(key); if (m) ATOMIC.add(Number(m[1])); }
const ui = { sprites: {}, chars: {}, main: null };
const readTxt = (id) => { try { return readFileSync(`${GAME_DIR}/texts/${id}.txt`, 'utf8').split('\n--- RECORDSEPARATOR ---\n').map((x) => x.replace(/\r/g, '')); } catch { return null; } };
function collect(id) {
  if (ui.chars[id] || ui.sprites[id]) return;
  const c = swf.chars[id]; if (!c) return;
  if (c.type === 'sprite') {
    if (ATOMIC.has(id)) { ui.chars[id] = { type: 'atomic', n: swf.sprites[id].numFrames }; return; }
    const sp = swf.sprites[id]; const scripts = spriteScripts(id);
    ui.sprites[id] = { n: sp.numFrames, frames: sp.frames.map((f, i) => ({ place: f.place.map((p) => ({ depth: p.depth, id: p.id, name: p.name, m: p.m, cx: p.cx, move: p.move, ratio: p.ratio, clipDepth: p.clipDepth })), remove: f.remove, label: f.label, ops: scripts[i + 1] ? compile(scripts[i + 1]).filter((o) => o[0] !== 'unknown') : undefined, snd: f.sounds })) };
    for (const f of sp.frames) for (const p of f.place) if (p.id != null) collect(p.id);
  } else if (c.type === 'shape') { addShape(id, 'ui'); ui.chars[id] = { type: 'shape', bounds: c.bounds }; }
  else if (c.type === 'button') { ui.chars[id] = { type: 'button', records: c.records.map((r) => ({ states: r.states, id: r.id, depth: r.depth, m: r.m })) }; for (const r of c.records) collect(r.id); }
  else if (c.type === 'edittext') ui.chars[id] = c;
  else if (c.type === 'text') ui.chars[id] = { ...c, str: readTxt(id) };
  else if (c.type === 'morph') ui.chars[id] = { type: 'morph', bounds: c.bounds };
}
for (const r of [212, 885, 965, 46, 33, 216]) collect(r);
ui.rootIds = { menu: 212, cursor: 885, pause: 965, basePlayer: 46, baseComp: 33, hb: 216 };
// main timeline screens
{
  const frames = swf.main.map((f) => ({ place: f.place.map((p) => ({ depth: p.depth, id: p.id, name: p.name, m: p.m, cx: p.cx, move: p.move, ratio: p.ratio })), remove: f.remove, label: f.label, snd: f.sounds }));
  for (const f of frames) for (const p of f.place) if (p.id != null) collect(p.id);
  ui.main = frames;
}
writeFileSync(`${OUT}/ui.json`, JSON.stringify(ui));
writeFileSync(`${OUT}/fonts.json`, JSON.stringify(Object.fromEntries(Object.entries(swf.fontIds).filter(([, f]) => f.glyphs?.length).map(([id, f]) => [id, { name: f.name, em: f.em, codes: f.codes, glyphs: f.glyphs, adv: f.adv }]))));
console.log('ui.json', (JSON.stringify(ui).length / 1024).toFixed(0) + 'KB', 'sprites', Object.keys(ui.sprites).length, 'chars', Object.keys(ui.chars).length);

console.log('leaf images:', packer.items.size);
const manifest = await packer.build();
console.log('atlases', manifest.atlases.length, 'total KB', (manifest.atlases.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(0));
