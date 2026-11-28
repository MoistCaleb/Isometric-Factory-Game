// Farming (P5h, DESIGN §3 Trees & farming, CONTENT §11c Farming): crop species tree + saplings.
import type { TierId } from './tiers';

export interface CropDef {
  id: string; name: string; tier: TierId;
  /** Seconds from planted to mature at base rate. */
  grow: number;
  color: number;
  /** Produce item `crop:<id>` name. */
  produce: string;
  /** Wild: biomes it grows in (`coast` = next to water). Parents: the cross that makes it. */
  wild?: string[]; parents?: [string, string];
  /** Resource crops: metal whose block (`block_<metal>` structure) must sit under the planter to ripen. */
  needs?: string;
  /** What the produce turns into in the quern / macerators (small dust id), if anything. */
  dust?: string;
}

export const CROPS: CropDef[] = [
  { id: 'wheat', name: 'Wheat', tier: 'P', grow: 120, color: 0xd8c060, produce: 'Wheat', wild: ['plains'] },
  { id: 'flax', name: 'Flax', tier: 'P', grow: 120, color: 0x7a9ad0, produce: 'Flax Stalks', wild: ['plains', 'forest'] },
  { id: 'reed', name: 'Reed', tier: 'P', grow: 120, color: 0x8aa860, produce: 'Reeds', wild: ['swamp', 'coast'] },
  { id: 'berry', name: 'Berry Bush', tier: 'P', grow: 120, color: 0xb03050, produce: 'Berries', wild: ['forest', 'tundra'] },
  { id: 'stonecrop', name: 'Stonecrop', tier: 'P', grow: 240, color: 0x9a9a90, produce: 'Stonecrop Leaves', parents: ['wheat', 'reed'], dust: 'small_dust:stone' },
  { id: 'clayweed', name: 'Clayweed', tier: 'P', grow: 240, color: 0xa8b0c0, produce: 'Clayweed', parents: ['reed', 'berry'] },
  { id: 'coalcap', name: 'Coalcap', tier: 'P', grow: 240, color: 0x3a3a3a, produce: 'Coalcap Caps', parents: ['flax', 'berry'], dust: 'small_dust:coal' },
  { id: 'ironleaf', name: 'Ironleaf', tier: 'S', grow: 360, color: 0xb8b8bc, produce: 'Ironleaf Leaves', parents: ['stonecrop', 'coalcap'], needs: 'iron', dust: 'small_dust:iron' },
  { id: 'copperbloom', name: 'Copperbloom', tier: 'S', grow: 360, color: 0xd87a3c, produce: 'Copperbloom Petals', parents: ['stonecrop', 'clayweed'], needs: 'copper', dust: 'small_dust:copper' },
  { id: 'tinroot', name: 'Tinroot', tier: 'S', grow: 360, color: 0xc8ccd0, produce: 'Tinroot Tubers', parents: ['clayweed', 'coalcap'], needs: 'tin', dust: 'small_dust:tin' },
  { id: 'leadwort', name: 'Leadwort', tier: 'LV', grow: 480, color: 0x5c5a78, produce: 'Leadwort Leaves', parents: ['ironleaf', 'tinroot'], needs: 'lead', dust: 'small_dust:lead' },
  { id: 'zincthistle', name: 'Zincthistle', tier: 'LV', grow: 480, color: 0xbcc4c8, produce: 'Zincthistle Heads', parents: ['copperbloom', 'tinroot'], needs: 'zinc', dust: 'small_dust:zinc' },
  { id: 'nickelvine', name: 'Nickelvine', tier: 'LV', grow: 480, color: 0xc8c8a8, produce: 'Nickelvine Pods', parents: ['ironleaf', 'copperbloom'], needs: 'nickel', dust: 'small_dust:nickel' },
  { id: 'silverbell', name: 'Silverbell', tier: 'MV', grow: 600, color: 0xd8dce4, produce: 'Silverbell Flowers', parents: ['leadwort', 'copperbloom'], needs: 'silver', dust: 'small_dust:silver' },
  { id: 'goldenrod', name: 'Goldenrod', tier: 'MV', grow: 600, color: 0xf2c838, produce: 'Goldenrod Flowers', parents: ['silverbell', 'zincthistle'], needs: 'gold', dust: 'small_dust:gold' },
];
export const CROP = new Map(CROPS.map((c) => [c.id, c]));
/** Cross table: sorted parent pair `a|b` → child. */
export const CROSS = new Map(CROPS.filter((c) => c.parents).map((c) => [[...c.parents!].sort().join('|'), c.id]));
export const crossOf = (a: string, b: string) => CROSS.get([a, b].sort().join('|'));
/** Metals with a placeable storage block (resource crops stand on them). */
export const CROP_METALS = [...new Set(CROPS.map((c) => c.needs).filter((m): m is string => !!m))];

/** Saplings: kind → tree type (world/gen `Tree`: 1 broadleaf, 2 conifer, 3 jungle = rubber), grow seconds. */
export const SAPLINGS: { id: string; name: string; tree: number; grow: number; color: number }[] = [
  { id: 'broadleaf', name: 'Broadleaf Sapling', tree: 1, grow: 300, color: 0x3f7a2a },
  { id: 'conifer', name: 'Conifer Sapling', tree: 2, grow: 300, color: 0x2d5a35 },
  { id: 'rubber', name: 'Rubber Sapling', tree: 3, grow: 400, color: 0x2f8a30 },
];
export const SAPLING = new Map(SAPLINGS.map((s) => [s.id, s]));
export const saplingOfTree = (t: number) => SAPLINGS.find((s) => s.tree === t)?.id;

/** Growth stage 0–3 from growth 0–1 (3 = mature). */
export const stage = (g: number) => (g >= 1 ? 3 : g >= 0.5 ? 2 : g >= 0.2 ? 1 : 0);
/** Resource crops stop here without their block below. */
export const NO_BLOCK_CAP = 0.75;
/** Compost lasts this many seconds per item; growth × 2 while it lasts. */
export const COMPOST_S = 600;
/** Breeding: chance per second an empty stick with ≥ 2 mature neighbours sprouts; chance a crossing pair gives its child. */
export const SPROUT = 1 / 60, CROSS_P = 0.5;
/** Natural water within this many tiles keeps crops watered. */
export const WATER_R = 4;

const STAGES = ['seedling', 'growing', 'ripening', 'mature'];
/** Short label for a plant block (hover): planter contents / planted tree with its stage. */
export function plantLabel(e: { s: string; pl?: string; g?: number }): string | null {
  if (e.s === 'tree') { const sp = SAPLING.get(e.pl ?? ''); return `${sp ? sp.name.replace(' Sapling', '') : ''} ${(e.g ?? 0) >= 1 ? 'tree · grown (fell it in Mining)' : `sapling · ${STAGES[stage(e.g ?? 0)]}`}`.trim(); }
  if (e.s !== 'planter') return null;
  if (!e.pl) return 'Planter · empty';
  if (e.pl === 'sticks') return 'Planter · crop sticks';
  const c = CROP.get(e.pl);
  return `Planter · ${c?.name ?? e.pl} · ${STAGES[stage(e.g ?? 0)]}${(e.g ?? 0) >= 1 ? ' — tap to harvest' : ''}`;
}

/** Items placed in Machine Build that plant instead of build (sim/farm `plant`). */
export const isPlantItem = (id: string) => id.startsWith('sapling:') || id.startsWith('seed:') || id === 'crop_sticks' || id === 'compost';
