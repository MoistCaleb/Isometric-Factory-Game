// World block table. Terrain blocks first, then one ore block per mineral (ORE_BASE + mineral index).
import { MINERALS } from '../data/minerals';

export interface BlockDef { id: number; key: string; name: string; color: number; mineral?: string; liquid?: boolean; unbuildable?: boolean }

const T: [key: string, name: string, color: number, x?: Partial<BlockDef>][] = [
  ['air', 'Air', 0x000000],
  ['water', 'Water', 0x2f6fa8, { liquid: true }],
  ['ice', 'Polar Ice', 0xe4eef4, { unbuildable: true }],
  ['grass', 'Grass', 0x6c9a42],
  ['forest_floor', 'Forest Floor', 0x4d7a35],
  ['jungle_floor', 'Jungle Floor', 0x3c7a2e],
  ['mud', 'Mud', 0x5a5a3a],
  ['sand', 'Sand', 0xd8c58a],
  ['snow', 'Snow', 0xdfe6ea],
  ['tundra', 'Tundra', 0x9aa286],
  ['basalt', 'Basalt', 0x3c3a3a],
  ['dirt', 'Dirt', 0x7a5a3a],
  ['clay', 'Clay', 0x9aa0aa],
  ['permafrost', 'Permafrost', 0x8a8a80],
  ['silt', 'Silt', 0x8a8060],
  ['gravel', 'Gravel', 0x8a8580],
  ['stone', 'Stone', 0x7c7c80],
  ['deepstone', 'Deepstone', 0x55585e],
  ['abyssal', 'Abyssal Rock', 0x3a3840],
  ['bedrock', 'Bedrock', 0x1e1e22, { unbuildable: true }],
];

export const BLOCKS: BlockDef[] = T.map(([key, name, color, x], id) => ({ id, key, name, color, ...x }));
export const B = Object.fromEntries(BLOCKS.map((b) => [b.key, b.id])) as Record<string, number>;
export const ORE_BASE = BLOCKS.length;
for (const [i, m] of MINERALS.entries()) BLOCKS.push({ id: ORE_BASE + i, key: `ore:${m.id}`, name: `${m.name} Ore`, color: m.color, mineral: m.id });
const ORE_BY_MINERAL = new Map(MINERALS.map((m, i) => [m.id, ORE_BASE + i]));
export const oreBlock = (mineral: string) => ORE_BY_MINERAL.get(mineral)!;
export const isOre = (b: number) => b >= ORE_BASE;
