import { describe, expect, it } from 'vitest';
import { Smooth } from '../src/orig/smooth';

describe('Smooth (render interpolation between sim ticks)', () => {
  it('starts at the initial position for any alpha', () => {
    const s = new Smooth();
    s.set(10, 20, 30);
    for (const a of [0, 0.5, 1]) expect([s.x(a), s.y(a), s.r(a)]).toEqual([10, 20, 30]);
  });
  it('moves linearly from the previous tick to the current one', () => {
    const s = new Smooth();
    s.set(0, 0);
    s.push(10, -4);
    expect([s.x(0), s.y(0)]).toEqual([0, 0]);
    expect([s.x(0.5), s.y(0.5)]).toEqual([5, -2]);
    expect([s.x(1), s.y(1)]).toEqual([10, -4]);
    s.push(30, 0); // next tick: previous becomes the old current
    expect(s.x(0)).toBe(10);
    expect(s.x(1)).toBe(30);
  });
  it('rotates along the shortest way round (no 350° spin when crossing 0°)', () => {
    const s = new Smooth();
    s.set(0, 0, 350);
    s.push(0, 0, 10);
    expect(s.r(0.5)).toBeCloseTo(360, 5); // 350 → 370, halfway = 360
    s.set(0, 0, 10);
    s.push(0, 0, 350);
    expect(s.r(0.5)).toBeCloseTo(0, 5);
    s.set(0, 0, 90);
    s.push(0, 0, 100);
    expect(s.r(0.5)).toBeCloseTo(95, 5);
  });
  it('a position never overshoots the two samples (smooth, no jitter)', () => {
    const s = new Smooth();
    s.set(100, 0);
    let x = 100;
    for (let tick = 0; tick < 50; tick++) {
      x += 0.7; // a unit walking at the original speed
      s.push(x, 0);
      let last = s.x(0);
      for (let a = 0.1; a <= 1.0001; a += 0.1) {
        const v = s.x(Math.min(1, a));
        expect(v).toBeGreaterThanOrEqual(last - 1e-9);
        expect(v).toBeLessThanOrEqual(x + 1e-9);
        last = v;
      }
    }
  });
});
