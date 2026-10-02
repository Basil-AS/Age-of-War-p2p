/** mulberry32 — tiny, fast, fully deterministic 32-bit PRNG. */
export class Rng {
  constructor(public s: number) {
    this.s = s >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}
