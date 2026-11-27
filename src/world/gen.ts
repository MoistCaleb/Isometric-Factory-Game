// Deterministic planet generation (DESIGN §3): pure functions of (seed, planet, x, y, z).
// World = seed + diffs; diffs are applied by callers (see sim/state `diffs`).
import type { PlanetDef } from '../data/planets';
import { RARITY_SIZE, VEINS, type Biome, type VeinDef } from '../data/veins';
import { B, oreBlock } from './blocks';
import { fbm, hash, hash01 } from './noise';

export const Water = { None: 0, River: 1, Lake: 2, Ocean: 3 } as const;
export type Water = (typeof Water)[keyof typeof Water];
export const Tree = { None: 0, Broadleaf: 1, Conifer: 2, Jungle: 3, Cactus: 4 } as const;
export type Tree = (typeof Tree)[keyof typeof Tree];
export const LAYERS = { surface: 0, soil: [1, 2], stone: [3, 8], deep: [9, 16], abyssal: [17, 24], bedrock: 25 } as const;
export const VEIN_CELL = 64;
const SEA = 0.05;

export interface Surface { biome: Biome; water: Water; ice: boolean; volcanic: boolean; coast: boolean; river: number; temp: number; moist: number }
export interface VeinInst { id: string; def: VeinDef; x: number; y: number; z0: number; z1: number; a: number; b: number; rot: number; richness: number; seed: number }
export interface OreHit { vein: VeinInst; block: number; richness: number }

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

  surface(xIn: number, y: number): Surface {
    const x = this.wrapX(xIn), s = this.seed, w = this.w;
    const lat = ((y + 0.5) / this.h) * 2 - 1;
    const temp = 1 - Math.abs(lat) + fbm(s + 2, x, y, w, 16, 3) * 0.15;
    const moist = fbm(s + 3, x, y, w, 12, 4) * 0.8 + 0.5;
    const out: Surface = { biome: 'plains', water: Water.None, ice: false, volcanic: false, coast: false, river: 1, temp, moist };
    if (Math.abs(lat) > 0.968 + fbm(s + 7, x, y, w, 64, 3) * 0.015) { out.ice = true; out.biome = 'tundra'; return out; }
    const c = fbm(s + 1, x, y, w, 6, 6);
    out.coast = Math.abs(c - SEA) < 0.035;
    if (c < SEA) { out.water = Water.Ocean; out.biome = 'ocean'; return out; }
    out.biome = temp < 0.17 ? 'tundra'
      : temp > 0.62 ? (moist < 0.4 ? 'desert' : moist > 0.62 ? 'jungle' : 'plains')
      : moist > 0.68 ? 'swamp' : moist > 0.48 ? 'forest' : moist < 0.25 && temp > 0.5 ? 'desert' : 'plains';
    out.volcanic = fbm(s + 4, x, y, w, 40, 3) > 0.62;
    out.river = Math.abs(fbm(s + 5, x, y, w, 24, 4));
    if (out.river < (out.biome === 'desert' ? 0.009 : 0.018)) out.water = Water.River;
    else if (out.biome !== 'desert' && fbm(s + 6, x, y, w, 48, 3) > 0.55) out.water = Water.Lake;
    return out;
  }

  /** Terrain block ignoring ores. */
  terrain(x: number, y: number, z: number, sf = this.surface(x, y)): number {
    if (z >= LAYERS.bedrock) return B.bedrock;
    if (z >= 17) return B.abyssal;
    if (z >= 9) return B.deepstone;
    const s = this.seed, w = this.w;
    if (z >= 3) return fbm(s + 20 + z, x, y, w, 256, 2) > 0.55 ? B.gravel : B.stone;
    if (z >= 1) {
      if (sf.ice) return z === 1 ? B.ice : B.permafrost;
      if (sf.water === Water.Ocean) return z === 1 ? B.silt : B.sand;
      if (sf.water !== Water.None) return z === 1 ? B.silt : fbm(s + 21, x, y, w, 200, 2) > 0.2 ? B.gravel : B.clay;
      if (fbm(s + 22 + z, x, y, w, 220, 2) > 0.5) return B.clay;
      switch (sf.biome) {
        case 'desert': return B.sand;
        case 'swamp': return z === 1 ? B.mud : B.clay;
        case 'tundra': return B.permafrost;
        default: return B.dirt;
      }
    }
    if (sf.ice) return B.ice;
    if (sf.water !== Water.None) return B.water;
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
    if (z >= 1 && z < LAYERS.bedrock) { const o = this.ore(x, y, z); if (o) return o.block; }
    return this.terrain(x, y, z, sf);
  }

  tree(xIn: number, y: number, sf = this.surface(xIn, y)): Tree {
    if (sf.ice || sf.water !== Water.None || sf.volcanic) return Tree.None;
    const r = hash01(this.seed + 9, this.wrapX(xIn), y);
    switch (sf.biome) {
      case 'forest': return r < 0.3 ? (r < 0.08 ? Tree.Conifer : Tree.Broadleaf) : Tree.None;
      case 'jungle': return r < 0.45 ? Tree.Jungle : Tree.None;
      case 'swamp': return r < 0.12 ? Tree.Broadleaf : Tree.None;
      case 'tundra': return r < 0.04 ? Tree.Conifer : Tree.None;
      case 'plains': return r < 0.025 ? Tree.Broadleaf : Tree.None;
      case 'desert': return r < 0.006 ? Tree.Cactus : Tree.None;
      default: return Tree.None;
    }
  }

  // ---- veins ----
  get cellsX() { return Math.ceil(this.w / VEIN_CELL); }
  get cellsY() { return Math.ceil(this.h / VEIN_CELL); }

  /** Veins whose center lies in vein cell (cx, cy). ~1.5 per cell (CONTENT: 2–4k on Earth). */
  veinsInCell(cxIn: number, cy: number): VeinInst[] {
    const cx = mod(cxIn, this.cellsX);
    if (cy < 0 || cy >= this.cellsY) return [];
    const key = cy * 4096 + cx;
    let list = this.cells.get(key);
    if (list) return list;
    list = [];
    const s = this.seed + 100;
    for (let k = 0; k < 2; k++) {
      if (hash01(s, cx, cy, k * 16) > 0.75) continue;
      const x = Math.min(this.w - 1, cx * VEIN_CELL + Math.floor(hash01(s, cx, cy, k * 16 + 1) * VEIN_CELL));
      const y = Math.min(this.h - 1, cy * VEIN_CELL + Math.floor(hash01(s, cx, cy, k * 16 + 2) * VEIN_CELL));
      const sf = this.surface(x, y);
      if (sf.ice) continue;
      const def = pickVein(sf, hash01(s, cx, cy, k * 16 + 3));
      if (!def) continue;
      const [d0, d1] = def.depth;
      const zc = d0 + Math.floor(hash01(s, cx, cy, k * 16 + 4) * (d1 - d0 + 1));
      const z0 = Math.max(d0, zc - 1), z1 = Math.min(d1, zc + 1);
      const [s0, s1] = RARITY_SIZE[def.rarity];
      const size = (s0 + (s1 - s0) * hash01(s, cx, cy, k * 16 + 5)) * (def.sizeMul ?? 1);
      const rich = 4 + Math.floor(hash01(s, cx, cy, k * 16 + 6) * 5); // ore per block
      const area = size / rich / (z1 - z0 + 1);
      const ecc = 0.6 + hash01(s, cx, cy, k * 16 + 7) * 0.8;
      const r = Math.sqrt(area / Math.PI);
      const a = Math.min(30, r * Math.sqrt(ecc)), b = Math.min(30, r / Math.sqrt(ecc));
      const richness = Math.max(1, Math.round(size / (Math.PI * a * b * (z1 - z0 + 1))));
      list.push({ id: `${cx}.${cy}.${k}`, def, x, y, z0, z1, a, b, rot: hash01(s, cx, cy, k * 16 + 8) * Math.PI, richness, seed: hash(s, cx, cy, k) });
    }
    this.cells.set(key, list);
    return list;
  }

  /** All veins with center in cells overlapping the tile rect (for overlays/tests). */
  veinsAround(x: number, y: number, r = 1): VeinInst[] {
    const cx = Math.floor(this.wrapX(x) / VEIN_CELL), cy = Math.floor(y / VEIN_CELL);
    const out: VeinInst[] = [];
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) out.push(...this.veinsInCell(cx + i, cy + j));
    return out;
  }

  ore(xIn: number, y: number, z: number): OreHit | null {
    const x = this.wrapX(xIn);
    for (const v of this.veinsAround(x, y)) {
      if (z < v.z0 || z > v.z1) continue;
      const dx = this.dx(x, v.x), dy = y - v.y;
      if (Math.abs(dx) > 31 || Math.abs(dy) > 31) continue;
      const c = Math.cos(v.rot), s = Math.sin(v.rot);
      const u = (dx * c + dy * s) / v.a, t = (-dx * s + dy * c) / v.b;
      const edge = (hash01(v.seed, x, y, z) - 0.5) * 0.35;
      if (u * u + t * t + edge > 1) continue;
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

function pickVein(sf: Surface, r: number): VeinDef | undefined {
  const ws = VEINS.map((v) => {
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
