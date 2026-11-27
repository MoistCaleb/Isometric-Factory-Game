// Structures + base parts mesh (DESIGN §3 Building). Rebuilt as one vertex-coloured mesh around the camera when
// anything relevant changes (counts stay small in P2; per-chunk split later if needed).
// Near-side walls render low (unless Base Build); roofs on the viewed storey go see-through when zoomed in.
import * as THREE from 'three';
import { MULTI_PARTS, PIPES, STRUCTURES, type Box } from '../data/structures';
import { STOREY, type Ent } from '../sim/state';

const MODELS = new Map(STRUCTURES.map((s) => [s.id, s.model]));
const TOP = new Map(STRUCTURES.map((s) => [s.id, Math.max(...s.model.map((b) => b[4])) / 16]));
/** Status icon colour by machine status (sim/machines MS): idle none · working · no input · full · cold · incomplete · no water ·
 * crank · no fuel · no steam · dry · no water in · surveyed · mined out. */
const MS_COL = [0, 0x40d040, 0xe8c040, 0xe04030, 0xe8c040, 0xe04030, 0xe04030, 0x40a0ff, 0xe8c040, 0xe8c040, 0xff2020, 0xe8c040, 0x40a0ff, 0xe04030];
const COLOR = new Map(STRUCTURES.map((s) => [s.id, s.color]));
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
  model(m: Box[], x: number, y: number, z: number, r: number, tint?: number) {
    for (const [a, b, c, d, e, f, col] of m) {
      let p = [[a, c], [d, f]].map(([u, v]) => { let px = u - 8, pz = v - 8; for (let i = 0; i < r; i++) [px, pz] = [-pz, px]; return [px + 8, pz + 8]; });
      p = [[Math.min(p[0][0], p[1][0]), Math.min(p[0][1], p[1][1])], [Math.max(p[0][0], p[1][0]), Math.max(p[0][1], p[1][1])]];
      this.add(x + p[0][0] / 16, y + b / 16, z + p[0][1] / 16, x + p[1][0] / 16, y + e / 16, z + p[1][1] / 16, tint ?? col);
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

/** Returns [opaque mesh geometry, see-through roof geometry, ghost geometry]. */
export function buildStructs(v: StructView): [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry] {
  const solid = new Boxes(), glass = new Boxes(), ghost = new Boxes();
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
    if (PIPES.has(e.s)) {
      // Pipe: hub + arms to every neighbour it can join (same pipe or any structure).
      const col = COLOR.get(e.s)!, arms: Box[] = [[5, 5, 5, 11, 11, 11, col]];
      for (const [dx, dy, db, bx] of ARMS) {
        const n = b + db >= 0 && v.ents[`${mod(x + dx, v.w)},${y + dy},${b + db}`];
        if (n && (n.s === e.s || !PIPES.has(n.s))) arms.push([...bx.slice(0, 6), col] as Box);
      }
      solid.model(arms, wx(x), y0, y, 0);
    } else if (m) solid.model(m, wx(x), y0, y, e.r);
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
  return [solid.geometry(), glass.geometry(), ghost.geometry()];
}

/** Ghost preview geometry for the build cursor. */
export function ghostGeometry(g: { kind: 'struct'; id: string; r: number } | { kind: 'base'; part: string; side: string } | { kind: 'demolish' }): THREE.BufferGeometry {
  const bx = new Boxes();
  if (g.kind === 'struct') bx.model(MODELS.get(g.id) ?? [[1, 0, 1, 15, 8, 15, 0xffffff]], 0, 0, 0, g.r, 0xffffff);
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
