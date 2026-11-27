// Non-material items and world sources (things gathered/mined directly).
export interface MiscItemDef { id: string; name: string; color: number }

export const MISC_ITEMS: MiscItemDef[] = [
  { id: 'dirt', name: 'Dirt', color: 0x7a5a3a },
  { id: 'fiber', name: 'Plant Fiber', color: 0x6a9a40 },
  { id: 'straw', name: 'Straw', color: 0xd8c060 },
  { id: 'sticky_resin', name: 'Sticky Resin', color: 0xd09030 },
  { id: 'lodestone', name: 'Lodestone', color: 0x303034 },
  { id: 'slag', name: 'Slag', color: 0x5a5048 },
  { id: 'iron_bloom', name: 'Iron Bloom', color: 0x6a5a50 },
];

/** Items obtainable from the world (gathering, mining, pumping). All `ore:*` are implicit. */
export const WORLD_ITEMS = [
  'log:wood', 'stick:wood', 'shard:flint', 'dirt', 'cobble:stone', 'gravel:stone', 'ball:clay', 'dust:sand',
  'fiber', 'straw', 'sticky_resin', 'lodestone',
];
export const WORLD_FLUIDS = ['water', 'brine', 'air', 'crude_oil', 'natural_gas'];
