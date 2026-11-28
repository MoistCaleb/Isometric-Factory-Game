import type { ToolType } from '../data/forms';
import type { Hazard } from '../data/materials';
import type { TierId } from '../data/tiers';

export type ItemKind = 'material' | 'ore' | 'tool' | 'misc' | 'structure';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  color: number;
  material?: string;
  mineral?: string;
  form?: string;
  tool?: { type: ToolType; level: number; durability: number; /** Electric (P4d): J per use · also counts as these types. */ elec?: number; also?: ToolType[] };
  hazards?: Hazard[];
}

export interface FluidDef {
  id: string;
  name: string;
  color: number;
  phase: 'gas' | 'liquid';
  hazards: Hazard[];
  /** Temperature (K) for molten metals. */
  tempK?: number;
}

/** Items: count. Fluids: litres. */
export interface Stack { id: string; n: number; chance?: number }

export interface Recipe {
  id: string;
  machine: string;
  tier: TierId;
  inputs: Stack[];
  outputs: Stack[];
  fluidsIn?: Stack[];
  fluidsOut?: Stack[];
  /** Not consumed (molds, catalysts). */
  keep?: string[];
  /** Chance per run that each kept item is used up (P5c catalysts wear). */
  wear?: number;
  /** Tools used (worn by 1 per craft). */
  tools?: ToolType[];
  /** Programmed circuit number. */
  circuit?: number;
  minHeatK?: number;
  /** Duration in ticks (20/s). 0 = instant (hand). */
  ticks: number;
  /** Power draw in W (electric); steam machines draw STEAM_PER_POWER L steam/tick per unit; 0 for primitive. */
  power: number;
}
