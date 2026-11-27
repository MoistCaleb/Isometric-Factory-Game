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
  ],
};
/** Tiers that have crates (an item `crate:<tier>`). */
export const CRATE_TIERS = Object.keys(LOOT) as TierId[];
export const crateId = (t: TierId) => `crate:${t.toLowerCase()}`;
