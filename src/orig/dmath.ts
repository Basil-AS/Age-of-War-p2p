/**
 * Deterministic trig. Browsers implement Math.sin/cos/atan2 with slightly different last-bit results,
 * which would desync a lockstep match between e.g. Chrome and Safari. These use only + - * / (exactly
 * rounded by IEEE-754 everywhere), so every engine returns the identical double.
 */
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

function reduce(x: number): number {
  // bring into [-PI, PI]
  x -= TWO_PI * Math.floor((x + PI) / TWO_PI);
  return x;
}

// 1/(2k+1)! with alternating sign, k = 1..10  (Taylor of sin)
const SIN_C = [
  -1 / 6,
  1 / 120,
  -1 / 5040,
  1 / 362880,
  -1 / 39916800,
  1 / 6227020800,
  -1 / 1307674368000,
  1 / 355687428096000,
  -1 / 121645100408832000,
  1 / 51090942171709440000,
];

export function dsin(x: number): number {
  x = reduce(x);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  let r = 1;
  let term = 1;
  for (let i = 0; i < SIN_C.length; i++) {
    term *= x2;
    r += term * (SIN_C[i] as number);
  }
  return x * r;
}
export const dcos = (x: number): number => dsin(x + HALF_PI);

export function datan(x: number): number {
  // argument reduction to |x| <= tan(pi/12) then series
  const neg = x < 0;
  if (neg) x = -x;
  let inv = false;
  if (x > 1) {
    x = 1 / x;
    inv = true;
  }
  let off = 0;
  if (x > 0.2679491924311227) {
    x = (x - 0.5773502691896257) / (1 + x * 0.5773502691896257);
    off = 0.5235987755982988;
  }
  const x2 = x * x;
  let r =
    x *
      (1 -
        x2 *
          (1 / 3 -
            x2 *
              (1 / 5 - x2 * (1 / 7 - x2 * (1 / 9 - x2 * (1 / 11 - x2 * (1 / 13 - x2 * (1 / 15 - x2 * (1 / 17))))))))) +
    off;
  if (inv) r = HALF_PI - r;
  return neg ? -r : r;
}

export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}

export const DEG = 0.017453292519943295;
export const RAD2DEG = 180 / PI;
