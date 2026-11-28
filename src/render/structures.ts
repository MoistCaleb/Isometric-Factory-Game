// Structures + base parts mesh (DESIGN §3 Building). Rebuilt as one vertex-coloured mesh around the camera when
// anything relevant changes (counts stay small in P2; per-chunk split later if needed).
// Near-side walls render low (unless Base Build); roofs on the viewed storey go see-through when zoomed in.
import * as THREE from 'three';
import { CABLES, CHANNELS, FX, MULTI_PARTS, PIPES, conduitsJoin, isConduit, sideOpen, STRUCTURES, multiCells, type Box } from '../data/structures';
import { STOREY, type Ent } from '../sim/state';
import { CROP, SAPLING, stage } from '../data/crops';
import { TREE_PARTS } from './chunks';

const MODELS = new Map(STRUCTURES.map((s) => [s.id, s.model]));
const STRUCT = new Map(STRUCTURES.map((s) => [s.id, s]));
const TOP = new Map(STRUCTURES.map((s) => [s.id, Math.max(...s.model.map((b) => b[4])) / 16]));
/** Status icon colour by machine status (sim/machines MS): idle none · working · no input · full · cold · incomplete · no water ·
 * crank · no fuel · no steam · dry · no water in · surveyed · mined out · no sun. */
const MS_COL = [0, 0, /* working: shown by the model (P5g) */ 0xe8c040, 0xe04030, 0xe8c040, 0xe04030, 0xe04030, 0x40a0ff, 0xe8c040, 0xe8c040, 0xff2020, 0xe8c040, 0x40a0ff, 0xe04030, 0xe8c040, 0xe8c040, 0x40a0ff, 0xe8c040, 0xe8c040, 0xe04030, 0xe8c040, 0xe8c040];
const COLOR = new Map(STRUCTURES.map((s) => [s.id, s.color]));
const PUFF = new Map(STRUCTURES.filter((s) => s.puff).map((s) => [s.id, s.puff!]));
/** Statuses that light hot parts (working, heating up) and turn spinning parts (working). */
const HOT_MS = new Set([1, 4]);
const ember = (c: number) => (Math.round(((c >> 16) & 255) * 0.3) << 16) | (Math.round(((c >> 8) & 255) * 0.22) << 8) | Math.round((c & 255) * 0.18);
/** A part turning while its machine works: centre, size (world units), colour, axis (0 vertical, 1 front–back), model rotation. */
export interface Spin { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number; axis: 0 | 1; r: number }
/** A smoke (0) / steam (1) emitter at a world position. */
export interface Puff { x: number; y: number; z: number; k: 0 | 1 }
const rot16 = (u: number, v: number, r: number) => { let px = u - 8, pz = v - 8; for (let i = 0; i < r; i++) [px, pz] = [-pz, px]; return [px + 8, pz + 8]; };
/** Pipe arms toward the 6 neighbours: [dx, dy(row), db, box in 16ths]. */
const ARMS: [number, number, number, Box][] = [
  [1, 0, 0, [11, 6, 6, 16, 10, 10, 0]], [-1, 0, 0, [0, 6, 6, 5, 10, 10, 0]], [0, 1, 0, [6, 6, 11, 10, 10, 16, 0]],
  [0, -1, 0, [6, 6, 0, 10, 10, 5, 0]], [0, 0, 1, [6, 11, 6, 10, 16, 10, 0]], [0, 0, -1, [6, 0, 6, 10, 5, 10, 0]],
];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const SLAB = 0.06, WALL_T = 0.1, LOW = 0.22;
const C = { floor: 0x8a7a64, found: 0x6a6a70, wall: 0xc8bca8, window: 0x9ac8e8, door: 0x7a5430, roof: 0x8a3a2a, light: 0xffe890, post: 0x404040 };

class Boxes {
  pos: number[] = []; nor: number[] = []; col: number[] = [];
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) {
    const c = new THREE.Color(color);
    const F: [number[], number[][]][] = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
      [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
      [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
      [[0, 0, 1], [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
    ];
    for (const [n, q] of F) for (const i of [0, 1, 2, 0, 2, 3]) { this.pos.push(...q[i]); this.nor.push(...n); this.col.push(c.r, c.g, c.b); }
  }
  /** Model boxes (16ths) rotated r×90° about the tile centre, placed at tile (x, z), base height y. */
  model(m: Box[], x: number, y: number, z: number, r: number, tint?: number, fx?: { hot: boolean; spin: boolean; glow: Boxes; spins: Spin[] }) {
    for (const [a, b, c, d, e, f, col, k] of m) {
      let p = [rot16(a, c, r), rot16(d, f, r)];
      p = [[Math.min(p[0][0], p[1][0]), Math.min(p[0][1], p[1][1])], [Math.max(p[0][0], p[1][0]), Math.max(p[0][1], p[1][1])]];
      const X0 = x + p[0][0] / 16, Y0 = y + b / 16, Z0 = z + p[0][1] / 16, X1 = x + p[1][0] / 16, Y1 = y + e / 16, Z1 = z + p[1][1] / 16;
      if (tint === undefined && k === FX.hot && fx) {
        if (fx.hot) fx.glow.add(X0, Y0, Z0, X1, Y1, Z1, col); else this.add(X0, Y0, Z0, X1, Y1, Z1, ember(col));
      } else if (tint === undefined && (k === FX.spin || k === FX.spinZ) && fx?.spin) {
        fx.spins.push({ x: (X0 + X1) / 2, y: (Y0 + Y1) / 2, z: (Z0 + Z1) / 2, sx: (d - a) / 16, sy: (e - b) / 16, sz: (f - c) / 16, c: col, axis: k === FX.spin ? 0 : 1, r });
      } else this.add(X0, Y0, Z0, X1, Y1, Z1, tint ?? col);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Edge part (wall/window/door) along x (n edge) or z (w edge) starting at (x, z), height h (< 1 = cut-away low wall). */
function edge(bx: Boxes, x: number, y: number, z: number, along: 'x' | 'z', v: number, h: number) {
  const seg = (a0: number, a1: number, y0: number, y1: number, col: number) => along === 'x'
    ? bx.add(x + a0, y + y0 * H, z - WALL_T / 2, x + a1, y + y1 * H, z + WALL_T / 2, col)
    : bx.add(x - WALL_T / 2, y + y0 * H, z + a0, x + WALL_T / 2, y + y1 * H, z + a1, col);
  const H = h < 1 ? 1 : h;
  if (v === 1 || h < 1) return seg(0, 1, 0, h < 1 ? h : 1, v === 3 ? C.door : C.wall);
  if (v === 2) { seg(0, 1, 0, 0.35, C.wall); seg(0, 1, 0.35, 0.75, C.window); seg(0, 1, 0.75, 1, C.wall); return; }
  seg(0, 0.2, 0, 1, C.wall); seg(0.8, 1, 0, 1, C.wall); seg(0.2, 0.8, 0.85, 1, C.wall); seg(0.25, 0.75, 0, 0.82, C.door);
}

/** Crop sticks / a crop on a planter (P5h): 3×3 tufts, taller per stage, the crop's colour on top when mature. */
function crop(bx: Boxes, e: Ent, x: number, y: number, z: number) {
  const top = y + 6 / 16, STICK = 0xc8a070;
  for (const u of [3, 13]) for (const w of [3, 13]) bx.add(x + u / 16 - 0.03, top, z + w / 16 - 0.03, x + u / 16 + 0.03, top + 0.55, z + w / 16 + 0.03, STICK);
  bx.add(x + 3 / 16, top + 0.45, z + 3 / 16 - 0.02, x + 13 / 16, top + 0.49, z + 3 / 16 + 0.02, STICK);
  bx.add(x + 3 / 16, top + 0.45, z + 13 / 16 - 0.02, x + 13 / 16, top + 0.49, z + 13 / 16 + 0.02, STICK);
  if (e.pl === 'sticks') return;
  const c = CROP.get(e.pl!), st = stage(e.g ?? 0), h = [0.08, 0.18, 0.3, 0.42][st], GREEN = st < 2 ? 0x6ab040 : 0x4a8a2a;
  for (const u of [4.5, 8, 11.5]) for (const w of [4.5, 8, 11.5]) {
    const hh = h * (0.85 + ((u * 7 + w * 3) % 5) * 0.06), X = x + u / 16, Z = z + w / 16;
    bx.add(X - 0.025, top, Z - 0.025, X + 0.025, top + hh, Z + 0.025, GREEN);
    if (st >= 1) bx.add(X - 0.07, top + hh * 0.55, Z - 0.02, X + 0.07, top + hh * 0.65, Z + 0.02, GREEN);
    if (st === 3 && c) bx.add(X - 0.05, top + hh, Z - 0.05, X + 0.05, top + hh + 0.09, Z + 0.05, c.color);
  }
}

/** Planted tree (P5h): grows from a sapling to a full 2-storey tree by stage. */
function plantedTree(bx: Boxes, e: Ent, x: number, y: number, z: number) {
  const parts = TREE_PARTS[SAPLING.get(e.pl ?? '')?.tree ?? 1], k = [0.12, 0.3, 0.6, 1][stage(e.g ?? 0)];
  for (const [w, h, yy, c] of parts) bx.add(x + 0.5 - (w * k) / 2, y + yy * k, z + 0.5 - (w * k) / 2, x + 0.5 + (w * k) / 2, y + (yy + h) * k, z + 0.5 + (w * k) / 2, c);
}

export interface StructView {
  ents: Record<string, Ent>; base: Record<string, number>; w: number;
  cx: number; cy: number; radius: number;
  /** Highest storey shown (view level). */
  top: number; rot: number; baseMode: boolean; zoomedOut: boolean;
  /** Machine statuses by ent key (status icons). */
  ms?: Record<string, number>;
  /** Multiblock ghost casings to show: ent key → structure id. */
  ghosts?: Record<string, string>;
}

export interface StructGeo { solid: THREE.BufferGeometry; glass: THREE.BufferGeometry; ghost: THREE.BufferGeometry; glow: THREE.BufferGeometry; spins: Spin[]; puffs: Puff[] }

export function buildStructs(v: StructView): StructGeo {
  const solid = new Boxes(), glass = new Boxes(), ghost = new Boxes(), glow = new Boxes(), spins: Spin[] = [], puffs: Puff[] = [];
  const th = Math.PI / 4 + v.rot * (Math.PI / 2), camZ = Math.cos(th) > 0, camX = Math.sin(th) > 0;
  const wx = (x: number) => v.cx + mod(x - v.cx + v.w / 2, v.w) - v.w / 2;
  const near = (x: number, y: number) => Math.abs(wx(x) - v.cx) < v.radius && Math.abs(y - v.cy) < v.radius;
  const used = (x: number, y: number, f: number) => !!v.base[`${mod(x, v.w)},${y},${f},f`] || [0, 1, 2].some((i) => !!v.ents[`${mod(x, v.w)},${y},${f * STOREY + i}`]);
  /** Render base height of a structure at block level b (on a floor slab at a storey base). */
  const baseY = (x: number, y: number, b: number) => b + (b % STOREY === 0 && v.base[`${x},${y},${b / STOREY},f`] ? SLAB : 0);
  for (const [k, e] of Object.entries(v.ents)) {
    const [x, y, b] = k.split(',').map(Number), f = Math.floor(b / STOREY);
    // Multiblocks show full height whatever the view level (they're one machine).
    if ((f > v.top && !MULTI_PARTS.has(e.s)) || !near(x, y)) continue;
    const m = MODELS.get(e.s);
    const y0 = baseY(x, y, b);
    const cab = CABLES.get(e.s), pipe = PIPES.has(e.s);
    if (pipe || (cab && !cab.fuse)) {
      // Pipe: hub + arms to the same pipe or any machine. Cable (P4a): arms to any cable or machine, as thick as its model.
      const col = COLOR.get(e.s)!, h = cab ? (m![0][3] - m![0][0]) / 2 : 3, lo = 8 - h, hi = 8 + h;
      const fit = (c: number) => (!cab ? c : c === 5 || c === 6 ? lo : c === 10 || c === 11 ? hi : c);
      const arms: Box[] = [[lo, lo, lo, hi, hi, hi, col]];
      ARMS.forEach(([dx, dy, db, bx], i) => {
        const n = b + db >= 0 && v.ents[`${mod(x + dx, v.w)},${y + dy},${b + db}`];
        // Joins a conduit by the channel/cut rules; any other structure if this side isn't cut.
        if (n && (isConduit(n.s) ? conduitsJoin(e, n, i) : sideOpen(e, i))) arms.push([...(bx.slice(0, 6) as number[]).map(fit), col] as unknown as Box);
      });
      // Channel band around the hub.
      if (e.ch) arms.push([lo - 0.5, lo + h * 0.6, lo - 0.5, hi + 0.5, hi - h * 0.6, hi + 0.5, CHANNELS[e.ch]]);
      solid.model(arms, wx(x), y0, y, 0);
    } else if (e.s === 'tree') plantedTree(solid, e, wx(x), y0, y);
    else if (m) {
      if (e.s === 'planter' && e.pl) crop(solid, e, wx(x), y0, y);
      const st = v.ms?.[k] ?? 0, hot = HOT_MS.has(st);
      solid.model(m, wx(x), y0, y, e.r, undefined, { hot, spin: st === 1, glow, spins });
      if (hot) for (const [px, py, pz, kind] of PUFF.get(e.s) ?? []) { const [u, w] = rot16(px, pz, e.r); puffs.push({ x: wx(x) + u / 16, y: y0 + py / 16, z: y + w / 16, k: kind }); }
    }
    const col = MS_COL[v.ms?.[k] ?? 0];
    if (col) { const h = y0 + (TOP.get(e.s) ?? 0.5) + 0.15, X = wx(+x), Y = +y; solid.add(X + 0.42, h, Y + 0.42, X + 0.58, h + 0.16, Y + 0.58, col); }
  }
  for (const [k, id] of Object.entries(v.ghosts ?? {})) {
    const [x, y, b] = k.split(',').map(Number), m = MODELS.get(id);
    if (m && near(x, y)) ghost.model(m, wx(x), baseY(x, y, b), y, 0, 0xffffff);
  }
  for (const [k, val] of Object.entries(v.base)) {
    const p = k.split(','), x = +p[0], y = +p[1], f = +p[2], part = p[3];
    if (f > v.top || !near(x, y)) continue;
    const X = wx(x), Y = f * STOREY, R = Y + STOREY;
    if (part === 'f') solid.add(X, Y, y, X + 1, Y + SLAB, y + 1, f === 0 ? C.found : C.floor);
    else if (part === 'l') { solid.add(X + 0.45, Y, y + 0.45, X + 0.55, Y + 0.55, y + 0.55, C.post); solid.add(X + 0.38, Y + 0.55, y + 0.38, X + 0.62, Y + 0.75, y + 0.62, C.light); }
    else if (part === 'r') {
      if (f < v.top || v.zoomedOut) solid.add(X, R, y, X + 1, R + SLAB * 1.5, y + 1, C.roof);
      else glass.add(X, R, y, X + 1, R + SLAB, y + 1, C.roof);
    } else {
      // Low when the tile behind it (away from the camera) is in use — keeps rooms visible.
      const far = part === 'n' ? (camZ ? used(x, y - 1, f) : used(x, y, f)) : camX ? used(x - 1, y, f) : used(x, y, f);
      const h = v.baseMode || f < v.top ? STOREY : far ? LOW : STOREY;
      edge(solid, X, Y, y, part === 'n' ? 'x' : 'z', val, h);
    }
  }
  return { solid: solid.geometry(), glass: glass.geometry(), ghost: ghost.geometry(), glow: glow.geometry(), spins, puffs };
}

/** Ghost preview geometry for the build cursor. */
export function ghostGeometry(g: { kind: 'struct'; id: string; r: number } | { kind: 'base'; part: string; side: string } | { kind: 'demolish' }
  | { kind: 'bp'; cells: [number, number, number, string, number][] } | { kind: 'area'; x0: number; y0: number; x1: number; y1: number }): THREE.BufferGeometry {
  const bx = new Boxes();
  if (g.kind === 'bp') { for (const [dx, dy, db, id, r] of g.cells) bx.model(MODELS.get(id) ?? [[1, 0, 1, 15, 8, 15, 0xffffff]], dx, db, dy, r, 0xffffff); return bx.geometry(); }
  if (g.kind === 'area') {
    const T = 0.08, { x0, y0, x1, y1 } = g, c = 0x60c0ff;
    bx.add(x0, 0, y0, x1, T, y0 + T, c); bx.add(x0, 0, y1 - T, x1, T, y1, c); bx.add(x0, 0, y0, x0 + T, T, y1, c); bx.add(x1 - T, 0, y0, x1, T, y1, c);
    return bx.geometry();
  }
  if (g.kind === 'struct') {
    bx.model(MODELS.get(g.id) ?? [[1, 0, 1, 15, 8, 15, 0xffffff]], 0, 0, 0, g.r, 0xffffff);
    // Multiblock controller: show the whole footprint as it will face (P3d rotation).
    const st = STRUCT.get(g.id);
    if (st?.multi) for (const { c: [dx, dy, db] } of multiCells(st, g.r)) bx.add(dx + 0.1, db + 0.1, dy + 0.1, dx + 0.9, db + 0.9, dy + 0.9, 0xffffff);
  }
  else if (g.kind === 'demolish') bx.add(-0.02, 0, -0.02, 1.02, 0.5, 1.02, 0xff4030);
  else if (g.part === 'floor') bx.add(0, 0, 0, 1, SLAB, 1, 0xffffff);
  else if (g.part === 'roof') bx.add(0, STOREY, 0, 1, STOREY + SLAB, 1, 0xffffff);
  else if (g.part === 'light') bx.add(0.38, 0, 0.38, 0.62, 0.75, 0.62, 0xffffff);
  else {
    const v = g.part === 'window' ? 2 : g.part === 'door' ? 3 : 1;
    const s = g.side;
    edge(bx, s === 'e' ? 1 : 0, 0, s === 's' ? 1 : 0, s === 'n' || s === 's' ? 'x' : 'z', v, STOREY);
  }
  return bx.geometry();
}
