// CONTENT §11b veins. Components: mineral id, or `mat:<material>` for loose material (e.g. clay).
export const BIOMES = ['plains', 'forest', 'swamp', 'desert', 'tundra', 'jungle', 'ocean'] as const;
export type Biome = (typeof BIOMES)[number];
/** Placement hints beyond biome. */
export type Bias = Biome | 'river' | 'ocean_edge' | 'volcanic' | 'any';
export type Rarity = 'C' | 'U' | 'R' | 'VR';
export const RARITY_SIZE: Record<Rarity, [number, number]> = { C: [4000, 8000], U: [3000, 6000], R: [2000, 4000], VR: [1000, 3000] };

export interface VeinDef {
  id: string;
  name: string;
  parts: { ref: string; weight: number }[];
  depth: [number, number];
  bias: Bias[];
  rarity: Rarity;
  /** Size multiplier (e.g. "C (big)"). */
  sizeMul?: number;
  /** Core pokes up to the surface (layer 0) — visible without digging (DESIGN §3 discovery). */
  outcrop?: boolean;
}

type Row = [id: string, name: string, parts: string, d0: number, d1: number, bias: string, rarity: Rarity, sizeMul?: number];
const ROWS: Row[] = [
  ['bog_iron', 'Bog Iron', 'limonite:70 pyrolusite:15 mat:clay:15', 1, 2, 'swamp', 'C'],
  ['placer_gravel', 'Placer Gravel', 'cassiterite:35 magnetite:30 native_gold:15 quartz:20', 1, 2, 'river', 'C'],
  ['copper_outcrop', 'Copper Outcrop', 'native_copper:40 malachite:40 chalcopyrite:20', 3, 6, 'forest plains', 'C'],
  ['tin_greisen', 'Tin Greisen', 'cassiterite:60 quartz:30 wolframite:10', 3, 8, 'tundra plains', 'U'],
  ['coal_seam', 'Coal Seam', 'coal:80 pyrite:20', 3, 8, 'forest swamp', 'C'],
  ['limestone', 'Limestone', 'calcite:70 dolomite:30', 3, 6, 'plains ocean_edge', 'C'],
  ['evaporite', 'Evaporite', 'rock_salt:60 sylvite:25 calcite:15', 1, 4, 'desert', 'C'],
  ['banded_iron', 'Banded Iron', 'hematite:50 magnetite:35 quartz:15', 4, 10, 'any', 'C'],
  ['copper_sulfide', 'Copper Sulfide', 'chalcopyrite:50 pyrite:30 sphalerite:20', 6, 12, 'any', 'U'],
  ['galena', 'Galena', 'galena:50 sphalerite:30 stibnite:20', 6, 12, 'desert plains', 'U'],
  ['manganese', 'Manganese', 'pyrolusite:60 hematite:40', 4, 10, 'desert jungle', 'U'],
  ['fluorite', 'Fluorite', 'fluorite:50 calcite:30 galena:20', 6, 12, 'plains tundra', 'U'],
  ['cinnabar', 'Cinnabar', 'cinnabar:60 stibnite:25 pyrite:15', 6, 10, 'volcanic desert', 'R'],
  ['apatite', 'Apatite', 'apatite:70 calcite:30', 4, 10, 'jungle forest', 'U'],
  ['bauxite_laterite', 'Bauxite Laterite', 'bauxite:70 limonite:20 ilmenite:10', 1, 6, 'jungle', 'U'],
  ['nickel_sulfide', 'Nickel Sulfide', 'pentlandite:50 chalcopyrite:30 pyrite:20', 9, 14, 'tundra', 'U'],
  ['graphite', 'Graphite', 'graphite:70 quartz:30', 8, 14, 'forest tundra', 'U'],
  ['cobalt_arsenide', 'Cobalt Arsenide', 'cobaltite:50 pentlandite:30 native_copper:20', 10, 16, 'tundra', 'R'],
  ['pegmatite', 'Pegmatite', 'quartz:40 spodumene:35 cassiterite:25', 8, 14, 'desert tundra', 'R'],
  ['chromite', 'Chromite', 'chromite:60 magnetite:25 pentlandite:15', 10, 16, 'ocean_edge plains', 'U'],
  ['heavy_mineral', 'Heavy Mineral', 'ilmenite:50 rutile:30 magnetite:20', 9, 14, 'ocean_edge desert', 'U'],
  ['tungsten_skarn', 'Tungsten Skarn', 'scheelite:50 wolframite:35 calcite:15', 12, 18, 'any', 'R'],
  ['deep_banded_iron', 'Deep Banded Iron', 'magnetite:60 hematite:40', 9, 16, 'any', 'C', 2],
  ['uranium', 'Uranium', 'uraninite:60 galena:40', 17, 22, 'any', 'VR'],
  ['platinum_reef', 'Platinum Reef', 'sperrylite:40 pentlandite:40 chromite:20', 18, 24, 'any', 'VR'],
];

const OUTCROPS = new Set(['copper_outcrop']);

export const VEINS: VeinDef[] = ROWS.map(([id, name, parts, d0, d1, bias, rarity, sizeMul]) => ({
  id, name, depth: [d0, d1], rarity, sizeMul, outcrop: OUTCROPS.has(id) || undefined,
  bias: bias.split(' ') as Bias[],
  parts: parts.split(' ').map((p) => {
    const i = p.lastIndexOf(':');
    return { ref: p.slice(0, i), weight: Number(p.slice(i + 1)) };
  }),
}));
