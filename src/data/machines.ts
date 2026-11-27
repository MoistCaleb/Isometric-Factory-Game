// Machine ids referenced by recipes. Full machine defs (parts, faces, power) arrive P2–P4.
import type { TierId } from './tiers';

export interface MachineDef { id: string; name: string; tier: TierId; maxHeatK?: number }

type Row = [id: string, name: string, tier: TierId, maxHeatK?: number];
const ROWS: Row[] = [
  ['hand', 'Crafting Station', 'P'],
  ['pit_kiln', 'Pit Kiln', 'P', 1100],
  ['clay_furnace', 'Clay Furnace', 'P', 1400],
  ['crucible', 'Crucible + Molds', 'P', 1400],
  ['bloomery', 'Bloomery', 'P', 1500],
  ['primitive_blast_furnace', 'Primitive Blast Furnace', 'P', 1900],
  ['quern', 'Quern', 'P'],
  ['sluice', 'Sluice Box', 'P'],
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
export const MACHINES: MachineDef[] = ROWS.map(([id, name, tier, maxHeatK]) => ({ id, name, tier, maxHeatK }));
