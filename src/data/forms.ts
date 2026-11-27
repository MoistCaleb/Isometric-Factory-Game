// CONTENT §11a form groups. units: material amount relative to 1 ingot.
export type Flag = 'B' | 'G' | 'W' | 'F' | 'S' | 'R' | 'X' | 'PF' | 'PI' | 'T' | 'D';

export interface FormDef { id: string; name: string; units: number }

const f = (id: string, name: string, units: number): FormDef => ({ id, name, units });

export const FORMS: Record<string, FormDef> = Object.fromEntries(
  [
    f('dust', 'Dust', 1), f('small_dust', 'Small Pile of Dust', 0.25),
    f('nugget', 'Nugget', 1 / 9), f('ingot', 'Ingot', 1), f('hot_ingot', 'Hot Ingot', 1),
    f('plate', 'Plate', 1), f('double_plate', 'Double Plate', 2),
    f('rod', 'Rod', 0.5), f('bolt', 'Bolt', 0.125), f('screw', 'Screw', 0.125), f('ring', 'Ring', 0.25),
    f('gear', 'Gear', 4), f('small_gear', 'Small Gear', 1),
    f('wire', 'Wire', 0.5), f('fine_wire', 'Fine Wire', 0.125), f('cable', 'Cable', 0.5),
    f('foil', 'Foil', 0.25), f('spring', 'Spring', 1), f('rotor', 'Rotor', 4.25), f('frame', 'Frame', 2),
    f('pipe_small', 'Small Fluid Pipe', 1), f('pipe', 'Fluid Pipe', 3), f('pipe_large', 'Large Fluid Pipe', 6),
    f('item_pipe', 'Item Pipe', 3),
    f('head_pickaxe', 'Pickaxe Head', 3), f('head_shovel', 'Shovel Head', 1), f('head_axe', 'Axe Head', 3),
    f('head_hammer', 'Hammer Head', 6), f('head_file', 'File Head', 2), f('head_saw', 'Saw Blade', 2),
    f('head_knife', 'Knife Blade', 1), f('head_drill', 'Drill Head', 4),
  ].map((d) => [d.id, d]),
);

export const FLAG_FORMS: Record<Flag, string[]> = {
  B: ['dust', 'small_dust', 'nugget', 'ingot', 'plate', 'double_plate', 'rod', 'bolt', 'screw', 'ring'],
  G: ['gear', 'small_gear'],
  W: ['wire', 'fine_wire', 'cable'],
  F: ['foil'],
  S: ['spring'],
  R: ['rotor'],
  X: ['frame'],
  PF: ['pipe_small', 'pipe', 'pipe_large'],
  PI: ['item_pipe'],
  T: ['head_pickaxe', 'head_shovel', 'head_axe', 'head_hammer', 'head_file', 'head_saw', 'head_knife', 'head_drill'],
  D: ['dust', 'small_dust'],
};

/** Hand tool types (tool slots). Tools of a material are generated from T-flag heads. */
export const TOOL_TYPES = [
  'pickaxe', 'shovel', 'axe', 'hammer', 'file', 'saw', 'knife', 'wrench', 'wire_cutter', 'screwdriver', 'mortar', 'treetap', 'prospector', 'magnet', 'soldering_iron',
] as const;
export type ToolType = (typeof TOOL_TYPES)[number];
