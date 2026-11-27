// CONTENT §11a — the 61 solid materials. Items + templated recipes are generated from this.
import type { Flag } from './forms';
import type { TierId } from './tiers';

export type Hazard = 'toxic' | 'corrosive' | 'flammable' | 'radioactive';

export interface MaterialDef {
  id: string;
  name: string;
  formula?: string;
  meltK?: number;
  tier: TierId;
  flags: Flag[];
  /** Special ("C") forms, item id = `${form}:${material}`. */
  extra: string[];
  color: number;
  /** Pickaxe reach (max ore hardness) for T-flag materials. */
  toolLevel?: number;
  /** Base tool durability (uses). */
  durability?: number;
  hazards?: Hazard[];
  /** Melts/sublimes oddly or never — skip generic smelting. */
  noSmelt?: boolean;
}

type Row = [id: string, name: string, formula: string, meltK: number, tier: TierId, flags: string, extra: string, color: number, extras?: Partial<MaterialDef>];

// meltK 0 = n/a. flags/extra space-separated.
const ROWS: Row[] = [
  ['stone', 'Stone', '', 0, 'P', 'D', 'cobble gravel brick', 0x8a8a8a],
  ['clay', 'Clay', '', 0, 'P', 'D', 'ball unfired_brick unfired_crucible crucible unfired_mold_ingot mold_ingot unfired_mold_plate mold_plate unfired_mold_head mold_head', 0xa3a8b8],
  ['fireclay', 'Fireclay', '', 0, 'P', 'D', 'unfired_fire_brick fire_brick', 0xc9b48a],
  ['brick', 'Brick', '', 0, 'P', 'D', 'brick block', 0xa0523c],
  ['wood', 'Wood', '', 0, 'P', '', 'log plank stick pulp', 0x8b6a3e],
  ['charcoal', 'Charcoal', 'C', 0, 'P', 'D', 'lump', 0x2e2a26],
  ['coal', 'Coal', 'C', 0, 'P', 'D', 'lump', 0x1e1e1e],
  ['coke', 'Coke', 'C', 0, 'P', 'D', 'lump', 0x3b3b44],
  ['flint', 'Flint', 'SiO₂', 0, 'P', 'T', 'shard', 0x3d3d45, { toolLevel: 0, durability: 40 }],
  ['sand', 'Sand', 'SiO₂', 0, 'P', 'D', '', 0xe0cf94],
  ['glass', 'Glass', '', 1400, 'P', 'D', 'pane tube lens', 0xcfe8ee, { noSmelt: true }],
  ['ash', 'Ash', 'K₂CO₃', 0, 'P', 'D', '', 0x9c9890],
  ['copper', 'Copper', 'Cu', 1358, 'P', 'B G W F PF T', '', 0xd87a3c, { toolLevel: 0, durability: 80 }],
  ['tin', 'Tin', 'Sn', 505, 'P', 'B W F PI', '', 0xc8ccd0],
  ['bronze', 'Bronze', 'Cu₃Sn', 1200, 'P', 'B G R X PF T', '', 0xc98b3a, { toolLevel: 1, durability: 200 }],
  ['iron', 'Iron', 'Fe', 1811, 'P', 'B G S R X', '', 0xb8b8bc],
  ['wrought_iron', 'Wrought Iron', 'Fe', 1811, 'P', 'B G X T', '', 0x9a9690, { toolLevel: 1, durability: 250 }],
  ['steel', 'Steel', 'Fe+C', 1700, 'P', 'B G S R X PF T', '', 0x707478, { toolLevel: 2, durability: 500 }],
  ['lead', 'Lead', 'Pb', 601, 'P', 'B F PF', '', 0x5c5a78, { hazards: ['toxic'] }],
  ['gold', 'Gold', 'Au', 1337, 'P', 'B W F', '', 0xf2c838],
  ['silver', 'Silver', 'Ag', 1235, 'P', 'B W F', '', 0xd8dce4],
  ['zinc', 'Zinc', 'Zn', 693, 'P', 'B F', '', 0xbcc4c8],
  ['brass', 'Brass', 'Cu₃Zn', 1200, 'P', 'B G R X PF', '', 0xd8b848],
  ['sulfur', 'Sulfur', 'S', 388, 'P', 'D', '', 0xe8e040, { noSmelt: true }],
  ['salt', 'Salt', 'NaCl', 1074, 'P', 'D', '', 0xf0f0f0, { noSmelt: true }],
  ['quicklime', 'Quicklime', 'CaO', 0, 'P', 'D', '', 0xeae6da, { hazards: ['corrosive'] }],
  ['rubber', 'Rubber', '(C₅H₈)ₙ', 0, 'P', '', 'raw sheet ring plate', 0x2a2a2a],
  ['nickel', 'Nickel', 'Ni', 1728, 'S', 'B W F', '', 0xc8c8a8],
  ['antimony', 'Antimony', 'Sb', 904, 'S', 'B', '', 0xa8aab8, { hazards: ['toxic'] }],
  ['lead_antimony', 'Lead-Antimony', 'Pb₄Sb', 600, 'S', 'B', '', 0x6a6880, { hazards: ['toxic'] }],
  ['solder', 'Solder', 'Sn₆₃Pb₃₇', 456, 'S', 'B W', '', 0xa8a8b0],
  ['cupronickel', 'Cupronickel', 'CuNi', 1500, 'S', 'B W F', '', 0xc49a6c],
  ['silicon', 'Silicon', 'Si', 1687, 'LV', 'B', 'boule wafer', 0x4a4e5c],
  ['graphite', 'Graphite', 'C', 0, 'LV', 'D', 'rod electrode', 0x404048],
  ['magnesium', 'Magnesium', 'Mg', 923, 'LV', 'B', '', 0xe0d8e0, { hazards: ['flammable'] }],
  ['aluminium', 'Aluminium', 'Al', 933, 'LV', 'B G S R X PF PI W F', '', 0xb0c4d8],
  ['gallium', 'Gallium', 'Ga', 303, 'LV', 'B', '', 0xc8d0e0],
  ['cadmium', 'Cadmium', 'Cd', 594, 'LV', 'B', '', 0x9090a8, { hazards: ['toxic'] }],
  ['cobalt', 'Cobalt', 'Co', 1768, 'LV', 'B', '', 0x4060c0],
  ['manganese', 'Manganese', 'Mn', 1519, 'LV', 'B', '', 0xc0b0b0],
  ['vanadium', 'Vanadium', 'V', 2183, 'LV', 'B', '', 0x5c6c74],
  ['selenium', 'Selenium', 'Se', 494, 'LV', 'D', 'ingot', 0x8c3030, { hazards: ['toxic'] }],
  ['phosphorus', 'Phosphorus', 'P', 317, 'LV', 'D', '', 0xd84830, { hazards: ['flammable', 'toxic'], noSmelt: true }],
  ['calcium', 'Calcium', 'Ca', 1115, 'LV', 'D', '', 0xe8e0d0],
  ['potassium', 'Potassium', 'K', 337, 'LV', 'D', '', 0xd8d8f0, { hazards: ['flammable'] }],
  ['sodium', 'Sodium', 'Na', 371, 'LV', 'D', '', 0xe8e8f8, { hazards: ['flammable'] }],
  ['lithium', 'Lithium', 'Li', 454, 'MV', 'B', '', 0xd0d8e0, { hazards: ['flammable'] }],
  ['vanadium_steel', 'Vanadium Steel', 'Fe+V+C', 1700, 'LV', 'B G T', '', 0x5a6670, { toolLevel: 3, durability: 900 }],
  ['chromium', 'Chromium', 'Cr', 2180, 'MV', 'B', '', 0xe0c8d8],
  ['kanthal', 'Kanthal', 'FeCrAl', 1800, 'MV', 'B W', '', 0xb8a888],
  ['chrome_vanadium_steel', 'Chrome-Vanadium Steel', 'Fe+Cr+V', 1700, 'MV', 'B G T', '', 0x8090a0, { toolLevel: 4, durability: 1500 }],
  ['nichrome', 'Nichrome', 'Ni₄Cr', 1673, 'HV', 'B W', '', 0xd0c0c8],
  ['stainless_steel', 'Stainless Steel', 'Fe₆CrMnNi', 1700, 'HV', 'B G S R X PF PI T', '', 0xc8d0d8, { toolLevel: 4, durability: 1300 }],
  ['polyethylene', 'Polyethylene', '(C₂H₄)ₙ', 0, 'HV', '', 'sheet foil plate', 0xf0f0e8],
  ['epoxy', 'Epoxy', '', 0, 'HV', '', 'resin sheet', 0xc8a040],
  ['tungsten_carbide', 'Tungsten Carbide', 'WC', 3058, 'HV', 'B T', '', 0x303848, { toolLevel: 5, durability: 2500, noSmelt: true }],
  ['titanium', 'Titanium', 'Ti', 1941, 'EHV', 'B G S R X PF PI W F T', '', 0xc8a8d8, { toolLevel: 5, durability: 2000 }],
  ['tungsten', 'Tungsten', 'W', 3695, 'EHV', 'B W', '', 0x383840],
  ['tungsten_steel', 'Tungsten Steel', 'Fe+W', 3000, 'EHV', 'B X PF', '', 0x40506c],
  ['platinum', 'Platinum', 'Pt', 2041, 'EHV', 'B W F', '', 0xe8e8d0],
  ['arsenic', 'Arsenic', 'As', 887, 'LV', 'D', '', 0x707070, { hazards: ['toxic'], noSmelt: true }],
];

export const MATERIALS: MaterialDef[] = ROWS.map(([id, name, formula, meltK, tier, flags, extra, color, x]) => ({
  id, name, tier, color,
  formula: formula || undefined,
  meltK: meltK || undefined,
  flags: flags.split(' ').filter(Boolean) as Flag[],
  extra: extra.split(' ').filter(Boolean),
  ...x,
}));
