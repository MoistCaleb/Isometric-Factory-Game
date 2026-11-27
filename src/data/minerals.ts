// CONTENT §11b minerals. Refs: material id, chemical id, mineral id (`m:`), or `later:<name>`.
export interface MineralDef {
  id: string;
  name: string;
  formula: string;
  hardness: number;
  /** Main product ref. */
  product: string;
  /** Wash / thermal / centrifuge byproduct refs. */
  byproducts: [string, string, string];
  /** Mineral dust can be smelted directly (oxide/native/carbonate). Others need chemistry (§11e). */
  smelt?: boolean;
  color: number;
  /** Hand mining may drop this special item. */
  handDrop?: string;
}

type Row = [id: string, name: string, formula: string, h: number, product: string, bp: string, color: number, x?: Partial<MineralDef>];
const ROWS: Row[] = [
  ['native_copper', 'Native Copper', 'Cu', 0, 'copper', 'silver gold copper', 0xd87a3c, { smelt: true }],
  ['malachite', 'Malachite', 'Cu₂CO₃(OH)₂', 0, 'copper', 'copper m:calcite iron', 0x2e9a5c, { smelt: true }],
  ['cassiterite', 'Cassiterite', 'SnO₂', 0, 'tin', 'iron tin tungsten', 0x5a4030, { smelt: true }],
  ['limonite', 'Limonite', 'FeO(OH)', 0, 'iron', 'manganese phosphorus iron', 0xa0602a],
  ['native_gold', 'Native Gold', 'Au', 0, 'gold', 'silver copper gold', 0xf2c838, { smelt: true }],
  ['coal', 'Coal', 'C', 0, 'coal', 'sulfur ash coal', 0x1e1e1e],
  ['calcite', 'Calcite', 'CaCO₃', 0, 'quicklime', 'magnesium m:calcite iron', 0xeae0c8],
  ['dolomite', 'Dolomite', 'CaMg(CO₃)₂', 0, 'magnesium', 'm:calcite magnesium iron', 0xd8c8c0],
  ['rock_salt', 'Rock Salt', 'NaCl', 0, 'salt', 'm:sylvite salt calcium', 0xe8d8d8],
  ['sylvite', 'Sylvite', 'KCl', 0, 'potassium', 'salt potassium magnesium', 0xe8b0a0],
  ['magnetite', 'Magnetite', 'Fe₃O₄', 1, 'iron', 'vanadium gold iron', 0x303034, { handDrop: 'lodestone' }],
  ['hematite', 'Hematite', 'Fe₂O₃', 1, 'iron', 'manganese sand iron', 0x8a3028],
  ['pyrite', 'Pyrite', 'FeS₂', 1, 'iron', 'sulfur gold copper', 0xd8c050],
  ['chalcopyrite', 'Chalcopyrite', 'CuFeS₂', 1, 'copper', 'm:pyrite cobalt selenium', 0xc8a030],
  ['galena', 'Galena', 'PbS', 1, 'lead', 'silver sulfur antimony', 0x606878],
  ['sphalerite', 'Sphalerite', 'ZnS', 1, 'zinc', 'gallium cadmium sulfur', 0x8a7040],
  ['stibnite', 'Stibnite', 'Sb₂S₃', 1, 'antimony', 'sulfur lead antimony', 0x707884],
  ['pyrolusite', 'Pyrolusite', 'MnO₂', 1, 'manganese', 'iron manganese cobalt', 0x403838],
  ['quartz', 'Quartz', 'SiO₂', 1, 'silicon', 'sand m:quartz gold', 0xe8e0e8],
  ['fluorite', 'Fluorite', 'CaF₂', 1, 'hydrofluoric_acid', 'm:calcite m:fluorite lead', 0x9070c0],
  ['bauxite', 'Bauxite', 'Al(OH)₃', 1, 'aluminium', 'gallium m:rutile iron', 0xc07048],
  ['cinnabar', 'Cinnabar', 'HgS', 1, 'mercury', 'sulfur mercury antimony', 0xb02020],
  // "Fluorine" byproduct represented as fluorite dust (CaF₂).
  ['apatite', 'Apatite', 'Ca₅(PO₄)₃F', 1, 'phosphorus', 'calcium m:fluorite phosphorus', 0x40a0b0],
  ['pentlandite', 'Pentlandite', '(Fe,Ni)₉S₈', 2, 'nickel', 'iron cobalt platinum', 0xb0a060],
  ['cobaltite', 'Cobaltite', 'CoAsS', 2, 'cobalt', 'arsenic nickel sulfur', 0x8088a8],
  // "Carbon" byproduct represented as graphite.
  ['graphite', 'Graphite', 'C', 2, 'graphite', 'graphite m:quartz graphite', 0x404048],
  ['chromite', 'Chromite', 'FeCr₂O₄', 3, 'chromium', 'iron magnesium chromium', 0x302828],
  ['ilmenite', 'Ilmenite', 'FeTiO₃', 3, 'titanium', 'iron m:rutile manganese', 0x383030],
  ['rutile', 'Rutile', 'TiO₂', 3, 'titanium', 'iron titanium vanadium', 0x8a3820],
  ['spodumene', 'Spodumene', 'LiAlSi₂O₆', 3, 'lithium', 'aluminium silicon lithium', 0xd8c0c8],
  ['wolframite', 'Wolframite', '(Fe,Mn)WO₄', 4, 'tungsten', 'iron manganese tin', 0x282420],
  ['scheelite', 'Scheelite', 'CaWO₄', 4, 'tungsten', 'calcium tungsten later:molybdenum', 0xe0c890],
  ['sperrylite', 'Sperrylite', 'PtAs₂', 5, 'platinum', 'arsenic nickel platinum', 0xb0b0b8],
  ['uraninite', 'Uraninite', 'UO₂', 5, 'later:uranium', 'lead later:radium later:thorium', 0x303828],
];

export const MINERALS: MineralDef[] = ROWS.map(([id, name, formula, hardness, product, bp, color, x]) => ({
  id, name, formula, hardness, product, color,
  byproducts: bp.split(' ') as [string, string, string],
  ...x,
}));
