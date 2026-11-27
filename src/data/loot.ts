// Loot crates (CONTENT §11f): tiered, random useful items; rare "lucky" roll from the next tier's table.
import type { TierId } from './tiers';

export interface LootEntry { id: string; n: [number, number]; w: number }
export const CRATE_ROLLS = 3;
export const LUCKY = 0.05;

export const LOOT: Partial<Record<TierId, LootEntry[]>> = {
  P: [
    { id: 'log:wood', n: [4, 12], w: 10 }, { id: 'lump:charcoal', n: [4, 12], w: 8 }, { id: 'ball:clay', n: [8, 16], w: 8 },
    { id: 'shard:flint', n: [2, 6], w: 6 }, { id: 'fiber', n: [4, 12], w: 4 }, { id: 'brick:brick', n: [4, 8], w: 5 },
    { id: 'lump:coal', n: [2, 8], w: 5 }, { id: 'ingot:copper', n: [1, 3], w: 4 }, { id: 'ingot:tin', n: [1, 2], w: 3 },
    { id: 'sticky_resin', n: [2, 4], w: 3 }, { id: 'tool:hammer:stone', n: [1, 1], w: 2 },
  ],
  S: [
    { id: 'ingot:bronze', n: [2, 6], w: 8 }, { id: 'ingot:wrought_iron', n: [2, 4], w: 6 }, { id: 'ingot:steel', n: [1, 2], w: 3 },
    { id: 'fire_brick:fireclay', n: [4, 8], w: 6 }, { id: 'lump:coke', n: [4, 8], w: 6 }, { id: 'sheet:rubber', n: [2, 4], w: 4 },
    { id: 'pane:glass', n: [2, 4], w: 4 }, { id: 'tool:pickaxe:bronze', n: [1, 1], w: 2 },
    { id: 'plate:bronze', n: [2, 6], w: 6 }, { id: 'struct:bronze_pipe', n: [4, 8], w: 5 }, { id: 'struct:tin_item_pipe', n: [4, 8], w: 4 }, { id: 'piston:bronze', n: [1, 1], w: 2 },
    { id: 'sticky_resin', n: [4, 8], w: 4 }, { id: 'small_dust:sulfur', n: [2, 4], w: 3 },
  ],
  LV: [
    { id: 'ingot:steel', n: [2, 6], w: 8 }, { id: 'plate:steel', n: [2, 4], w: 6 }, { id: 'cable:tin', n: [2, 6], w: 6 },
    { id: 'fine_wire:copper', n: [4, 12], w: 5 }, { id: 'ingot:solder', n: [1, 3], w: 4 }, { id: 'sheet:rubber', n: [2, 6], w: 5 },
    { id: 'struct:tin_cable', n: [4, 8], w: 5 }, { id: 'ingot:nickel', n: [1, 2], w: 3 }, { id: 'tube:glass', n: [2, 4], w: 3 },
    { id: 'vacuum_tube', n: [1, 2], w: 2 }, { id: 'circuit:basic', n: [1, 1], w: 1 }, { id: 'motor:lv', n: [1, 1], w: 1 },
    { id: 'cell:empty', n: [2, 4], w: 4 }, { id: 'dust:salt', n: [4, 8], w: 3 }, { id: 'struct:lead_pipe', n: [2, 6], w: 3 }, { id: 'pane:glass', n: [2, 4], w: 3 },
  ],
};
/** Tiers that have crates (an item `crate:<tier>`). */
export const CRATE_TIERS = Object.keys(LOOT) as TierId[];
export const crateId = (t: TierId) => `crate:${t.toLowerCase()}`;
