// Machine ids referenced by recipes. Full machine defs (parts, faces, power) arrive P2–P4.
import type { TierId } from './tiers';

/**
 * Primitive run modes (P2d): `fuel` burns fuel items for heat · `self` burns its own charge (no fuel) ·
 * `crank` advances only when the player cranks/strikes it. Steam/electric arrive P3/P4.
 */
export type RunMode = 'fuel' | 'self' | 'crank';
export interface MachineDef {
  id: string; name: string; tier: TierId; maxHeatK?: number;
  run?: RunMode;
  /** Default min heat for fuelled recipes without their own `minHeatK`. */
  heatK?: number;
  /** Fluid tank (L) for molten metal / liquid byproducts. Gas outputs vent. */
  tank?: number;
  /** Needs water on an adjacent tile (river, lake, sea). */
  water?: boolean;
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
  ['steam_furnace', 'Steam Furnace', 'S', 1400],
  ['steam_macerator', 'Steam Macerator', 'S'],
  ['steam_forge_hammer', 'Steam Forge Hammer', 'S'],
  ['steam_ore_washer', 'Steam Ore Washer', 'S'],
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
