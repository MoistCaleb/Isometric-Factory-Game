// Machine ids referenced by recipes. Full machine defs (parts, faces, power) arrive P2–P4.
import type { TierId } from './tiers';

/**
 * Run modes: `fuel` burns fuel items for heat · `self` burns its own charge (no fuel) · `crank` advances only when the
 * player cranks/strikes it (P2d) · `boiler` burns fuel to turn piped water into steam · `steam` draws steam from pipes ·
 * `pump` fills its tank from adjacent water (P3a) · `store` chest (item slots) · `tank` barrel (one fluid) (P3b). Electric arrives P4.
 */
export type RunMode = 'fuel' | 'self' | 'crank' | 'boiler' | 'steam' | 'pump' | 'store' | 'tank';
export interface MachineDef {
  id: string; name: string; tier: TierId; maxHeatK?: number;
  run?: RunMode;
  /** Default min heat for fuelled recipes without their own `minHeatK`. */
  heatK?: number;
  /** Fluid tank (L) for molten metal / liquid byproducts. Gas outputs vent. */
  tank?: number;
  /** Needs water on an adjacent tile (river, lake, sea). */
  water?: boolean;
  /** Boiler: steam L/tick at full temperature. Pump: water L/tick. */
  rate?: number;
  /** Chest: item slots (stacks of 64). */
  slots?: number;
  /** Wooden storage: no steam or molten metal (≤ 350 K). */
  cold?: boolean;
}

type Row = [id: string, name: string, tier: TierId, maxHeatK?: number, x?: Partial<MachineDef>];
const ROWS: Row[] = [
  ['hand', 'Crafting Station', 'P'],
  ['pit_kiln', 'Pit Kiln', 'P', 1100, { run: 'fuel', heatK: 900 }],
  ['clay_furnace', 'Clay Furnace', 'P', 1400, { run: 'fuel', heatK: 900 }],
  ['crucible', 'Crucible + Molds', 'P', 1400, { run: 'fuel', heatK: 600, tank: 144 * 8 }],
  ['bloomery', 'Bloomery', 'P', 1500, { run: 'fuel', heatK: 1300 }],
  ['primitive_blast_furnace', 'Primitive Blast Furnace', 'P', 1900, { run: 'fuel', heatK: 1800 }],
  ['charcoal_pile', 'Charcoal Pile', 'P', undefined, { run: 'self', tank: 4000 }],
  ['coke_oven', 'Coke Oven', 'P', undefined, { run: 'self', tank: 8000 }],
  ['lime_kiln', 'Lime Kiln', 'P', 1200, { run: 'fuel', heatK: 1100 }],
  ['quern', 'Quern', 'P', undefined, { run: 'crank' }],
  ['sluice', 'Sluice Box', 'P', undefined, { run: 'crank', water: true }],
  ['anvil', 'Anvil', 'P', undefined, { run: 'crank' }],
  ['chest', 'Wooden Chest', 'P', undefined, { run: 'store', slots: 27 }],
  ['barrel', 'Wooden Barrel', 'P', undefined, { run: 'tank', tank: 16000, cold: true }],
  ['small_boiler', 'Small Bronze Boiler', 'S', 500, { run: 'boiler', rate: 12, tank: 16000 }],
  ['water_pump', 'Water Pump', 'S', undefined, { run: 'pump', rate: 10, tank: 8000, water: true }],
  ['steam_furnace', 'Steam Furnace', 'S', 1400, { run: 'steam' }],
  ['steam_macerator', 'Steam Macerator', 'S', undefined, { run: 'steam' }],
  ['steam_forge_hammer', 'Steam Forge Hammer', 'S', undefined, { run: 'steam' }],
  ['steam_ore_washer', 'Steam Ore Washer', 'S', undefined, { run: 'steam', tank: 8000 }],
  ['steam_alloy_smelter', 'Steam Alloy Smelter', 'S', undefined, { run: 'steam' }],
  ['electric_furnace', 'Electric Furnace', 'LV', 1750],
  ['ebf', 'Electric Blast Furnace', 'LV', 4200],
  ['macerator', 'Macerator', 'LV'],
  ['ore_washer', 'Ore Washer', 'LV'],
  ['thermal_centrifuge', 'Thermal Centrifuge', 'LV'],
  ['centrifuge', 'Centrifuge', 'LV'],
  ['bender', 'Bender', 'LV'],
  ['wiremill', 'Wiremill', 'LV'],
  ['lathe', 'Lathe', 'LV'],
  ['cutter', 'Cutter', 'LV'],
  ['assembler', 'Assembler', 'LV'],
  ['fluid_extractor', 'Fluid Extractor', 'LV'],
  ['fluid_solidifier', 'Fluid Solidifier', 'LV'],
  ['vacuum_freezer', 'Vacuum Freezer', 'HV'],
];
export const MACHINES: MachineDef[] = ROWS.map(([id, name, tier, maxHeatK, x]) => ({ id, name, tier, maxHeatK, ...x }));
export const MACHINE = new Map(MACHINES.map((m) => [m.id, m]));

/** Primitive fuels (P2d): item → [flame K, burn ticks]. Heat is capped by the machine's maxHeatK. */
export const FUELS: Record<string, [number, number]> = {
  straw: [800, 60], 'stick:wood': [900, 100], 'plank:wood': [1000, 300], 'log:wood': [1000, 1200],
  'lump:charcoal': [1500, 1600], 'lump:coal': [1600, 1600], 'lump:coke': [2000, 3200],
};
/** Ticks added per crank / hammer strike. */
export const CRANK_TICKS = 20;
export const AMBIENT_K = 290;
/** Steam (DESIGN §6, P3a): boiling point, water → steam ratio, steam per recipe power unit per tick, machine steam buffer,
 * boiler water tank, boiler heating rate (slower than furnaces), dry boiler explodes on water above this. */
export const BOIL_K = 373, STEAM_PER_WATER = 160, STEAM_PER_POWER = 2, STEAM_BUF = 2000, BOILER_WATER = 8000, BOILER_RATE = 0.002, BOOM_K = 400;
/** Item pipes (P3b) move items every this many ticks; face modes per machine side (DESIGN §5). */
export const ITEM_EVERY = 10;
export const FACE = { auto: 0, in: 1, out: 2, off: 3 } as const;
export const FACE_NAMES = ['Auto', 'In', 'Out', 'Off'];
/** Face index = side: east (+x), west, south (+y), north, up, down. */
export const SIDES = ['East', 'West', 'South', 'North', 'Up', 'Down'];
