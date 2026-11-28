import { CROPS, SAPLINGS } from './crops';
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
  // Steam parts (CONTENT §11c Steam age).
  { id: 'hull:bronze', name: 'Bronze Hull', color: 0xc98b3a },
  { id: 'hull:steel', name: 'Steel Hull', color: 0x707478 },
  { id: 'piston:bronze', name: 'Bronze Piston', color: 0xb07a30 },
  { id: 'grinder_head:steel', name: 'Steel Grinder Head', color: 0x707478 },
  // LV parts + circuit chain (CONTENT §11c LV, §11d, P4a).
  { id: 'magnetic_rod:iron', name: 'Magnetic Iron Rod', color: 0x9a9aa8 },
  { id: 'hull:lv', name: 'LV Hull', color: 0x8a8e94 },
  { id: 'motor:lv', name: 'LV Motor', color: 0x9a7050 },
  { id: 'pump:lv', name: 'LV Pump', color: 0x5070a0 },
  { id: 'piston:lv', name: 'LV Piston', color: 0x8a8e94 },
  { id: 'conveyor:lv', name: 'LV Conveyor Module', color: 0x303030 },
  { id: 'robot_arm:lv', name: 'LV Robot Arm', color: 0xa08a50 },
  { id: 'board:resin', name: 'Resin Board', color: 0xb08040 },
  { id: 'circuit_board:basic', name: 'Basic Circuit Board', color: 0x6a8a40 },
  { id: 'vacuum_tube', name: 'Vacuum Tube', color: 0xc8d8e0 },
  { id: 'resistor:carbon', name: 'Carbon Resistor', color: 0x5a4a3a },
  { id: 'circuit:basic', name: 'Basic Circuit', color: 0x40a040 },
  // P5a aluminium line + MV hull.
  { id: 'dust:aluminium_hydroxide', name: 'Aluminium Hydroxide Dust', color: 0xe8e8e0 },
  { id: 'dust:alumina', name: 'Alumina Dust', color: 0xf0f0f0 },
  { id: 'dust:cryolite', name: 'Cryolite Dust', color: 0xd8e8f0 },
  { id: 'hull:mv', name: 'MV Hull', color: 0xb0c4d8 },
  // P5b MV parts.
  { id: 'magnetic_rod:steel', name: 'Magnetic Steel Rod', color: 0x8a8ea0 },
  { id: 'motor:mv', name: 'MV Motor', color: 0x9a8060 },
  { id: 'pump:mv', name: 'MV Pump', color: 0x6080b0 },
  { id: 'piston:mv', name: 'MV Piston', color: 0xb0c4d8 },
  { id: 'conveyor:mv', name: 'MV Conveyor Module', color: 0x404448 },
  { id: 'robot_arm:mv', name: 'MV Robot Arm', color: 0xb09a60 },
  // P5c organic chemistry + discrete circuit.
  { id: 'catalyst:silver', name: 'Silver Catalyst Mesh', color: 0xd8dce4 },
  { id: 'catalyst:vanadium_pentoxide', name: 'Vanadium Pentoxide Catalyst', color: 0xd0a040 },
  { id: 'paper', name: 'Paper', color: 0xf0ece0 },
  { id: 'board:phenolic', name: 'Phenolic Board', color: 0x8a5020 },
  { id: 'circuit_board:discrete', name: 'Discrete Circuit Board', color: 0x5a7a30 },
  { id: 'case:phenolic', name: 'Phenolic Component Case', color: 0x6a3a18 },
  { id: 'transistor', name: 'Transistor', color: 0x3a3a40 },
  { id: 'diode', name: 'Diode', color: 0xd8d0c0 },
  { id: 'capacitor', name: 'Capacitor', color: 0x4060a0 },
  { id: 'circuit:discrete', name: 'Discrete Circuit', color: 0x3070c0 },
  // P5d chromium line.
  { id: 'dust:soda_ash', name: 'Soda Ash', color: 0xf0f0ec },
  { id: 'dust:sodium_chromate', name: 'Sodium Chromate Dust', color: 0xe8d030 },
  { id: 'dust:sodium_dichromate', name: 'Sodium Dichromate Dust', color: 0xe07020 },
  { id: 'dust:chromium_oxide', name: 'Chromium(III) Oxide Dust', color: 0x3a7a3a },
];

/** Items obtainable from the world (gathering, mining, pumping). All `ore:*` are implicit. */
export const WORLD_ITEMS = [
  'log:wood', 'stick:wood', 'shard:flint', 'dirt', 'cobble:stone', 'gravel:stone', 'ball:clay', 'dust:sand',
  'fiber', 'straw', 'sticky_resin', 'lodestone',
  // P5h: wild plants and chopped trees.
  ...CROPS.filter((c) => c.wild).flatMap((c) => [`seed:${c.id}`, `crop:${c.id}`]), ...SAPLINGS.map((sp) => `sapling:${sp.id}`),
];
export const WORLD_FLUIDS = ['water', 'brine', 'air', 'crude_oil', 'natural_gas'];
