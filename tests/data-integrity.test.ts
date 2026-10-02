import { existsSync, readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { data } from './helpers';

type Frame = { a: number; x: number; y: number; w: number; h: number; ox: number; oy: number; k?: number };
type Manifest = {
  size: number;
  scale: number;
  atlases: { file: string; bucket: string; w: number; h: number; bytes: number }[];
  frames: Record<string, Frame>;
};

for (const q of ['hd', 'sd'] as const) {
  describe(`${q} atlases`, () => {
    const m = JSON.parse(readFileSync(`public/orig/${q}/manifest.json`, 'utf8')) as Manifest;
    it('every atlas file exists, has the byte size and pixel size in the manifest', async () => {
      for (const a of m.atlases) {
        const f = `public/orig/${q}/${a.file}`;
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size).toBe(a.bytes);
        const meta = await sharp(f).metadata();
        expect([meta.width, meta.height]).toEqual([a.w, a.h]);
        expect(a.w).toBeLessThanOrEqual(4096);
        expect(a.h).toBeLessThanOrEqual(4096);
      }
    });
    it('every frame lies inside its atlas and has sane density', () => {
      for (const [key, f] of Object.entries(m.frames)) {
        if (f.a < 0) continue;
        const a = m.atlases[f.a];
        expect(a, key).toBeTruthy();
        expect(f.x, key).toBeGreaterThanOrEqual(0);
        expect(f.y, key).toBeGreaterThanOrEqual(0);
        expect(f.x + f.w, key).toBeLessThanOrEqual(a?.w ?? 0);
        expect(f.y + f.h, key).toBeLessThanOrEqual(a?.h ?? 0);
        const k = f.k ?? m.scale;
        expect(k, key).toBeGreaterThan(0.5);
        expect(k, key).toBeLessThanOrEqual(m.scale + 1e-6);
      }
    });
    it('frames of one atlas never overlap', () => {
      const byAtlas = new Map<number, [string, Frame][]>();
      for (const e of Object.entries(m.frames))
        if (e[1].a >= 0) (byAtlas.get(e[1].a) ?? byAtlas.set(e[1].a, []).get(e[1].a))?.push(e);
      for (const list of byAtlas.values()) {
        list.sort((p, r) => p[1].y - r[1].y);
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const A = list[i] as [string, Frame];
            const B = list[j] as [string, Frame];
            if (B[1].y >= A[1].y + A[1].h) break;
            const overlap =
              A[1].x < B[1].x + B[1].w &&
              B[1].x < A[1].x + A[1].w &&
              A[1].y < B[1].y + B[1].h &&
              B[1].y < A[1].y + A[1].h;
            expect(overlap, `${A[0]} × ${B[0]}`).toBe(false);
          }
      }
    });
    it('contains every unit / turret / base animation frame the sim can show', () => {
      const missing: string[] = [];
      const need = (clip: number | undefined, frames: number) => {
        if (clip === undefined) return;
        for (let f = 1; f <= frames; f++) if (!(`s${clip}.${f}` in m.frames)) missing.push(`s${clip}.${f}`);
      };
      for (const u of Object.values(data.units) as ({ states: Record<string, { id: number; n: number }> } | null)[])
        for (const a of Object.values(u?.states ?? {})) need(a.id, a.n);
      for (const t of Object.values(data.turrets) as ({ clip: { id: number; n: number } } | null)[])
        if (t) need(t.clip.id, t.clip.n);
      expect(missing.slice(0, 10)).toEqual([]);
    });
  });
}

describe('data tables', () => {
  it('has 16 units, 15 turrets and consistent shapes', () => {
    expect(data.EN.length).toBe(17); // index 0 unused
    expect(data.TU.length).toBe(16);
    expect(data.ES.length).toBeGreaterThanOrEqual(17);
    for (let i = 1; i <= 16; i++) {
      const [name, cost, time] = data.EN[i] as [string, number, number];
      expect(typeof name).toBe('string');
      expect(cost).toBeGreaterThan(0);
      expect(time).toBeGreaterThan(0);
    }
    // each age's units get more expensive
    for (let age = 0; age < 5; age++) {
      const lo = age * 3 + 1;
      const c = [lo, lo + 1, lo + 2].map((i) => (data.EN[i] as [string, number, number])[1]);
      expect(c[0]).toBeLessThanOrEqual(c[2] as number);
    }
  });
  it('every sound referenced by the data exists on disk', () => {
    for (const [id, file] of Object.entries(data.sounds))
      expect(existsSync(`public/orig/snd/${file}`), `${id}:${file}`).toBe(true);
  });
  it('fonts, ui and manifest json parse', () => {
    for (const f of ['fonts.json', 'ui.json', 'data.json'])
      expect(() => JSON.parse(readFileSync(`public/orig/${f}`, 'utf8'))).not.toThrow();
  });
});
