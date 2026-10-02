import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

/**
 * Collects leaf images (sprite frames / shapes / screens), trims transparent borders and packs them
 * into per-bucket texture atlases so the game can lazy-load by era.
 */
export class Packer {
  constructor(outDir, { size = 2048, pad = 2, lossy = true, quality = 92 } = {}) {
    this.out = outDir; this.size = size; this.pad = pad; this.lossy = lossy; this.quality = quality;
    this.items = new Map(); // key -> { bucket, loader(), ox, oy }
  }
  add(key, bucket, loader, ox, oy) { if (!this.items.has(key)) this.items.set(key, { bucket, loader, ox, oy }); }

  async build() {
    mkdirSync(this.out, { recursive: true });
    const buckets = new Map();
    let n = 0;
    for (const [key, it] of this.items) {
      let data, info;
      try { const buf = await it.loader(); ({ data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })); }
      catch { (buckets.get(it.bucket) ?? buckets.set(it.bucket, []).get(it.bucket)).push({ key, empty: true, ox: it.ox, oy: it.oy }); continue; }
      let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { (buckets.get(it.bucket) ?? buckets.set(it.bucket, []).get(it.bucket)).push({ key, empty: true, ox: it.ox, oy: it.oy }); continue; }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const crop = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract({ left: x0, top: y0, width: w, height: h }).raw().toBuffer();
      (buckets.get(it.bucket) ?? buckets.set(it.bucket, []).get(it.bucket)).push({ key, w, h, crop, ox: it.ox + x0, oy: it.oy + y0 });
      if (++n % 500 === 0) console.log('  trimmed', n);
    }
    const manifest = { size: this.size, atlases: [], frames: {} };
    for (const [bucket, list] of buckets) {
      const items = list.filter((i) => !i.empty);
      for (const e of list.filter((i) => i.empty)) manifest.frames[e.key] = { a: -1, x: 0, y: 0, w: 0, h: 0, ox: e.ox, oy: e.oy };
      items.sort((a, b) => b.h - a.h || b.w - a.w);
      const sheets = []; let cur = null;
      const newSheet = () => { cur = { rows: [], y: 0, placed: [] }; sheets.push(cur); };
      newSheet();
      for (const it of items) {
        const W = it.w + this.pad * 2, H = it.h + this.pad * 2;
        if (W > this.size || H > this.size) throw new Error(`image too large ${it.key} ${it.w}x${it.h}`);
        let row = cur.rows.find((r) => r.h >= H && r.x + W <= this.size && H >= r.h * 0.6);
        if (!row) {
          if (cur.y + H > this.size) { newSheet(); }
          row = { y: cur.y, h: H, x: 0 }; cur.rows.push(row); cur.y += H;
        }
        cur.placed.push({ it, x: row.x + this.pad, y: row.y + this.pad });
        row.x += W;
      }
      for (let si = 0; si < sheets.length; si++) {
        const s = sheets[si];
        const height = Math.min(this.size, Math.max(...s.placed.map((p) => p.y + p.it.h + this.pad)));
        const comp = s.placed.map((p) => ({ input: p.it.crop, raw: { width: p.it.w, height: p.it.h, channels: 4 }, left: p.x, top: p.y }));
        const name = `${bucket}-${si}.webp`;
        let img = sharp({ create: { width: this.size, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp);
        img = this.lossy ? img.webp({ quality: this.quality, alphaQuality: 100, effort: 5 }) : img.webp({ lossless: true, effort: 5 });
        const buf = await img.toBuffer();
        writeFileSync(`${this.out}/${name}`, buf);
        const ai = manifest.atlases.length;
        manifest.atlases.push({ file: name, bucket, w: this.size, h: height, bytes: buf.length });
        for (const p of s.placed) manifest.frames[p.it.key] = { a: ai, x: p.x, y: p.y, w: p.it.w, h: p.it.h, ox: p.it.ox, oy: p.it.oy };
        console.log(`  ${name} ${this.size}x${height} ${(buf.length / 1024).toFixed(0)}KB (${s.placed.length} frames)`);
      }
    }
    writeFileSync(`${this.out}/manifest.json`, JSON.stringify(manifest));
    return manifest;
  }
}
export const readPng = (f) => readFileSync(f);
