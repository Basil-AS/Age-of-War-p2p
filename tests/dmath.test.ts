import { describe, expect, it } from 'vitest';
import { datan2, dcos, dsin } from '../src/orig/dmath';

describe('deterministic trig', () => {
  it('matches Math.* to ~1e-12 over a wide range', () => {
    for (let d = -720; d <= 720; d += 0.37) {
      const r = d * 0.017453292519943295;
      expect(Math.abs(dsin(r) - Math.sin(r))).toBeLessThan(1e-12);
      expect(Math.abs(dcos(r) - Math.cos(r))).toBeLessThan(1e-12);
    }
    for (let x = -50; x <= 50; x += 3.3)
      for (let y = -50; y <= 50; y += 2.9) expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-12);
  });
});
