// Minimal SWF reader: extracts the symbol hierarchy (sprites, placements, labels, bounds, exports)
// from the original Age of War .swf so assets can be rebuilt faithfully.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

class Bits {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos; this.bit = 0; }
  align() { if (this.bit) { this.p++; this.bit = 0; } }
  ub(n) { let v = 0; for (let i = 0; i < n; i++) { const byte = this.b[this.p]; v = v * 2 + ((byte >> (7 - this.bit)) & 1); if (++this.bit === 8) { this.bit = 0; this.p++; } } return v; }
  sb(n) { if (n === 0) return 0; const v = this.ub(n); return v >= 2 ** (n - 1) ? v - 2 ** n : v; }
  u8() { this.align(); return this.b[this.p++]; }
  u16() { this.align(); const v = this.b.readUInt16LE(this.p); this.p += 2; return v; }
  u32() { this.align(); const v = this.b.readUInt32LE(this.p); this.p += 4; return v; }
  cstr() { this.align(); let e = this.p; while (this.b[e] !== 0) e++; const s = this.b.toString('utf8', this.p, e); this.p = e + 1; return s; }
  rect() { const n = this.ub(5); const r = { x0: this.sb(n) / 20, x1: this.sb(n) / 20, y0: this.sb(n) / 20, y1: this.sb(n) / 20 }; this.align(); return r; }
  matrix() {
    let a = 1, d = 1, b = 0, c = 0;
    if (this.ub(1)) { const n = this.ub(5); a = this.sb(n) / 65536; d = this.sb(n) / 65536; }
    if (this.ub(1)) { const n = this.ub(5); b = this.sb(n) / 65536; c = this.sb(n) / 65536; }
    const n = this.ub(5); const tx = this.sb(n) / 20, ty = this.sb(n) / 20; this.align();
    return { a, b, c, d, tx, ty };
  }
  cxform(alpha) {
    const hasAdd = this.ub(1), hasMult = this.ub(1), n = this.ub(4);
    const cx = { mult: [1, 1, 1, 1], add: [0, 0, 0, 0] };
    if (hasMult) { cx.mult = [this.sb(n) / 256, this.sb(n) / 256, this.sb(n) / 256, alpha ? this.sb(n) / 256 : 1]; }
    if (hasAdd) { cx.add = [this.sb(n), this.sb(n), this.sb(n), alpha ? this.sb(n) : 0]; }
    this.align(); return cx;
  }
}

function readTags(buf, start, end) {
  const tags = []; let p = start;
  while (p < end) {
    const h = buf.readUInt16LE(p); p += 2;
    const type = h >> 6; let len = h & 63;
    if (len === 63) { len = buf.readUInt32LE(p); p += 4; }
    tags.push({ type, data: buf.subarray(p, p + len) });
    p += len;
    if (type === 0) break;
  }
  return tags;
}

function parsePlace(t) {
  const r = new Bits(t.data);
  if (t.type === 26) {
    const f = r.u8(); const o = { depth: 0 };
    o.depth = r.u16();
    if (f & 2) o.id = r.u16();
    if (f & 4) o.m = r.matrix();
    if (f & 8) o.cx = r.cxform(true);
    if (f & 0x10) o.ratio = r.u16();
    if (f & 0x20) o.name = r.cstr();
    if (f & 0x40) o.clipDepth = r.u16();
    o.move = !!(f & 1);
    return o;
  }
  // PlaceObject3
  const f = r.u8(); const f2 = r.u8(); const o = {};
  o.depth = r.u16();
  if (f2 & 8 || ((f2 & 16) && (f & 2))) o.className = r.cstr();
  if (f & 2) o.id = r.u16();
  if (f & 4) o.m = r.matrix();
  if (f & 8) o.cx = r.cxform(true);
  if (f & 0x10) o.ratio = r.u16();
  if (f & 0x20) o.name = r.cstr();
  if (f & 0x40) o.clipDepth = r.u16();
  o.move = !!(f & 1);
  return o;
}

function parseTimeline(tags, out) {
  // returns frames: [{place:[], remove:[], label, actions:n, sounds:[]}]
  const frames = []; let cur = { place: [], remove: [] };
  for (const t of tags) {
    if (t.type === 1) { frames.push(cur); cur = { place: [], remove: [] }; }
    else if (t.type === 26 || t.type === 70) cur.place.push(parsePlace(t));
    else if (t.type === 28) cur.remove.push(t.data.readUInt16LE(0));
    else if (t.type === 5) cur.remove.push(t.data.readUInt16LE(2));
    else if (t.type === 43) cur.label = t.data.toString('utf8', 0, t.data.indexOf(0));
    else if (t.type === 12) cur.actions = (cur.actions || 0) + 1;
    else if (t.type === 15) { cur.sounds = cur.sounds || []; cur.sounds.push(t.data.readUInt16LE(0)); }
  }
  return frames;
}

function glyphPath(rr) {
  // SHAPE without style tables (font glyph): returns SVG path data in glyph units
  const nf = rr.ub(4), nl = rr.ub(4); let x = 0, y = 0; const d = [];
  for (;;) {
    if (rr.ub(1) === 0) {
      const flags = rr.ub(5); if (!flags) break;
      if (flags & 1) { const n = rr.ub(5); x = rr.sb(n); y = rr.sb(n); d.push(`M${x} ${y}`); }
      if (flags & 2) rr.ub(nf); if (flags & 4) rr.ub(nf); if (flags & 8) rr.ub(nl);
    } else if (rr.ub(1) === 1) {
      const n = rr.ub(4) + 2;
      if (rr.ub(1)) { const dx = rr.sb(n), dy = rr.sb(n); x += dx; y += dy; } else if (rr.ub(1)) { y += rr.sb(n); } else { x += rr.sb(n); }
      d.push(`L${x} ${y}`);
    } else {
      const n = rr.ub(4) + 2; const cx = x + rr.sb(n), cy = y + rr.sb(n); x = cx + rr.sb(n); y = cy + rr.sb(n);
      d.push(`Q${cx} ${cy} ${x} ${y}`);
    }
  }
  rr.align();
  return d.join('');
}

function parseFont(D, v3) {
  const rr = new Bits(D); rr.u16(); const flags = rr.u8(); rr.u8();
  const nameLen = rr.u8(); const name = D.toString('utf8', rr.p, rr.p + nameLen); rr.p += nameLen;
  const num = rr.u16(); const wide = !!(flags & 8), wideCodes = !!(flags & 4);
  const base = rr.p; const offs = [];
  for (let i = 0; i < num; i++) offs.push(wide ? rr.u32() : rr.u16());
  const codeOff = wide ? rr.u32() : rr.u16();
  const glyphs = [];
  for (let i = 0; i < num; i++) { const g = new Bits(D, base + offs[i]); glyphs.push(glyphPath(g)); }
  const cr = new Bits(D, base + codeOff); const codes = [];
  for (let i = 0; i < num; i++) codes.push(wideCodes ? cr.u16() : cr.u8());
  const out = { name, em: v3 ? 20480 : 1024, glyphs, codes, bold: !!(flags & 1), italic: !!(flags & 2) };
  if (flags & 0x80) { const lr = new Bits(D, cr.p); out.ascent = lr.u16() | 0; out.descent = lr.u16() | 0; out.leading = lr.u16() | 0; out.adv = []; for (let i = 0; i < num; i++) { let v = lr.u16(); if (v > 32767) v -= 65536; out.adv.push(v); } }
  return out;
}

export function parseSwf(path) {
  const d = readFileSync(path);
  const body = d.subarray(0, 3).toString() === 'CWS' ? inflateSync(d.subarray(8)) : d.subarray(8);
  const r = new Bits(body);
  const stage = r.rect(); const fps = r.u16() / 256; const nframes = r.u16();
  const tags = readTags(body, r.p, body.length);
  const fontIds = {}; const chars = {}; const sprites = {}; const exports = {}; const sounds = {};
  for (const t of tags) {
    const D = t.data;
    switch (t.type) {
      case 2: case 22: case 32: case 83: { const rr = new Bits(D); const id = rr.u16(); chars[id] = { type: 'shape', bounds: rr.rect() }; break; }
      case 46: case 84: { const rr = new Bits(D); const id = rr.u16(); chars[id] = { type: 'morph', bounds: rr.rect() }; break; }
      case 11: case 33: {
        const rr = new Bits(D); const id = rr.u16(); const bounds = rr.rect(); const m = rr.matrix();
        const gb = rr.u8(), ab = rr.u8(); const runs = []; const st = { fontId: undefined, color: undefined, height: undefined, y: undefined };
        for (;;) {
          const f = rr.u8(); if (!f) break;
          if (f & 0x80) {
            const cur = { glyphs: [], idx: [] };
            if (f & 8) st.fontId = rr.u16();
            if (f & 4) st.color = t.type === 33 ? [rr.u8(), rr.u8(), rr.u8(), rr.u8()] : [rr.u8(), rr.u8(), rr.u8(), 255];
            if (f & 1) { let x = rr.u16(); if (x > 32767) x -= 65536; cur.x = x / 20; }
            if (f & 2) { let y = rr.u16(); if (y > 32767) y -= 65536; st.y = y / 20; }
            if (f & 8) st.height = rr.u16() / 20;
            cur.fontId = st.fontId; cur.color = st.color; cur.height = st.height; cur.y = st.y;
            const n = rr.u8();
            for (let i = 0; i < n; i++) { cur.idx.push(rr.ub(gb)); cur.glyphs.push(rr.sb(ab) / 20); }
            rr.align(); runs.push(cur);
          } else break;
        }
        chars[id] = { type: 'text', bounds, m, runs }; break;
      }
      case 37: {
        const rr = new Bits(D); const id = rr.u16(); const bounds = rr.rect();
        const f1 = rr.u8(), f2 = rr.u8(); const t = { type: 'edittext', bounds, multiline: !!(f1 & 0x20), wordwrap: !!(f1 & 0x40), readOnly: !!(f1 & 8) };
        if (f1 & 1) { t.fontId = rr.u16(); if (f2 & 0x80) rr.cstr(); t.fontSize = rr.u16() / 20; }
        if (f1 & 4) { t.color = [rr.u8(), rr.u8(), rr.u8(), rr.u8()]; }
        if (f1 & 2) t.maxLength = rr.u16();
        if (f2 & 0x20) { t.align = rr.u8(); t.leftMargin = rr.u16() / 20; t.rightMargin = rr.u16() / 20; t.indent = rr.u16() / 20; t.leading = rr.u16() / 20; }
        t.variable = rr.cstr();
        if (f1 & 0x80) t.text = rr.cstr();
        t.html = !!(f2 & 2);
        chars[id] = t; break;
      }
      case 48: case 75: fontIds[D.readUInt16LE(0)] = parseFont(D, t.type === 75); break;
      case 6: case 20: case 21: case 35: case 36: case 90: { chars[D.readUInt16LE(0)] = { type: 'bitmap' }; break; }
      case 14: { sounds[D.readUInt16LE(0)] = { fmt: D[2] >> 4, rate: D[2] >> 2 & 3, samples: D.readUInt32LE(3) }; break; }
      case 56: { const rr = new Bits(D); const n = rr.u16(); for (let i = 0; i < n; i++) { const id = rr.u16(); exports[rr.cstr()] = id; } break; }
      case 34: { // DefineButton2
        const rr = new Bits(D); const id = rr.u16(); rr.u8(); const actionOffset = rr.u16(); const recs = [];
        for (;;) { const f = rr.u8(); if (!f) break; const rec = { states: f & 15, id: rr.u16(), depth: rr.u16(), m: rr.matrix() }; if (f & 16) { /* filter list present */ } rr.cxform(true); if (f & 16) { const nf = rr.u8(); void nf; } recs.push(rec); if (f & 16) break; }
        chars[id] = { type: 'button', records: recs };
        break;
      }
      case 39: {
        const id = D.readUInt16LE(0); const n = D.readUInt16LE(2);
        const inner = readTags(D, 4, D.length);
        sprites[id] = { id, numFrames: n, frames: parseTimeline(inner), };
        chars[id] = { type: 'sprite' };
        break;
      }
      default: break;
    }
  }
  const main = parseTimeline(tags);
  return { stage, fps, nframes, chars, sprites, exports, sounds, main, fontIds };
}

if (process.argv[1].endsWith('parse.mjs')) {
  const swf = parseSwf(process.argv[2]);
  writeFileSync(process.argv[3] || 'swf.json', JSON.stringify(swf));
  console.log('stage', swf.stage, 'fps', swf.fps, 'sprites', Object.keys(swf.sprites).length, 'chars', Object.keys(swf.chars).length, 'exports', swf.exports);
}
