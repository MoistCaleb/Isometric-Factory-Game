// Machine ids referenced by recipes. Full machine defs (parts, faces, power) arrive P2–P4.
import { TIER_VOLTAGE, type TierId } from './tiers';
import type { ToolType } from './forms';

/**
 * Run modes: `fuel` burns fuel items for heat · `self` burns its own charge (no fuel) · `crank` advances only when the
 * player cranks/strikes it (P2d) · `boiler` burns fuel to turn piped water into steam · `steam` draws steam from pipes ·
 * `pump` fills its tank from adjacent water (P3a) · `store` chest (item slots) · `tank` barrel (one fluid) (P3b) ·
 * `thump` steam thumper (surveys deep veins once) · `dig` steam excavator (mines ore below it) (P3c) · `elec` draws power from its
 * buffer, filled by cables · `gen` generator feeding cables (P4a).
 */
export type RunMode = 'fuel' | 'self' | 'crank' | 'boiler' | 'steam' | 'pump' | 'store' | 'tank' | 'thump' | 'dig' | 'elec' | 'gen' | 'batt' | 'xfmr';
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
  /** Steam L/tick for machines without recipes (steam pump, thumper, excavator). */
  steam?: number;
  /** Boiler (P3d): burn ticks used per tick (bigger boilers eat fuel faster) · water tank (L, default BOILER_WATER) ·
   * heated by daylight instead of fuel. */
  fuelUse?: number; waterTank?: number; solar?: boolean;
  /** Pollution per second while burning (P3e). */
  smoke?: number;
  /** Generator (P4a): W at full output. */
  gen?: number;
  /** Recipe-less electric machine (P4b electric pump): W drawn while working. */
  elec?: number;
  /** Generators (P4d): liquid fuels burned (J per L) from a `tank` · output scaled by sunlight / wind × height / flowing water. */
  burns?: Record<string, number>; ambient?: 'sun' | 'wind' | 'water';
  /** Surveyors (P4d, `thump`): [reach tiles, deepest layer, ticks] (default thumper) · diggers (`dig`): [square radius, deepest
   * layer, max hardness, ticks per block × (1 + H)] (default excavator). */
  survey?: [number, number, number]; dig?: [number, number, number, number];
  /** EBF (P4e): coil temperature (K) · multiblock takes maintenance (MAINT issues). Power comes in through energy hatches. */
  coilK?: number; maint?: boolean;
  /** Power only through energy hatches (P4e EBF, P5a Hall–Héroult): each ≤ hatchW(tier) incl. loss, buffer = their total W × 1 s. */
  ehatch?: boolean;
  /** MV variant (P5b): runs this machine's recipes (overclocked when power allows). */
  base?: string;
}

/** Liquid generator fuels (P4d): J per litre. Creosote: a coke oven's 250 L ≈ a coal lump through a boiler + turbine. */
export const LIQUID_FUELS: Record<string, number> = { creosote: 8, wood_tar: 6, ethanol: 60 };

type Row = [id: string, name: string, tier: TierId, maxHeatK?: number, x?: Partial<MachineDef>];
const ROWS: Row[] = [
  ['hand', 'Crafting Station', 'P'],
  ['pit_kiln', 'Pit Kiln', 'P', 1100, { run: 'fuel', heatK: 900, smoke: 1 }],
  ['clay_furnace', 'Clay Furnace', 'P', 1400, { run: 'fuel', heatK: 900, smoke: 1 }],
  ['crucible', 'Crucible + Molds', 'P', 1400, { run: 'fuel', heatK: 600, tank: 144 * 8, smoke: 1 }],
  ['bloomery', 'Bloomery', 'P', 1500, { run: 'fuel', heatK: 1300, smoke: 2 }],
  ['primitive_blast_furnace', 'Primitive Blast Furnace', 'P', 1900, { run: 'fuel', heatK: 1800, smoke: 4 }],
  ['charcoal_pile', 'Charcoal Pile', 'P', undefined, { run: 'self', tank: 4000, smoke: 2 }],
  ['coke_oven', 'Coke Oven', 'P', undefined, { run: 'self', tank: 8000, smoke: 3 }],
  ['lime_kiln', 'Lime Kiln', 'P', 1200, { run: 'fuel', heatK: 1100, smoke: 2 }],
  ['quern', 'Quern', 'P', undefined, { run: 'crank' }],
  ['sluice', 'Sluice Box', 'P', undefined, { run: 'crank', water: true }],
  ['anvil', 'Anvil', 'P', undefined, { run: 'crank' }],
  ['chest', 'Wooden Chest', 'P', undefined, { run: 'store', slots: 27 }],
  ['barrel', 'Wooden Barrel', 'P', undefined, { run: 'tank', tank: 16000, cold: true }],
  ['small_boiler', 'Small Bronze Boiler', 'S', 500, { run: 'boiler', rate: 12, tank: 16000, smoke: 2 }],
  ['hp_boiler', 'High-Pressure Steel Boiler', 'S', 600, { run: 'boiler', rate: 30, tank: 16000, fuelUse: 2, smoke: 4 }],
  ['solar_boiler', 'Solar Boiler', 'S', 450, { run: 'boiler', rate: 6, tank: 8000, solar: true }],
  ['large_boiler', 'Large Boiler', 'S', 800, { run: 'boiler', rate: 120, tank: 32000, fuelUse: 8, waterTank: 32000, smoke: 16 }],
  ['water_pump', 'Water Pump', 'S', undefined, { run: 'pump', rate: 10, tank: 8000, water: true }],
  ['steam_furnace', 'Steam Furnace', 'S', 1400, { run: 'steam' }],
  ['steam_macerator', 'Steam Macerator', 'S', undefined, { run: 'steam' }],
  ['steam_forge_hammer', 'Steam Forge Hammer', 'S', undefined, { run: 'steam' }],
  ['steam_ore_washer', 'Steam Ore Washer', 'S', undefined, { run: 'steam', tank: 8000 }],
  ['steam_alloy_smelter', 'Steam Alloy Smelter', 'S', undefined, { run: 'steam' }],
  ['steam_compressor', 'Steam Compressor', 'S', undefined, { run: 'steam' }],
  ['steam_extractor', 'Steam Extractor', 'S', undefined, { run: 'steam' }],
  ['steam_pump', 'Steam Pump', 'S', undefined, { run: 'pump', rate: 40, tank: 16000, water: true, steam: 4 }],
  ['steam_thumper', 'Steam Thumper', 'S', undefined, { run: 'thump', steam: 16 }],
  ['steam_excavator', 'Steam Excavator', 'S', undefined, { run: 'dig', steam: 16 }],
  // P4a: electric (run 'elec' unless noted).
  ['steam_turbine', 'Steam Turbine', 'LV', undefined, { run: 'gen', gen: 32, steam: 16 }],
  ['electric_furnace', 'Electric Furnace', 'LV', 1750, { run: 'elec' }],
  ['ebf', 'Electric Blast Furnace', 'LV', 4200, { run: 'elec', coilK: 2000, maint: true, ehatch: true, tank: 16000, smoke: 2 }],
  // P5a: aluminium smelter (gate to MV), on LV energy hatches like the EBF.
  ['hall_heroult', 'Hall–Héroult Cell', 'LV', undefined, { run: 'elec', maint: true, ehatch: true, tank: 16000, smoke: 1 }],
  ['macerator', 'Macerator', 'LV', undefined, { run: 'elec' }],
  ['ore_washer', 'Ore Washer', 'LV', undefined, { run: 'elec', tank: 8000 }],
  ['thermal_centrifuge', 'Thermal Centrifuge', 'LV', undefined, { run: 'elec', tank: 4000 }],
  ['centrifuge', 'Centrifuge', 'LV', undefined, { run: 'elec', tank: 8000 }],
  ['bender', 'Bender', 'LV', undefined, { run: 'elec' }],
  ['wiremill', 'Wiremill', 'LV', undefined, { run: 'elec' }],
  ['lathe', 'Lathe', 'LV', undefined, { run: 'elec' }],
  ['cutter', 'Cutter', 'LV', undefined, { run: 'elec' }],
  ['assembler', 'Assembler', 'LV', undefined, { run: 'elec' }],
  ['fluid_extractor', 'Fluid Extractor', 'LV', undefined, { run: 'elec', tank: 8000 }],
  ['fluid_solidifier', 'Fluid Solidifier', 'LV', undefined, { run: 'elec', tank: 8000 }],
  ['polarizer', 'Polarizer', 'LV', undefined, { run: 'elec' }],
  // P4b: chemistry.
  ['mixer', 'Mixer', 'LV', undefined, { run: 'elec', tank: 8000 }],
  ['electrolyzer', 'Electrolyzer', 'LV', undefined, { run: 'elec', tank: 16000 }],
  ['chemical_reactor', 'Chemical Reactor', 'LV', undefined, { run: 'elec', tank: 16000 }],
  ['chemical_bath', 'Chemical Bath', 'LV', undefined, { run: 'elec', tank: 8000 }],
  ['roaster', 'Roaster', 'LV', 1300, { run: 'elec', tank: 8000, smoke: 1 }],
  ['canner', 'Canner', 'LV', undefined, { run: 'elec', tank: 8000 }],
  ['electric_pump', 'Electric Pump', 'LV', undefined, { run: 'pump', rate: 60, tank: 16000, water: true, elec: 16 }],
  ['battery_buffer', 'Battery Buffer', 'LV', undefined, { run: 'batt', slots: 4 }],
  ['transformer', 'Transformer', 'LV', undefined, { run: 'xfmr' }],
  // P4d: LV generators, scanner, mining rig.
  ['combustion_generator', 'Combustion Generator', 'LV', undefined, { run: 'gen', gen: 32, tank: 16000, burns: LIQUID_FUELS, smoke: 1 }],
  ['solar_panel', 'Selenium Solar Panel', 'LV', undefined, { run: 'gen', gen: 8, ambient: 'sun' }],
  ['wind_turbine', 'Wind Turbine', 'LV', undefined, { run: 'gen', gen: 32, ambient: 'wind' }],
  ['water_turbine', 'Water Turbine', 'LV', undefined, { run: 'gen', gen: 24, ambient: 'water', water: true }],
  ['scanner', 'Scanner', 'LV', undefined, { run: 'thump', elec: 32, survey: [64, 25, 600] }],
  ['mining_rig', 'Mining Rig', 'LV', undefined, { run: 'dig', elec: 32, dig: [6, 24, 2, 20] }],
  // P5b: MV generators + battery buffer (MV recipe machines are generated from MV_BASE below).
  ['steam_turbine_mv', 'MV Steam Turbine', 'MV', undefined, { run: 'gen', gen: 128, steam: 64 }],
  ['combustion_generator_mv', 'MV Combustion Generator', 'MV', undefined, { run: 'gen', gen: 128, tank: 16000, burns: LIQUID_FUELS, smoke: 2 }],
  ['battery_buffer_mv', 'MV Battery Buffer', 'MV', undefined, { run: 'batt', slots: 4 }],
  // P5c: organic chemistry (MV only, no LV version).
  ['pyrolyse_oven', 'Pyrolyse Oven', 'MV', undefined, { run: 'elec', maint: true, ehatch: true, tank: 32000, smoke: 3 }],
  ['distillery', 'Coal Tar Distillery', 'MV', undefined, { run: 'elec', tank: 32000 }],
  ['vacuum_freezer', 'Vacuum Freezer', 'HV'],
];
/** LV recipe machines with an MV variant `<id>_mv` (P5b): 128 V, same recipes, overclocked (DESIGN §5). */
export const MV_BASE = ['macerator', 'electric_furnace', 'bender', 'wiremill', 'lathe', 'cutter', 'assembler', 'ore_washer', 'centrifuge',
  'thermal_centrifuge', 'fluid_extractor', 'fluid_solidifier', 'polarizer', 'mixer', 'electrolyzer', 'chemical_reactor', 'chemical_bath',
  'roaster', 'canner'];
const DEFS: MachineDef[] = ROWS.map(([id, name, tier, maxHeatK, x]) => ({ id, name, tier, maxHeatK, ...x }));
export const MACHINES: MachineDef[] = [...DEFS, ...MV_BASE.map((b): MachineDef => {
  const d = DEFS.find((x) => x.id === b)!;
  return { ...d, id: `${b}_mv`, name: `MV ${d.name}`, tier: 'MV', base: b };
})];
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
/** Steam thumper (P3c): ticks per survey, reach (tiles) and depth (layer) — deeper than the prospector's hammer. */
export const THUMP_TICKS = 400, THUMP_R = 48, THUMP_DEPTH = 16;
/** Steam excavator (P3c): square radius below it, deepest layer, max ore hardness, ticks per block × (1 + hardness),
 * positions scanned per tick while looking for ore. */
export const DIG_R = 4, DIG_DEPTH = 16, DIG_H = 1, DIG_TICKS = 40, DIG_SCAN = 128;
/** Electricity (DESIGN §6, P4a): machine input = tier voltage × AMP_IN, buffer = BUF_S seconds of input. */
export const AMP_IN = 1, BUF_S = 1;
/** Grid (P4c): lead-acid battery (J), battery buffer W per battery (1 A at LV) · transformer W (1 A high side = 4 A low side). */
export const BATT_J = 36000, XFMR_W = 128;
/** P4d: wind turbine reaches full output at this block level (lower = less) · water turbine output next to a lake (river = 1,
 * more in rain) · electric tools: J per use (drill/chainsaw block, scanner survey), handheld scanner reach + depth. */
export const WIND_FULL_B = 12, LAKE_FLOW = 0.35, ETOOL_J = 200, SCAN_J = 4000, SCAN_R = 32, SCAN_DEPTH = 16;
/** Gate (P4e): an LV energy hatch takes 2 A (64 W) — two give a multiblock 128 W, MV-level power · maintenance: speed lost per
 * issue, chance of a new issue per working second, issues (tool that fixes it, text); a new multiblock has all of them ·
 * hazards: litres of a toxic/corrosive fluid dumped that contaminate the tile, pollution per fire. */
export const MAINT_LOSS = 0.1, MAINT_P = 1 / 1800, DUMP_HAZ = 100, FIRE_POLL = 200;
export const MAINT: [tool: ToolType, text: string][] = [['wrench', 'Loose bolts'], ['screwdriver', 'Loose screws'], ['hammer', 'Dented casing'],
  ['soldering_iron', 'Burnt wiring'], ['wire_cutter', 'Frayed cables'], ['file', 'Burred gears']];
export const BATT = 'battery:lead_acid', BATT_FULL = 'charged_battery:lead_acid';
/** Batteries by buffer tier (P4c lead-acid, P5b lithium): empty / charged item, J. A buffer gives 1 A at its tier per battery. */
export const BATTERIES: Partial<Record<TierId, { empty: string; full: string; j: number }>> = {
  LV: { empty: BATT, full: BATT_FULL, j: BATT_J }, MV: { empty: 'battery:lithium', full: 'charged_battery:lithium', j: 4 * BATT_J },
};
export const battOf = (d: MachineDef) => BATTERIES[d.tier] ?? BATTERIES.LV!;
/** Energy hatch W by hatch tier (2 A): LV 64, MV 256 (P5b). */
export const hatchW = (t: TierId) => 2 * TIER_VOLTAGE[t];
/** Overclocking (DESIGN §5, P5b): each tier above the recipe's, while power allows → ×SPEED speed, ×POWER power. */
export const OC_SPEED = 2, OC_POWER = 4;
/** Transformer high (MV) side: the controller's front face (rot 0 south → west → north → east), as a SIDES index. */
export const xfFront = (r: number) => [2, 1, 3, 0][r & 3];
/** Chemistry (P4b): litres per cell · corrosion burst chance per non-acid-proof pipe block per second · pollution per burst ·
 * pollution per litre of a dumped gas/toxic fluid. */
export const CELL_L = 1000, CORRODE_P = 0.01, LEAK_POLL = 100, DUMP_POLL = 0.05;
/** Fluids that come in cells (P4b). */
export const CELL_FLUIDS = ['water', 'brine', 'sodium_hydroxide', 'chlorine', 'hydrogen', 'oxygen', 'hydrochloric_acid', 'sulfur_dioxide',
  'sulfuric_acid', 'mercury', 'creosote', 'wood_tar', 'hydrofluoric_acid', 'methanol', 'coal_tar', 'phenol'];
