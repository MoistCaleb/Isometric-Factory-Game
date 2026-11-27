// Placeable structures (DESIGN §3 Building, CONTENT §11c). Each becomes item `struct:<id>` + a hand recipe.
// `model`: voxel boxes on a 16³ tile, [x0,y0,z0,x1,y1,z1,color] with y = up, z = toward the tile's south (rot 0 front).
import type { ToolType } from './forms';

export type Box = [number, number, number, number, number, number, number];
export interface StructDef {
  id: string; name: string; color: number;
  /** Machine id its recipes run in (CONTENT §11c); absent = storage/utility. */
  machine?: string;
  cost: [id: string, n: number][];
  tools?: ToolType[];
  model: Box[];
  /** Multiblock controller (DESIGN §5): casing structure required on the pattern tiles (same storey). */
  multi?: { casing: string; pattern: 'ring' | 'plus' };
}

/** Pattern offsets [dx, dy] around the controller. */
export const PATTERNS = {
  ring: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  plus: [[0, -1], [-1, 0], [1, 0], [0, 1]],
} as const;

const FIRE = 0xc9b48a, DIRT = 0x6a4a2e, LIME = 0xd8d4c8, GLOW = 0xff8a30;
const WOOD = 0x9a7040, DARK = 0x5a4026, CLAY = 0xa86a48, BRICK = 0x9a4a32, STONE = 0x8a8a88, BRONZE = 0xc08a40, SOOT = 0x2a2420;

export const STRUCTURES: StructDef[] = [
  { id: 'chest', name: 'Wooden Chest', color: WOOD, cost: [['plank:wood', 8]],
    model: [[2, 0, 3, 14, 9, 13, WOOD], [2, 9, 3, 14, 11, 13, DARK], [7, 6, 13, 9, 9, 14, 0x404040]] },
  { id: 'barrel', name: 'Wooden Barrel', color: WOOD, cost: [['plank:wood', 7]],
    model: [[4, 0, 4, 12, 13, 12, WOOD], [3, 2, 3, 13, 4, 13, DARK], [3, 9, 3, 13, 11, 13, DARK]] },
  { id: 'pit_kiln', name: 'Pit Kiln', color: CLAY, machine: 'pit_kiln', cost: [['ball:clay', 6], ['stick:wood', 4], ['straw', 4]],
    model: [[1, 0, 1, 15, 3, 15, CLAY], [3, 3, 3, 13, 6, 13, 0xd8c060], [5, 6, 5, 11, 8, 11, DARK]] },
  { id: 'clay_furnace', name: 'Clay Furnace', color: BRICK, machine: 'clay_furnace', cost: [['brick:brick', 8], ['ball:clay', 4]],
    model: [[2, 0, 2, 14, 12, 14, BRICK], [5, 2, 13, 11, 7, 14, SOOT], [6, 12, 6, 10, 16, 10, CLAY]] },
  { id: 'quern', name: 'Quern', color: STONE, machine: 'quern', cost: [['cobble:stone', 6], ['plank:wood', 2]], tools: ['hammer'],
    model: [[2, 0, 2, 14, 5, 14, STONE], [3, 5, 3, 13, 8, 13, 0x9a9a98], [7, 8, 7, 9, 13, 9, WOOD]] },
  { id: 'sluice', name: 'Sluice Box', color: WOOD, machine: 'sluice', cost: [['plank:wood', 6], ['plate:bronze', 2]],
    model: [[0, 0, 4, 16, 2, 12, WOOD], [0, 2, 4, 16, 6, 5, WOOD], [0, 2, 11, 16, 6, 12, WOOD], [2, 2, 5, 14, 3, 11, BRONZE]] },
  { id: 'crucible', name: 'Crucible Hearth', color: CLAY, machine: 'crucible', cost: [['crucible:clay', 1], ['brick:brick', 4]],
    model: [[2, 0, 2, 14, 4, 14, BRICK], [4, 4, 4, 12, 11, 12, 0xb0a8b8], [5, 10, 5, 11, 11, 11, SOOT]] },
  { id: 'lime_kiln', name: 'Lime Kiln', color: BRICK, machine: 'lime_kiln', cost: [['brick:brick', 10], ['ball:clay', 2]],
    model: [[2, 0, 2, 14, 10, 14, BRICK], [4, 10, 4, 12, 15, 12, BRICK], [5, 2, 13, 11, 6, 14, SOOT], [6, 15, 6, 10, 16, 10, LIME]] },
  // Multiblocks: controller + casings on the pattern tiles.
  { id: 'charcoal_pit', name: 'Charcoal Pile', color: DIRT, machine: 'charcoal_pile', cost: [['dirt', 4], ['stick:wood', 4]],
    multi: { casing: 'soil_cover', pattern: 'ring' },
    model: [[0, 0, 0, 16, 10, 16, DIRT], [6, 10, 6, 10, 12, 10, SOOT]] },
  { id: 'soil_cover', name: 'Soil Cover', color: DIRT, cost: [['dirt', 4]],
    model: [[0, 0, 0, 16, 7, 16, DIRT], [2, 7, 2, 14, 9, 14, 0x7a5a3a]] },
  { id: 'bloomery', name: 'Bloomery', color: BRICK, machine: 'bloomery', cost: [['brick:brick', 6], ['ball:clay', 4]],
    multi: { casing: 'clay_wall', pattern: 'plus' },
    model: [[2, 0, 2, 14, 14, 14, CLAY], [4, 14, 4, 12, 16, 12, BRICK], [6, 2, 13, 10, 6, 14, GLOW]] },
  { id: 'clay_wall', name: 'Bloomery Wall', color: CLAY, cost: [['brick:brick', 4], ['ball:clay', 2]],
    model: [[1, 0, 1, 15, 10, 15, CLAY], [1, 10, 1, 15, 11, 15, BRICK]] },
  { id: 'coke_oven', name: 'Coke Oven', color: FIRE, machine: 'coke_oven', cost: [['fire_brick:fireclay', 8]],
    multi: { casing: 'fire_brick_wall', pattern: 'ring' },
    model: [[0, 0, 0, 16, 16, 16, FIRE], [5, 3, 15, 11, 10, 16, SOOT]] },
  { id: 'primitive_blast_furnace', name: 'Primitive Blast Furnace', color: FIRE, machine: 'primitive_blast_furnace',
    cost: [['fire_brick:fireclay', 8], ['plate:wrought_iron', 4]], multi: { casing: 'fire_brick_wall', pattern: 'ring' },
    model: [[0, 0, 0, 16, 16, 16, FIRE], [4, 16, 4, 12, 20, 12, 0x9a9690], [5, 2, 15, 11, 8, 16, GLOW]] },
  { id: 'fire_brick_wall', name: 'Fire Brick Wall', color: FIRE, cost: [['fire_brick:fireclay', 4]],
    model: [[0, 0, 0, 16, 16, 16, FIRE], [0, 8, 0, 16, 9, 16, 0xb8a47a]] },
  { id: 'stone_anvil', name: 'Stone Anvil', color: STONE, machine: 'anvil', cost: [['cobble:stone', 8]], tools: ['hammer'],
    model: [[3, 0, 4, 13, 4, 12, STONE], [5, 4, 6, 11, 8, 10, STONE], [2, 8, 5, 14, 11, 11, 0x9a9a98]] },
];
