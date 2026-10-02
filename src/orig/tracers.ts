import { Container, Graphics } from 'pixi.js';

/** colour / look per ranged unit type: 5 archer, 8 musketeer, 11 infantry, 14 blaster, 16 super soldier */
const LOOK: Record<
  number,
  { color: number; core: number; width: number; len: number; speed: number; arrow?: boolean; flash: number }
> = {
  5: { color: 0x7a4a1c, core: 0xe9d3a0, width: 2, len: 16, speed: 26, arrow: true, flash: 0 },
  8: { color: 0xffd36b, core: 0xffffff, width: 2.4, len: 22, speed: 46, flash: 5 },
  11: { color: 0xffe08a, core: 0xffffff, width: 2, len: 20, speed: 52, flash: 4 },
  14: { color: 0x4de1ff, core: 0xe6fbff, width: 3.2, len: 26, speed: 40, flash: 6 },
  16: { color: 0xff5ac8, core: 0xfff0fb, width: 4.2, len: 32, speed: 44, flash: 8 },
};

interface Tracer {
  g: Graphics;
  x: number;
  y: number;
  dx: number;
  dy: number;
  left: number;
  look: (typeof LOOK)[number];
  ang: number;
}

/**
 * Cosmetic projectiles for ranged infantry. The original game applies their damage instantly and draws
 * nothing flying, so shots were invisible; this adds a quick arrow / bullet streak (and muzzle flash) from the
 * shooter to the target. Purely visual — it never touches the simulation.
 */
export class Tracers extends Container {
  private live: Tracer[] = [];
  private pool: Graphics[] = [];

  shoot(unit: number, x1: number, y1: number, x2: number, y2: number) {
    const look = LOOK[unit];
    if (!look || this.live.length > 80) return;
    const dist = Math.hypot(x2 - x1, y2 - y1) || 1;
    const g = this.pool.pop() ?? new Graphics();
    g.visible = true;
    this.addChild(g);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const steps = Math.max(2, Math.round(dist / look.speed));
    this.live.push({ g, x: x1, y: y1, dx: (x2 - x1) / steps, dy: (y2 - y1) / steps, left: steps, look, ang });
    // muzzle flash
    if (look.flash) {
      const f = new Graphics()
        .circle(0, 0, look.flash)
        .fill({ color: look.core, alpha: 0.9 })
        .circle(0, 0, look.flash * 1.9)
        .fill({ color: look.color, alpha: 0.35 });
      f.position.set(x1, y1);
      this.addChild(f);
      this.flashes.push({ f, left: 3 });
    }
  }
  private flashes: { f: Graphics; left: number }[] = [];

  /** once per simulation tick */
  tick() {
    for (const t of this.live) {
      t.x += t.dx;
      t.y += t.dy;
      t.left--;
    }
    for (const fl of this.flashes) fl.left--;
    this.flashes = this.flashes.filter((fl) => {
      if (fl.left > 0) return true;
      fl.f.destroy();
      return false;
    });
    this.live = this.live.filter((t) => {
      if (t.left > 0) return true;
      t.g.visible = false;
      this.pool.push(t.g);
      return false;
    });
  }

  /** draw between ticks (alpha 0…1) */
  render(alpha: number) {
    for (const t of this.live) {
      const x = t.x + t.dx * (alpha - 1);
      const y = t.y + t.dy * (alpha - 1);
      const { look, g, ang } = t;
      g.clear();
      const tx = x - Math.cos(ang) * look.len;
      const ty = y - Math.sin(ang) * look.len;
      g.moveTo(tx, ty).lineTo(x, y).stroke({ color: look.color, width: look.width, alpha: 0.85, cap: 'round' });
      g.moveTo(x - Math.cos(ang) * look.len * 0.45, y - Math.sin(ang) * look.len * 0.45)
        .lineTo(x, y)
        .stroke({ color: look.core, width: look.width * 0.5, cap: 'round' });
      if (look.arrow) {
        const hx = Math.cos(ang),
          hy = Math.sin(ang);
        g.poly([
          x + hx * 5,
          y + hy * 5,
          x - hx * 2 - hy * 3,
          y - hy * 2 + hx * 3,
          x - hx * 2 + hy * 3,
          y - hy * 2 - hx * 3,
        ]).fill(0xcfd3d8);
      }
    }
  }

  clear() {
    for (const t of this.live) t.g.destroy();
    for (const f of this.flashes) f.f.destroy();
    this.live = [];
    this.flashes = [];
  }
}
