// Deterministic hashing + gradient noise that wraps east–west (x periodic).

/** 32-bit integer hash of up to 4 ints. */
export function hash(seed: number, a: number, b = 0, c = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ (c | 0), 0x27d4eb2f); h ^= h >>> 15;
  return h >>> 0;
}
/** Hash → [0,1). */
export const hash01 = (seed: number, a: number, b = 0, c = 0) => hash(seed, a, b, c) / 4294967296;

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a: number, n: number) => ((a % n) + n) % n;

function grad(seed: number, ix: number, iy: number, dx: number, dy: number): number {
  const a = (hash(seed, ix, iy) / 4294967296) * Math.PI * 2;
  return Math.cos(a) * dx + Math.sin(a) * dy;
}

/** 2D gradient noise in lattice units, x wraps with period `px` cells. ≈[-0.7,0.7]. */
export function noise2(seed: number, x: number, y: number, px: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const xa = mod(x0, px), xb = mod(x0 + 1, px);
  const u = fade(fx), v = fade(fy);
  const n00 = grad(seed, xa, y0, fx, fy), n10 = grad(seed, xb, y0, fx - 1, fy);
  const n01 = grad(seed, xa, y0 + 1, fx, fy - 1), n11 = grad(seed, xb, y0 + 1, fx - 1, fy - 1);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

/**
 * Fractal noise over a wrapping world `w` tiles wide. `cells` = lattice cells across the world width
 * for the first octave (integer so it tiles). Returns ≈[-1,1].
 */
export function fbm(seed: number, x: number, y: number, w: number, cells: number, octaves: number, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, c = cells;
  for (let o = 0; o < octaves; o++) {
    const s = c / w;
    sum += amp * noise2(seed + o * 1013, x * s, y * s, c);
    norm += amp; amp *= gain; c *= 2;
  }
  return (sum / norm) * 1.6;
}

// ---- sphere-sampled noise (surface fields) ----
// The surface is a wrapping rectangle shown on a globe; sampling 3D noise at each tile's point on the unit sphere keeps
// shapes undistorted on the globe (the flat map then stretches east–west near the poles, like a real equirect map).

const G3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];

function g3(seed: number, ix: number, iy: number, iz: number, dx: number, dy: number, dz: number): number {
  const g = G3[hash(seed, ix, iy, iz) % 12];
  return g[0] * dx + g[1] * dy + g[2] * dz;
}

/** 3D gradient noise in lattice units, ≈[-1,1]. */
export function noise3(seed: number, x: number, y: number, z: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (i: number, j: number, k: number) => g3(seed, x0 + i, y0 + j, z0 + k, fx - i, fy - j, fz - k);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

/** Unit-sphere point for a tile center on a `w`×`h` equirect surface (row 0 = north). */
export function spherePoint(x: number, y: number, w: number, h: number): [number, number, number] {
  const lon = ((x + 0.5) / w) * Math.PI * 2, lat = (0.5 - (y + 0.5) / h) * Math.PI, c = Math.cos(lat);
  return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)];
}

/** Fractal noise on the sphere; `cells` = lattice cells around the equator for the first octave (same scale as `fbm`). ≈[-1,1]. */
export function sfbm(seed: number, p: readonly [number, number, number], cells: number, octaves: number, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, f = cells / (Math.PI * 2);
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(seed + o * 1013, p[0] * f + 17.31 * o, p[1] * f, p[2] * f);
    norm += amp; amp *= gain; f *= 2;
  }
  return (sum / norm) * SFBM_NORM;
}
const SFBM_NORM = 1.4; // matches fbm's spread so thresholds (sea level, rivers, …) carry over
