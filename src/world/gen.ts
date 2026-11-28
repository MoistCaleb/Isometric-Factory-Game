// Deterministic planet generation (DESIGN §3): pure functions of (seed, planet, x, y, z).
// World = seed + diffs; diffs are applied by callers (see sim/state `diffs`).
import { CROPS } from '../data/crops';
import type { PlanetDef } from '../data/planets';
import { RARITY_SIZE, VEINS, type Biome, type VeinDef } from '../data/veins';
import { B, oreBlock } from './blocks';
import { fbm, hash, hash01, sfbm, spherePoint } from './noise';

export const Water = { None: 0, River: 1, Lake: 2, Ocean: 3 } as const;
export type Water = (typeof Water)[keyof typeof Water];
/** Share of land tiles with a wild plant (before biome/terrain filters). */
export const WILD_DENSITY = 0.012;
export const Tree = { None: 0, Broadleaf: 1, Conifer: 2, Jungle: 3, Cactus: 4 } as const;
export type Tree = (typeof Tree)[keyof typeof Tree];
export const LAYERS = { surface: 0, soil: [1, 2], stone: [3, 8], deep: [9, 16], abyssal: [17, 24], bedrock: 25 } as const;
export const VEIN_CELL = 64;
export const VEIN_JITTER = 8;
/** Max ellipse radius: (CELL/2 − JITTER) minus edge-noise bulge (~8%) → no overlaps. */
export const VEIN_RMAX = 22;
/** Depth slots per vein spot: [top, bottom, fill chance]. Soil only fills where a biome-biased soil vein fits. */
export const VEIN_SLOTS: [number, number, number][] = [[1, 2, 0.5], [3, 8, 0.6], [9, 16, 0.5], [17, 24, 0.15]];
const SEA = 0.05;
/** Ocean depth (layers) per unit below sea level; shelf → open ocean caps at OCEAN_MAX; trenches go to TRENCH_MAX. */
const OCEAN_K = 40, OCEAN_MAX = 8, TRENCH_MAX = 22;

/** `depth` = water layers (z 0 … depth−1 are water, seabed at z = depth); 0 on land. */
export interface Surface { biome: Biome; water: Water; depth: number; ice: boolean; volcanic: boolean; coast: boolean; river: number; temp: number; moist: number }
export interface VeinInst { id: string; def: VeinDef; x: number; y: number; z0: number; z1: number; a: number; b: number; rot: number; richness: number; seed: number }
export interface OreHit { vein: VeinInst; block: number; richness: number }
/** Surface sample density by vein top layer (DESIGN §3 discovery): shallow veins litter more loose ore. */
const SAMPLE_DENSITY = (z0: number) => (z0 <= 2 ? 0.06 : z0 <= 5 ? 0.035 : z0 <= 8 ? 0.015 : 0);
/** Hint circle radius (tiles) around a jittered point within HINT_JITTER of the vein centre. */
export const HINT_R = 12, HINT_JITTER = 5;
/** Prospector's hammer reach (tiles, max layer). */
export const PROSPECT_R = 24, PROSPECT_DEPTH = 8;
/** Geothermal hotspots (P5e): at most one per HOT_CELL² cell, radius HOT_R tiles, at layer HOT_DEPTH. */
export const HOT_CELL = 256, HOT_R = 10, HOT_DEPTH = 18;

const RARITY_W = { C: 10, U: 6, R: 3, VR: 1.5 };
const mod = (a: number, n: number) => ((a % n) + n) % n;

export class WorldGen {
  readonly w: number;
  readonly h: number;
  private cells = new Map<number, VeinInst[]>();
  constructor(readonly seed: number, readonly planet: PlanetDef) { this.w = planet.w; this.h = planet.h; }

  wrapX = (x: number) => mod(Math.floor(x), this.w);
  /** Shortest signed x distance across the wrap seam. */
  dx(a: number, b: number) { const d = mod(a - b, this.w); return d > this.w / 2 ? d - this.w : d; }
  inBounds = (y: number) => y >= 0 && y < this.h;

  /** Surface fields are sampled on the sphere (clean globe); underground detail stays in flat tile space. */
  surface(xIn: number, y: number): Surface {
    const x = this.wrapX(xIn), s = this.seed, p = spherePoint(x, y, this.w, this.h);
    const lat = ((y + 0.5) / this.h) * 2 - 1;
    const temp = 1 - Math.abs(lat) + sfbm(s + 2, p, 16, 3) * 0.15;
    const moist = sfbm(s + 3, p, 12, 4) * 0.8 + 0.5;
    const out: Surface = { biome: 'plains', water: Water.None, depth: 0, ice: false, volcanic: false, coast: false, river: 1, temp, moist };
    if (Math.abs(lat) > 0.968 + sfbm(s + 7, p, 64, 3) * 0.015) { out.ice = true; out.biome = 'tundra'; return out; }
    const c = sfbm(s + 1, p, 6, 6);
    out.coast = Math.abs(c - SEA) < 0.035;
    if (c < SEA) {
      out.water = Water.Ocean; out.biome = 'ocean';
      const t = SEA - c;
      out.depth = Math.min(OCEAN_MAX, 1 + Math.floor(t * OCEAN_K));
      // Trenches: narrow ridges of a second noise field, only out past the shelf. Deep/abyssal ores hide beneath.
      if (t > 0.08) {
        const r = Math.abs(sfbm(s + 8, p, 10, 4));
        if (r < 0.012) out.depth = Math.min(TRENCH_MAX, OCEAN_MAX + 1 + Math.floor((1 - r / 0.012) * 6 + (t - 0.08) * 40));
      }
      return out;
    }
    out.biome = temp < 0.17 ? 'tundra'
      : temp > 0.62 ? (moist < 0.4 ? 'desert' : moist > 0.62 ? 'jungle' : 'plains')
      : moist > 0.68 ? 'swamp' : moist > 0.48 ? 'forest' : moist < 0.25 && temp > 0.5 ? 'desert' : 'plains';
    out.volcanic = sfbm(s + 4, p, 40, 3) > 0.62;
    out.river = Math.abs(sfbm(s + 5, p, 24, 4));
    // Tiles shrink east–west on the sphere toward the poles: thin the river band by cos(lat) so widths stay ~constant in
    // tiles, and stop rivers in the far north/south where they would smear.
    const coslat = Math.cos(lat * Math.PI / 2);
    const rw = Math.abs(lat) > 0.85 ? 0 : (out.biome === 'desert' ? 0.009 : 0.018) * coslat;
    if (out.river < rw) { out.water = Water.River; out.depth = out.river < rw * 0.45 ? 2 : 1; return out; }
    const lake = out.biome !== 'desert' ? sfbm(s + 6, p, 48, 3) : 0;
    if (lake > 0.55) { out.water = Water.Lake; out.depth = Math.min(3, 1 + Math.floor((lake - 0.55) / 0.05)); }
    return out;
  }

  /** Terrain block ignoring ores. */
  terrain(x: number, y: number, z: number, sf = this.surface(x, y)): number {
    if (z >= LAYERS.bedrock) return B.bedrock;
    if (sf.depth) {
      if (z < sf.depth) return B.water;
      // Seabed: silt, then sand (ocean) or gravel/clay (fresh water), then the normal layer.
      if (z === sf.depth) return B.silt;
      if (z === sf.depth + 1 && z < 9) return sf.water === Water.Ocean ? B.sand : fbm(this.seed + 21, x, y, this.w, 200, 2) > 0.2 ? B.gravel : B.clay;
    }
    if (z >= 17) return B.abyssal;
    if (z >= 9) return B.deepstone;
    const s = this.seed, w = this.w;
    if (z >= 3) return fbm(s + 20 + z, x, y, w, 256, 2) > 0.55 ? B.gravel : B.stone;
    if (z >= 1) {
      if (sf.ice) return z === 1 ? B.ice : B.permafrost;
      if (sf.water !== Water.None) return B.sand;
      if (fbm(s + 22 + z, x, y, w, 220, 2) > 0.5) return B.clay;
      switch (sf.biome) {
        case 'desert': return B.sand;
        case 'swamp': return z === 1 ? B.mud : B.clay;
        case 'tundra': return B.permafrost;
        default: return B.dirt;
      }
    }
    if (sf.ice) return B.ice;
    if (sf.volcanic) return B.basalt;
    switch (sf.biome) {
      case 'forest': return B.forest_floor;
      case 'jungle': return B.jungle_floor;
      case 'swamp': return B.mud;
      case 'desert': return B.sand;
      case 'tundra': return sf.temp < 0.1 ? B.snow : B.tundra;
      default: return B.grass;
    }
  }

  /** Generated block (terrain + ores). */
  block(x: number, y: number, z: number, sf?: Surface): number {
    if (z < LAYERS.bedrock) { const o = this.ore(x, y, z, sf); if (o) return o.block; }
    return this.terrain(x, y, z, sf);
  }

  tree(xIn: number, y: number, sf = this.surface(xIn, y)): Tree {
    if (sf.ice || sf.water !== Water.None || sf.volcanic) return Tree.None;
    const r = hash01(this.seed + 9, this.wrapX(xIn), y);
    switch (sf.biome) {
      case 'forest': return r < 0.3 ? (r < 0.08 ? Tree.Conifer : Tree.Broadleaf) : Tree.None;
      case 'jungle': return r < 0.45 ? Tree.Jungle : Tree.None;
      case 'swamp': return r < 0.12 ? (r < 0.05 ? Tree.Jungle : Tree.Broadleaf) : Tree.None; // jungle = rubber tree
      case 'tundra': return r < 0.04 ? Tree.Conifer : Tree.None;
      case 'plains': return r < 0.025 ? Tree.Broadleaf : Tree.None;
      case 'desert': return r < 0.006 ? Tree.Cactus : Tree.None;
      default: return Tree.None;
    }
  }

  // ---- veins ----
  get cellsX() { return Math.ceil(this.w / VEIN_CELL); }
  get cellsY() { return Math.ceil(this.h / VEIN_CELL); }

  /**
   * GT-style grid: every vein cell has one vein spot (center ± jitter) with depth slots (soil/stone/deep/abyssal);
   * each slot holds one weighted-random vein or is empty.
   * Radii stay < half the spacing so veins never overlap. ~2.9k veins on Earth.
   */
  veinsInCell(cxIn: number, cy: number): VeinInst[] {
    const cx = mod(cxIn, this.cellsX);
    if (cy < 0 || cy >= this.cellsY) return [];
    const key = cy * 4096 + cx;
    let list = this.cells.get(key);
    if (list) return list;
    list = [];
    const s = this.seed + 100;
    const half = VEIN_CELL / 2;
    const x = Math.min(this.w - 1, cx * VEIN_CELL + half + Math.round((hash01(s, cx, cy, 1) - 0.5) * 2 * VEIN_JITTER));
    const y = Math.min(this.h - 1, cy * VEIN_CELL + half + Math.round((hash01(s, cx, cy, 2) - 0.5) * 2 * VEIN_JITTER));
    const sf = this.surface(x, y);
    // Under open ocean / trenches, deep and abyssal slots fill more often and richer (reached by offshore rigs, DESIGN §3).
    const sea = sf.water === Water.Ocean ? (sf.depth > OCEAN_MAX ? 2 : 1) : 0;
    if (!sf.ice) VEIN_SLOTS.forEach(([b0, b1, fill], k) => {
      const h = (n: number) => hash01(s, cx, cy, 16 + k * 16 + n);
      const boost = k >= 2 ? sea : 0;
      if (h(0) > Math.min(0.9, fill + boost * 0.25)) return;
      const def = pickVein(sf, h(1), b0, b1);
      if (!def) return;
      const d0 = Math.max(def.depth[0], b0), d1 = Math.min(def.depth[1], b1);
      const zc = d0 + Math.floor(h(2) * (d1 - d0 + 1));
      const z0 = Math.max(d0, zc - 1), z1 = Math.min(d1, zc + 1);
      const [s0, s1] = RARITY_SIZE[def.rarity];
      const size = (s0 + (s1 - s0) * h(3)) * (def.sizeMul ?? 1) * (1 + boost * 0.75);
      const rich = (4 + Math.floor(h(4) * 5)) * (1 + boost * 0.75); // ore per block
      const r = Math.sqrt(size / rich / (z1 - z0 + 1) / Math.PI);
      const ecc = 0.6 + h(5) * 0.8;
      const a = Math.min(VEIN_RMAX, r * Math.sqrt(ecc)), bb = Math.min(VEIN_RMAX, r / Math.sqrt(ecc));
      const richness = Math.max(1, Math.round(size / (Math.PI * a * bb * (z1 - z0 + 1))));
      list!.push({ id: `${cx}.${cy}.${k}`, def, x, y, z0, z1, a, b: bb, rot: h(6) * Math.PI, richness, seed: hash(s, cx, cy, k) });
    });
    this.cells.set(key, list);
    return list;
  }

  /** Geothermal hotspot of a HOT_CELL cell, if it has one (P5e). */
  hotspot(cxIn: number, cy: number): { x: number; y: number } | null {
    const ncx = Math.ceil(this.w / HOT_CELL), cx = mod(cxIn, ncx);
    if (cy < 0 || cy >= Math.ceil(this.h / HOT_CELL)) return null;
    const s = this.seed + 300;
    if (hash01(s, cx, cy, 0) > 0.5) return null;
    const x = Math.min(this.w - 1, cx * HOT_CELL + 32 + Math.floor(hash01(s, cx, cy, 1) * (HOT_CELL - 64)));
    const y = Math.min(this.h - 1, cy * HOT_CELL + 32 + Math.floor(hash01(s, cx, cy, 2) * (HOT_CELL - 64)));
    return this.surface(x, y).ice ? null : { x, y };
  }

  /** Hotspots whose centre lies within r tiles of (x, y). */
  hotspotsNear(x: number, y: number, r: number): { x: number; y: number; d: number }[] {
    const out: { x: number; y: number; d: number }[] = [], n = Math.ceil(r / HOT_CELL) + 1;
    const cx = Math.floor(this.wrapX(x) / HOT_CELL), cy = Math.floor(y / HOT_CELL), seen = new Set<string>();
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const h = this.hotspot(cx + i, cy + j);
      if (!h || seen.has(`${h.x},${h.y}`)) continue;
      seen.add(`${h.x},${h.y}`);
      const d = Math.hypot(this.dx(h.x, x), h.y - y);
      if (d <= r) out.push({ ...h, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** Ground heat 0–1 (geothermal generator): 1 at a hotspot's centre → 0.25 at its rim, 0 outside. */
  heat(x: number, y: number): number {
    const h = this.hotspotsNear(x, y, HOT_R)[0];
    return h ? 1 - 0.75 * (h.d / HOT_R) : 0;
  }

  /** All veins with center in cells overlapping the tile rect (for overlays/tests). */
  veinsAround(x: number, y: number, r = 1): VeinInst[] {
    const cx = Math.floor(this.wrapX(x) / VEIN_CELL), cy = Math.floor(y / VEIN_CELL);
    const out: VeinInst[] = [];
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) out.push(...this.veinsInCell(cx + i, cy + j));
    return out;
  }

  /** Normalised ellipse distance² of (x, y) from a vein's centre (≤ 1 inside, before edge noise). */
  veinDist(v: VeinInst, x: number, y: number): number {
    const dx = this.dx(x, v.x), dy = y - v.y;
    if (Math.abs(dx) > VEIN_RMAX + 2 || Math.abs(dy) > VEIN_RMAX + 2) return 99;
    const c = Math.cos(v.rot), s = Math.sin(v.rot);
    const u = (dx * c + dy * s) / v.a, t = (-dx * s + dy * c) / v.b;
    return u * u + t * t;
  }

  /** Vein by id (`cx.cy.slot`). */
  veinById(id: string): VeinInst | undefined {
    const [cx, cy] = id.split('.').map(Number);
    return this.veinsInCell(cx, cy).find((v) => v.id === id);
  }

  /** Hint circle centre for a vein: deterministic jitter so a sample never pins the exact spot. */
  hintCentre(v: VeinInst): { x: number; y: number } {
    const a = hash01(v.seed + 7, 1) * Math.PI * 2, r = hash01(v.seed + 7, 2) * HINT_JITTER;
    return { x: v.x + Math.round(Math.cos(a) * r), y: v.y + Math.round(Math.sin(a) * r) };
  }

  /**
   * Loose ore sample lying on a surface tile (DESIGN §3): only above soil/stone veins, on dry treeless land.
   * Returns the vein and the sampled mineral id (never `mat:` filler).
   */
  sample(xIn: number, y: number, sf?: Surface): { vein: VeinInst; mineral: string } | null {
    const x = this.wrapX(xIn);
    const r = hash01(this.seed + 50, x, y);
    if (r >= SAMPLE_DENSITY(1)) return null;
    for (const v of this.veinsAround(x, y)) {
      if (r >= SAMPLE_DENSITY(v.z0) || this.veinDist(v, x, y) > 1) continue;
      sf ??= this.surface(x, y);
      if (sf.water !== Water.None || sf.ice || this.tree(x, y, sf)) return null;
      const parts = v.def.parts.filter((p) => !p.ref.startsWith('mat:'));
      let w = hash01(this.seed + 51, x, y) * parts.reduce((a, p) => a + p.weight, 0);
      for (const p of parts) if ((w -= p.weight) < 0) return { vein: v, mineral: p.ref };
    }
    return null;
  }

  /** Wild plant on a surface tile (P5h, DESIGN §3): crop id, on dry treeless land without an ore sample, by biome. */
  plant(xIn: number, y: number, sf?: Surface): string | null {
    const x = this.wrapX(xIn);
    if (hash01(this.seed + 70, x, y) >= WILD_DENSITY) return null;
    sf ??= this.surface(x, y);
    if (sf.water !== Water.None || sf.ice || sf.volcanic || this.tree(x, y, sf) || this.sample(x, y, sf)) return null;
    const kinds = CROPS.filter((c) => c.wild?.includes(sf!.biome) || (sf!.coast && c.wild?.includes('coast')));
    return kinds.length ? kinds[Math.floor(hash01(this.seed + 71, x, y) * kinds.length)].id : null;
  }

  /** Ore at a block; never inside water (z < surface depth). Outcrop veins also show their core at layer 0. */
  ore(xIn: number, y: number, z: number, sf?: Surface): OreHit | null {
    const x = this.wrapX(xIn);
    for (const v of this.veinsAround(x, y)) {
      const top = z === 0 && v.def.outcrop;
      if (!top && (z < v.z0 || z > v.z1)) continue;
      const d = this.veinDist(v, x, y);
      if (d > 1.2) continue;
      const edge = (hash01(v.seed, x, y, z) - 0.5) * 0.35;
      if (d + edge > (top ? 0.2 : 1)) continue;
      sf ??= this.surface(x, y);
      if (z < sf.depth) return null;
      if (top && (sf.water !== Water.None || sf.ice || this.tree(x, y, sf))) continue;
      // Weighted mineral pick per block.
      let r = hash01(v.seed + 1, x, y, z) * 100;
      for (const p of v.def.parts) {
        if ((r -= p.weight) < 0) {
          const block = p.ref.startsWith('mat:') ? B[p.ref.slice(4)] ?? B.stone : oreBlock(p.ref);
          return { vein: v, block, richness: v.richness };
        }
      }
    }
    return null;
  }

  /** Temperate land start with varied biomes and fresh water nearby. */
  findSpawn(): { x: number; y: number } {
    let best = { x: 0, y: this.h >> 1, score: -99 };
    const x0 = Math.floor(hash01(this.seed, 7) * this.w);
    for (let i = 0; i < 300; i++) {
      const x = this.wrapX(x0 + i * 211);
      const y = Math.floor(this.h / 2 + (i % 2 ? 1 : -1) * this.h * (0.1 + 0.15 * hash01(this.seed, 8, i)));
      const c = this.surface(x, y);
      if (c.water !== Water.None || (c.biome !== 'plains' && c.biome !== 'forest')) continue;
      const seen = new Set<string>();
      let river = 0, lake = 0, ocean = 0, n = 0;
      for (let j = -6; j <= 6; j++) for (let k = -6; k <= 6; k++) {
        const sf = this.surface(x + k * 12, y + j * 12);
        n++;
        if (sf.water === Water.Ocean) ocean++;
        else seen.add(sf.biome);
        if (sf.water === Water.River) river++;
        if (sf.water === Water.Lake) lake++;
      }
      const score = seen.size + (river ? 2 : 0) + (lake ? 1 : 0) + (seen.has('swamp') ? 1 : 0) - (ocean / n > 0.4 ? 3 : 0);
      if (score > best.score) best = { x, y, score };
      if (score >= 6) break;
    }
    return { x: best.x, y: best.y };
  }
}

function pickVein(sf: Surface, r: number, b0: number, b1: number): VeinDef | undefined {
  const ws = VEINS.map((v) => {
    if (v.depth[1] < b0 || v.depth[0] > b1) return 0;
    let m = 0;
    for (const b of v.bias) {
      if (b === 'any') m = Math.max(m, 1);
      else if (b === sf.biome) m = 2;
      else if (b === 'river' && sf.river < 0.06 && sf.water !== Water.Ocean) m = 2;
      else if (b === 'ocean_edge' && sf.coast) m = 2;
      else if (b === 'volcanic' && sf.volcanic) m = 2;
    }
    return m * RARITY_W[v.rarity];
  });
  let t = r * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < VEINS.length; i++) if ((t -= ws[i]) < 0) return VEINS[i];
  return undefined;
}

let cached: WorldGen | undefined;
/** Shared generator per (seed, planet). */
export function worldGen(seed: number, p: PlanetDef): WorldGen {
  if (!cached || cached.seed !== seed || cached.planet.id !== p.id) cached = new WorldGen(seed, p);
  return cached;
}
