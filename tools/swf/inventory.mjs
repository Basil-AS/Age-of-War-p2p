import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { GAME_DIR } from './scripts.mjs';
const swf = JSON.parse(readFileSync('/tmp/swf.json', 'utf8'));
const sdirs = readdirSync(`${GAME_DIR}/sprites`);
const dirOf = (id) => sdirs.find((d) => d === `DefineSprite_${id}` || d.startsWith(`DefineSprite_${id}_`));
const size = (f) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const units = swf.sprites[687];
let total = 0, files = 0; const per = {};
units.frames.forEach((f, i) => {
  const A = (f.place.find((p) => p.name === 'anims') || f.place.find((p) => p.depth === 2)).id;
  for (const st of swf.sprites[A].frames) {
    const clip = st.place[0]?.id; if (!clip || !swf.sprites[clip]) continue;
    const n = swf.sprites[clip].numFrames; const d = dirOf(clip);
    for (let k = 1; k <= n; k++) { const [w, h] = size(`${GAME_DIR}/sprites/${d}/${k}.png`); total += w * h; files++; per[i + 1] = (per[i + 1] || 0) + w * h; }
  }
});
console.log('unit frames', files, 'pixels', (total / 1e6).toFixed(1) + 'M', 'per unit(M px):', Object.entries(per).map(([k, v]) => k + ':' + (v / 1e6).toFixed(1)).join(' '));
