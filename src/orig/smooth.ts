/** previous / current simulation position: the picture is drawn between them (the sim ticks at 40 Hz, screens refresh at 60–240 Hz) */
export class Smooth {
  px = 0;
  py = 0;
  pr = 0;
  cx = 0;
  cy = 0;
  cr = 0;
  set(x: number, y: number, r = 0) {
    this.cx = x;
    this.cy = y;
    this.cr = r;
    this.px = x;
    this.py = y;
    this.pr = r;
  }
  push(x: number, y: number, r = 0) {
    this.px = this.cx;
    this.py = this.cy;
    this.pr = this.cr;
    this.cx = x;
    this.cy = y;
    this.cr = r;
  }
  x(a: number) {
    return this.px + (this.cx - this.px) * a;
  }
  y(a: number) {
    return this.py + (this.cy - this.py) * a;
  }
  /** angle in degrees, along the shortest way round */
  r(a: number) {
    let d = (this.cr - this.pr) % 360;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    return this.pr + d * a;
  }
}
