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
  multi?: { casing: string; pattern: PatternId };
  /** Pipe (DESIGN §7): joins same-kind pipes on all 6 sides. Fluid (P3a): L moved per link per tick, L held per block.
   * Item (P3b): items moved per source every ITEM_EVERY ticks, cap 0. */
  pipe?: { rate: number; cap: number; item?: boolean };
}

/** Multiblock cell offset from the controller: [dx, dy, db] (db = block levels up; 3 blocks = 1 storey). */
export type Cell = [number, number, number];
export interface Pattern { cells: Cell[]; /** Must stay empty (inner chamber). */ hollow: Cell[] }
const ring = (f: number): Cell[] => [[-1, -1, f], [0, -1, f], [1, -1, f], [-1, 0, f], [1, 0, f], [-1, 1, f], [0, 1, f], [1, 1, f]];
const full = (f: number): Cell[] => [...ring(f), [0, 0, f]];
const plus = (f: number): Cell[] => [[0, -1, f], [-1, 0, f], [1, 0, f], [0, 1, f]];
/** Controller sits at the bottom centre. A 3-high multiblock fills one storey; taller ones reach the next (DESIGN §5). */
export const PATTERNS = {
  /** Charcoal pile: 3×3 mound, 2 storeys. */
  mound: { cells: [...ring(0), ...full(1)], hollow: [] },
  /** Bloomery: plus-shaped base + 2-storey chimney above the hearth. */
  stack: { cells: [...plus(0), [0, 0, 1], [0, 0, 2]], hollow: [] },
  /** Coke oven: 3×3×3 with a hollow chamber, roofed. */
  oven: { cells: [...ring(0), ...ring(1), ...full(2)], hollow: [[0, 0, 1]] },
  /** Primitive blast furnace: 3×3×4 hollow shaft, open top. */
  shaft: { cells: [...ring(0), ...ring(1), ...ring(2), ...ring(3)], hollow: [[0, 0, 1], [0, 0, 2], [0, 0, 3]] },
} satisfies Record<string, Pattern>;
export type PatternId = keyof typeof PATTERNS;
/** Structures that belong to multiblocks (controllers + casings) — rendered full height whatever the view level. */
export const MULTI_PARTS = new Set<string>();

const FIRE = 0xc9b48a, DIRT = 0x6a4a2e, LIME = 0xd8d4c8, GLOW = 0xff8a30;
const LEAD = 0x5c5a78, TIN = 0xc8ccd0, HULL_D = 0x8a5a20, STEEL = 0x707478, WATER = 0x3070d0;
const WOOD = 0x9a7040, DARK = 0x5a4026, CLAY = 0xa86a48, BRICK = 0x9a4a32, STONE = 0x8a8a88, BRONZE = 0xc08a40, SOOT = 0x2a2420;

export const STRUCTURES: StructDef[] = [
  { id: 'chest', name: 'Wooden Chest', color: WOOD, machine: 'chest', cost: [['plank:wood', 8]],
    model: [[2, 0, 3, 14, 9, 13, WOOD], [2, 9, 3, 14, 11, 13, DARK], [7, 6, 13, 9, 9, 14, 0x404040]] },
  { id: 'barrel', name: 'Wooden Barrel', color: WOOD, machine: 'barrel', cost: [['plank:wood', 7]],
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
    multi: { casing: 'soil_cover', pattern: 'mound' },
    model: [[0, 0, 0, 16, 16, 16, DIRT], [6, 2, 15, 10, 6, 16, SOOT]] },
  { id: 'soil_cover', name: 'Soil Cover', color: DIRT, cost: [['dirt', 2]],
    model: [[0, 0, 0, 16, 16, 16, DIRT], [0, 15, 0, 16, 16, 16, 0x7a5a3a]] },
  { id: 'bloomery', name: 'Bloomery', color: BRICK, machine: 'bloomery', cost: [['brick:brick', 6], ['ball:clay', 4]],
    multi: { casing: 'clay_wall', pattern: 'stack' },
    model: [[2, 0, 2, 14, 14, 14, CLAY], [4, 14, 4, 12, 16, 12, BRICK], [6, 2, 13, 10, 6, 14, GLOW]] },
  { id: 'clay_wall', name: 'Bloomery Wall', color: CLAY, cost: [['brick:brick', 4], ['ball:clay', 2]],
    model: [[1, 0, 1, 15, 16, 15, CLAY], [1, 7, 1, 15, 8, 15, BRICK]] },
  { id: 'coke_oven', name: 'Coke Oven', color: FIRE, machine: 'coke_oven', cost: [['fire_brick:fireclay', 8]],
    multi: { casing: 'fire_brick_wall', pattern: 'oven' },
    model: [[0, 0, 0, 16, 16, 16, FIRE], [5, 3, 15, 11, 10, 16, SOOT]] },
  { id: 'primitive_blast_furnace', name: 'Primitive Blast Furnace', color: FIRE, machine: 'primitive_blast_furnace',
    cost: [['fire_brick:fireclay', 8], ['plate:wrought_iron', 4]], multi: { casing: 'fire_brick_wall', pattern: 'shaft' },
    model: [[0, 0, 0, 16, 16, 16, FIRE], [5, 2, 15, 11, 8, 16, GLOW]] },
  { id: 'fire_brick_wall', name: 'Fire Brick Wall', color: FIRE, cost: [['fire_brick:fireclay', 2]],
    model: [[0, 0, 0, 16, 16, 16, FIRE], [0, 8, 0, 16, 9, 16, 0xb8a47a]] },
  // ---- Steam age (P3a) ----
  { id: 'bronze_pipe', name: 'Bronze Fluid Pipe', color: BRONZE, cost: [['pipe_small:bronze', 1]], pipe: { rate: 120, cap: 1000 },
    model: [[5, 5, 5, 11, 11, 11, BRONZE]] },
  // P3b
  { id: 'lead_pipe', name: 'Lead Fluid Pipe', color: LEAD, cost: [['pipe_small:lead', 1]], pipe: { rate: 80, cap: 800 },
    model: [[5, 5, 5, 11, 11, 11, LEAD]] },
  { id: 'tin_item_pipe', name: 'Tin Item Pipe', color: TIN, cost: [['item_pipe:tin', 1]], pipe: { rate: 4, cap: 0, item: true },
    model: [[5, 5, 5, 11, 11, 11, TIN]] },
  { id: 'water_pump', name: 'Water Pump', color: BRONZE, machine: 'water_pump', tools: ['wrench'],
    cost: [['plate:bronze', 4], ['pipe:bronze', 2], ['rotor:bronze', 1], ['plank:wood', 4]],
    model: [[2, 0, 2, 14, 3, 14, WOOD], [4, 3, 4, 12, 11, 12, BRONZE], [6, 11, 6, 10, 14, 10, HULL_D], [1, 5, 6, 4, 9, 10, WATER]] },
  { id: 'small_boiler', name: 'Small Bronze Boiler', color: BRONZE, machine: 'small_boiler', tools: ['wrench'],
    cost: [['hull:bronze', 1], ['brick:brick', 8], ['struct:clay_furnace', 1]],
    model: [[1, 0, 1, 15, 5, 15, BRICK], [5, 1, 15, 11, 4, 16, GLOW], [2, 5, 2, 14, 15, 14, BRONZE], [2, 9, 2, 14, 10, 14, HULL_D], [6, 15, 6, 10, 16, 10, HULL_D]] },
  { id: 'steam_furnace', name: 'Steam Furnace', color: BRONZE, machine: 'steam_furnace', tools: ['wrench'],
    cost: [['hull:bronze', 1], ['brick:brick', 8], ['struct:clay_furnace', 1]],
    model: [[1, 0, 1, 15, 14, 15, BRONZE], [4, 3, 15, 12, 9, 16, SOOT], [5, 4, 15, 11, 7, 16, GLOW], [1, 14, 1, 15, 15, 15, HULL_D]] },
  { id: 'steam_macerator', name: 'Steam Macerator', color: BRONZE, machine: 'steam_macerator', tools: ['wrench'],
    cost: [['hull:bronze', 1], ['grinder_head:steel', 1], ['piston:bronze', 1]],
    model: [[1, 0, 1, 15, 11, 15, BRONZE], [3, 11, 3, 13, 15, 13, STEEL], [5, 15, 5, 11, 16, 11, SOOT], [4, 3, 15, 12, 8, 16, HULL_D]] },
  { id: 'steam_forge_hammer', name: 'Steam Forge Hammer', color: BRONZE, machine: 'steam_forge_hammer', tools: ['wrench'],
    cost: [['hull:bronze', 1], ['piston:bronze', 1], ['struct:stone_anvil', 1]],
    model: [[1, 0, 1, 15, 6, 15, BRONZE], [4, 6, 4, 12, 8, 12, STONE], [6, 8, 6, 10, 15, 10, STEEL], [3, 12, 3, 13, 16, 13, BRONZE]] },
  { id: 'steam_ore_washer', name: 'Steam Ore Washer', color: BRONZE, machine: 'steam_ore_washer', tools: ['wrench'],
    cost: [['hull:bronze', 1], ['rotor:bronze', 1], ['pipe:bronze', 1]],
    model: [[1, 0, 1, 15, 10, 15, BRONZE], [3, 10, 3, 13, 13, 13, WATER], [7, 10, 2, 9, 16, 14, HULL_D]] },
  { id: 'steam_alloy_smelter', name: 'Steam Alloy Smelter', color: BRONZE, machine: 'steam_alloy_smelter', tools: ['wrench'],
    cost: [['hull:bronze', 1], ['brick:brick', 8], ['crucible:clay', 1]],
    model: [[1, 0, 1, 15, 12, 15, BRICK], [3, 2, 15, 13, 8, 16, BRONZE], [5, 3, 15, 11, 7, 16, GLOW], [4, 12, 4, 12, 15, 12, BRONZE]] },
  { id: 'stone_anvil', name: 'Stone Anvil', color: STONE, machine: 'anvil', cost: [['cobble:stone', 8]], tools: ['hammer'],
    model: [[3, 0, 4, 13, 4, 12, STONE], [5, 4, 6, 11, 8, 10, STONE], [2, 8, 5, 14, 11, 11, 0x9a9a98]] },
];

/** Pipe structures (fluid + item) by id. */
export const PIPES = new Map(STRUCTURES.filter((s) => s.pipe).map((s) => [s.id, s.pipe!]));
for (const s of STRUCTURES) if (s.multi) { MULTI_PARTS.add(s.id); MULTI_PARTS.add(s.multi.casing); }
