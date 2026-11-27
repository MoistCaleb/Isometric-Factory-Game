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
  tool?: { type: ToolType; level: number; durability: number };
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
  /** Tools used (worn by 1 per craft). */
  tools?: ToolType[];
  /** Programmed circuit number. */
  circuit?: number;
  minHeatK?: number;
  /** Duration in ticks (20/s). 0 = instant (hand). */
  ticks: number;
  /** Power draw in W (electric) or steam L/s; 0 for primitive. */
  power: number;
}
