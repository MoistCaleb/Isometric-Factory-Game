// Generates items, fluids and templated recipes from data (DESIGN §1).
import { CHEMICALS } from '../data/chemicals';
import { FLAG_FORMS, FORMS, type ToolType } from '../data/forms';
import { BATT, BATT_FULL, BATTERIES, ETOOL_J, SCAN_J, CELL_FLUIDS, CELL_L, MACHINES } from '../data/machines';
import { MATERIALS, type MaterialDef } from '../data/materials';
import { MINERALS, type MineralDef } from '../data/minerals';
import { MISC_ITEMS } from '../data/misc';
import { STRUCTURES } from '../data/structures';
import { TIER_NAME, type TierId } from '../data/tiers';
import { CRATE_TIERS, crateId } from '../data/loot';
import type { FluidDef, ItemDef, Recipe, Stack } from './types';

export const INGOT_L = 144;
const HOT_INGOT_K = 2200;

const cap = (s: string) => s.replace(/(^|_)(\w)/g, (_, p, c) => (p ? ' ' : '') + c.toUpperCase());
const s = (id: string, n = 1, chance?: number): Stack => (chance === undefined ? { id, n } : { id, n, chance });

/** Names for extra forms: `brick:brick` → Brick, `unfired_mold_ingot:clay` → Unfired Ingot Mold, else `<Material> <Form>`. */
function extraName(mat: string, id: string, x: string): string {
  const raw = x.replace(/^unfired_/, ''), pre = raw !== x ? 'Unfired ' : '';
  if (raw === id) return pre + mat;
  if (raw.startsWith('mold_')) return `${pre}${cap(raw.slice(5))} Mold`;
  return `${pre}${mat} ${cap(raw)}`;
}

export interface Generated { items: ItemDef[]; fluids: FluidDef[]; recipes: Recipe[] }

export function generate(): Generated {
  const items: ItemDef[] = [];
  const fluids: FluidDef[] = [];
  const recipes: Recipe[] = [];
  const itemIds = new Set<string>();

  const addItem = (d: ItemDef) => { items.push(d); itemIds.add(d.id); };
  let seq = 0;
  const add = (r: Omit<Recipe, 'id' | 'ticks' | 'power'> & { ticks?: number; power?: number }) => {
    const out = r.outputs[0]?.id ?? r.fluidsOut?.[0]?.id ?? 'x';
    recipes.push({ ticks: r.machine === 'hand' ? 0 : 100, power: 0, ...r, id: `${r.machine}/${out}#${seq++}` });
  };
  const hand = (inputs: Stack[], outputs: Stack[], tools?: ToolType[]) => add({ machine: 'hand', tier: 'P', inputs, outputs, tools });
  const machineTier = Object.fromEntries(MACHINES.map((m) => [m.id, m.tier])) as Record<string, TierId>;
  const mach = (machine: string, inputs: Stack[], outputs: Stack[], x: Partial<Recipe> = {}) =>
    add({ machine, tier: machineTier[machine], inputs, outputs, ticks: 100, power: machineTier[machine] === 'LV' ? 16 : 0, ...x });

  // ---- material items ----
  const has = (m: MaterialDef, form: string) => itemIds.has(`${form}:${m.id}`);
  for (const m of MATERIALS) {
    const forms = new Set<string>();
    for (const fl of m.flags) for (const f of FLAG_FORMS[fl]) forms.add(f);
    if (m.flags.includes('T') && !m.flags.includes('B')) {
      // Knapped/non-metal tools: only basic heads.
      for (const f of FLAG_FORMS.T) if (!['head_pickaxe', 'head_shovel', 'head_axe', 'head_knife'].includes(f)) forms.delete(f);
    }
    if (m.flags.includes('B') && m.meltK && m.meltK > HOT_INGOT_K && !m.noSmelt) forms.add('hot_ingot');
    for (const f of forms) {
      addItem({ id: `${f}:${m.id}`, name: `${m.name} ${FORMS[f].name}`, kind: 'material', color: m.color, material: m.id, form: f, hazards: m.hazards });
    }
    for (const x of m.extra) {
      addItem({ id: `${x}:${m.id}`, name: extraName(m.name, m.id, x), kind: 'material', color: m.color, material: m.id, form: x, hazards: m.hazards });
    }
    if (m.flags.includes('B') && m.meltK && !m.noSmelt) {
      fluids.push({ id: `molten:${m.id}`, name: `Molten ${m.name}`, color: m.color, phase: 'liquid', hazards: m.hazards ?? [], tempK: m.meltK });
    }
  }
  for (const c of CHEMICALS) fluids.push({ id: c.id, name: c.name, color: c.color, phase: c.phase, hazards: c.hazards });
  for (const mi of MISC_ITEMS) addItem({ ...mi, kind: 'misc' });
  for (const t of CRATE_TIERS) addItem({ id: crateId(t), name: `${TIER_NAME[t]} Loot Crate`, kind: 'misc', color: 0x9a6a30 });

  // ---- material templates ----
  for (const m of MATERIALS) {
    const id = (f: string) => `${f}:${m.id}`;
    const B = m.flags.includes('B');

    if (has(m, 'dust') && has(m, 'small_dust')) {
      hand([s(id('small_dust'), 4)], [s(id('dust'))]);
      hand([s(id('dust'))], [s(id('small_dust'), 4)]);
    }
    if (!B) continue;

    hand([s(id('nugget'), 9)], [s(id('ingot'))]);
    hand([s(id('ingot'))], [s(id('nugget'), 9)]);
    // Grinding: mortar is wasteful (§1 painful early).
    hand([s(id('ingot'))], [s(id('small_dust'), 2)], ['mortar']);
    mach('steam_macerator', [s(id('ingot'))], [s(id('dust'))], { power: 4 });
    mach('macerator', [s(id('ingot'))], [s(id('dust'))]);

    // Smelting dust → ingot by melting point (§11a heat ladder).
    if (m.meltK && !m.noSmelt) {
      if (m.meltK <= 1400) {
        mach('clay_furnace', [s(id('dust'))], [s(id('ingot'))], { ticks: 400, minHeatK: m.meltK });
        mach('steam_furnace', [s(id('dust'))], [s(id('ingot'))], { power: 4 });
      }
      if (m.meltK <= 1750) mach('electric_furnace', [s(id('dust'))], [s(id('ingot'))], { ticks: 80 });
      else {
        const hot = m.meltK > HOT_INGOT_K;
        mach('ebf', [s(id('dust'))], [s(id(hot ? 'hot_ingot' : 'ingot'))], { minHeatK: m.meltK, ticks: Math.round(m.meltK / 4), power: 120 });
        if (hot) mach('vacuum_freezer', [s(id('hot_ingot'))], [s(id('ingot'))], { power: 120, tier: 'HV' });
      }
      // Molten + casting.
      const molten = `molten:${m.id}`;
      mach('fluid_extractor', [s(id('ingot'))], [], { fluidsOut: [s(molten, INGOT_L)] });
      mach('fluid_solidifier', [], [s(id('ingot'))], { fluidsIn: [s(molten, INGOT_L)], keep: ['mold_ingot:clay'] });
      mach('fluid_solidifier', [], [s(id('plate'))], { fluidsIn: [s(molten, INGOT_L)], keep: ['mold_plate:clay'] });
      if (m.meltK <= 1400) {
        const minHeatK = m.meltK;
        mach('crucible', [s(id('ingot'))], [], { fluidsOut: [s(molten, INGOT_L)], ticks: 200, minHeatK });
        mach('crucible', [], [s(id('ingot'))], { fluidsIn: [s(molten, INGOT_L)], keep: ['mold_ingot:clay'], ticks: 100, minHeatK });
        mach('crucible', [], [s(id('plate'))], { fluidsIn: [s(molten, INGOT_L)], keep: ['mold_plate:clay'], ticks: 100, minHeatK });
      }
    }

    // Plates: hand 2→1 (painful), forge hammer 3→2, bender 1→1.
    hand([s(id('ingot'), 2)], [s(id('plate'))], ['hammer']);
    mach('steam_forge_hammer', [s(id('ingot'), 3)], [s(id('plate'), 2)], { power: 4 });
    mach('bender', [s(id('ingot'))], [s(id('plate'))], { circuit: 1 });
    hand([s(id('plate'), 3)], [s(id('double_plate'))], ['hammer']);
    mach('steam_compressor', [s(id('plate'), 2)], [s(id('double_plate'))], { power: 4 });
    mach('bender', [s(id('plate'), 2)], [s(id('double_plate'))], { circuit: 2 });
    // Rods, bolts, screws, rings.
    hand([s(id('plate'))], [s(id('rod'))], ['file']);
    mach('lathe', [s(id('ingot'))], [s(id('rod'), 2)]);
    hand([s(id('rod'))], [s(id('bolt'), 2)], ['saw']);
    mach('cutter', [s(id('rod'))], [s(id('bolt'), 4)]);
    hand([s(id('bolt'))], [s(id('screw'))], ['file']);
    mach('lathe', [s(id('bolt'))], [s(id('screw'))]);
    hand([s(id('rod'))], [s(id('ring'))], ['hammer']);
    mach('lathe', [s(id('rod'))], [s(id('ring'), 2)]);

    if (has(m, 'gear')) {
      hand([s(id('plate'), 4), s(id('rod'))], [s(id('gear'))], ['hammer', 'file']);
      mach('assembler', [s(id('plate'), 4), s(id('rod'))], [s(id('gear'))]);
      hand([s(id('plate'), 2)], [s(id('small_gear'))], ['hammer', 'file']);
      mach('assembler', [s(id('plate'))], [s(id('small_gear'))]);
    }
    if (has(m, 'wire')) {
      hand([s(id('plate'))], [s(id('wire'))], ['wire_cutter']);
      mach('wiremill', [s(id('ingot'))], [s(id('wire'), 2)]);
      hand([s(id('wire'))], [s(id('fine_wire'), 2)], ['wire_cutter']);
      mach('wiremill', [s(id('wire'))], [s(id('fine_wire'), 4)]);
      hand([s(id('wire')), s('sheet:rubber')], [s(id('cable'))]);
      mach('assembler', [s(id('wire')), s('sheet:rubber')], [s(id('cable'))]);
    }
    if (has(m, 'foil')) {
      hand([s(id('plate'))], [s(id('foil'), 2)], ['hammer']);
      mach('bender', [s(id('plate'))], [s(id('foil'), 4)], { circuit: 1 });
    }
    if (has(m, 'spring')) {
      hand([s(id('rod'), 2)], [s(id('spring'))], ['hammer']);
      mach('bender', [s(id('rod'), 2)], [s(id('spring'))]);
    }
    if (has(m, 'rotor')) {
      hand([s(id('plate'), 4), s(id('ring'))], [s(id('rotor'))], ['hammer', 'file']);
      mach('assembler', [s(id('plate'), 4), s(id('ring'))], [s(id('rotor'))]);
    }
    if (has(m, 'frame')) {
      hand([s(id('rod'), 4)], [s(id('frame'))], ['wrench']);
      mach('assembler', [s(id('rod'), 4)], [s(id('frame'))], { circuit: 4 });
    }
    if (has(m, 'pipe')) {
      hand([s(id('plate'))], [s(id('pipe_small'))], ['hammer', 'wrench']);
      hand([s(id('plate'), 3)], [s(id('pipe'))], ['hammer', 'wrench']);
      hand([s(id('plate'), 6)], [s(id('pipe_large'))], ['hammer', 'wrench']);
    }
    if (has(m, 'item_pipe')) hand([s(id('plate'), 3), s(id('ring'))], [s(id('item_pipe'))], ['hammer', 'wrench']);
  }

  // ---- tools (T flag) ----
  const TOOL_HEADS: [ToolType, string][] = [
    ['pickaxe', 'head_pickaxe'], ['shovel', 'head_shovel'], ['axe', 'head_axe'], ['hammer', 'head_hammer'],
    ['file', 'head_file'], ['saw', 'head_saw'], ['knife', 'head_knife'],
  ];
  const addTool = (type: ToolType, mat: string, name: string, color: number, level: number, durability: number) =>
    addItem({ id: `tool:${type}:${mat}`, name, kind: 'tool', color, material: mat, tool: { type, level, durability } });

  for (const m of MATERIALS.filter((x) => x.flags.includes('T'))) {
    const level = m.toolLevel ?? 0;
    const dur = m.durability ?? 50;
    const B = m.flags.includes('B');
    for (const [type, head] of TOOL_HEADS) {
      const headId = `${head}:${m.id}`;
      if (!itemIds.has(headId)) continue;
      addTool(type, m.id, `${m.name} ${cap(type)}`, m.color, level, dur);
      const units = FORMS[head].units;
      if (B) {
        hand([s(`plate:${m.id}`, Math.ceil(units))], [s(headId)], ['hammer', 'file']);
        if (m.meltK && m.meltK <= 1400) {
          mach('crucible', [], [s(headId)], { fluidsIn: [s(`molten:${m.id}`, INGOT_L * units)], keep: ['mold_head:clay'], circuit: TOOL_HEADS.findIndex((t) => t[0] === type) + 1, minHeatK: m.meltK });
        }
      } else {
        hand([s(`shard:${m.id}`, Math.max(1, Math.ceil(units)))], [s(headId)]); // knapping
      }
      const binder = B ? [] : type === 'knife' ? [] : [s('fiber')];
      hand([s(headId), s('stick:wood'), ...binder], [s(`tool:${type}:${m.id}`)]);
    }
    if (B) {
      addTool('wrench', m.id, `${m.name} Wrench`, m.color, level, dur);
      hand([s(`plate:${m.id}`, 4)], [s(`tool:wrench:${m.id}`)], ['hammer']);
      if (level >= 2) {
        addTool('wire_cutter', m.id, `${m.name} Wire Cutter`, m.color, level, dur);
        hand([s(`plate:${m.id}`, 2), s(`screw:${m.id}`)], [s(`tool:wire_cutter:${m.id}`)], ['hammer', 'file', 'screwdriver']);
        addTool('screwdriver', m.id, `${m.name} Screwdriver`, m.color, level, dur);
        hand([s(`rod:${m.id}`), s('stick:wood')], [s(`tool:screwdriver:${m.id}`)], ['file']);
      }
      hand([s(`plate:${m.id}`, 4)], [s(`head_drill:${m.id}`)], ['hammer', 'file', 'saw']);
    }
  }
  // Primitive one-offs (§11c tools).
  addTool('hammer', 'stone', 'Stone Hammer', 0x8a8a8a, 0, 30);
  hand([s('cobble:stone'), s('stick:wood'), s('fiber')], [s('tool:hammer:stone')]);
  // Prospector's hammer (CONTENT §11c): surveys veins near the tap, down to stone depth.
  addTool('prospector', 'bronze', "Prospector's Hammer", 0xc98b3a, 1, 64);
  hand([s('head_hammer:bronze'), s('plate:bronze'), s('stick:wood')], [s('tool:prospector:bronze')], ['file']);
  addTool('mortar', 'stone', 'Mortar', 0x8a8a8a, 0, 60);
  hand([s('cobble:stone'), s('shard:flint')], [s('tool:mortar:stone')]);
  addTool('treetap', 'wood', 'Treetap', 0x8b6a3e, 0, 100);
  // P4a: lodestone magnet (magnetises iron rods until the Polarizer), soldering iron (basic circuits by hand).
  addTool('magnet', 'lodestone', 'Lodestone Magnet', 0x303034, 0, 32);
  hand([s('lodestone')], [s('tool:magnet:lodestone')], ['file']);
  addTool('soldering_iron', 'copper', 'Soldering Iron', 0xd87a3c, 0, 64);
  hand([s('rod:copper'), s('rod:iron'), s('stick:wood')], [s('tool:soldering_iron:copper')], ['file']);
  hand([s('plank:wood'), s('stick:wood')], [s('tool:treetap:wood')]);
  // Wood (§11c hand recipes).
  hand([s('log:wood')], [s('plank:wood', 2)]);
  hand([s('log:wood')], [s('plank:wood', 4)], ['saw']);
  hand([s('plank:wood')], [s('stick:wood', 2)]);
  hand([s('plank:wood')], [s('stick:wood', 4)], ['saw']);

  primitive(hand, mach);
  steam(hand, mach);
  lv(hand, mach);
  chem({ addItem, hand, mach, itemIds });
  grid({ addItem, hand, mach, itemIds });
  aluminium(hand, mach);
  mvParts({ addItem, hand, mach, itemIds });
  organic({ addItem, hand, mach, itemIds });

  // ---- ore processing (§4 yield ladder) ----
  for (const mn of MINERALS) generateOre(mn, { addItem, hand, mach, itemIds });

  // Placeable structures (P2c).
  for (const st of STRUCTURES) {
    addItem({ id: `struct:${st.id}`, name: st.name, kind: 'structure', color: st.color });
    hand(st.cost.map(([id, n]) => s(id, n)), [s(`struct:${st.id}`)], st.tools);
  }
  return { items, fluids, recipes };
}

interface Ctx {
  addItem: (d: ItemDef) => void;
  hand: (i: Stack[], o: Stack[], t?: ToolType[]) => void;
  mach: (m: string, i: Stack[], o: Stack[], x?: Partial<Recipe>) => void;
  itemIds: Set<string>;
}

const MAT = new Map(MATERIALS.map((m) => [m.id, m]));
const CHEM = new Set(CHEMICALS.map((c) => c.id));
const MIN = new Map(MINERALS.map((m) => [m.id, m]));

/** A mineral whose dust *is* its product material (native metals, coal, salt, graphite). */
export const isPure = (mn: MineralDef) => MAT.has(mn.product) && mn.formula === (MAT.get(mn.product)!.formula ?? mn.formula) && !mn.smelt;

/** Mineral dust item id (pure minerals yield product dust directly). */
export const mineralDust = (mn: MineralDef, small = false) =>
  isPure(mn) ? `${small ? 'small_dust' : 'dust'}:${mn.product}` : `${small ? 'small_mdust' : 'mdust'}:${mn.id}`;

/** Resolve a byproduct ref to an output stack, or null for `later:`. */
export function byproductStack(ref: string): { item?: Stack; fluid?: Stack } | null {
  if (ref.startsWith('later:')) return null;
  if (ref.startsWith('m:')) return { item: s(mineralDust(MIN.get(ref.slice(2))!, true)) };
  if (MAT.has(ref)) return { item: s(`small_dust:${ref}`) };
  if (CHEM.has(ref)) return { fluid: s(ref, 100) };
  return { item: s(`?:${ref}`) }; // unresolved → validator error
}

function generateOre(mn: MineralDef, c: Ctx) {
  const o = (form: string) => `${form}:${mn.id}`;
  for (const [form, label] of [['ore', 'Ore'], ['crushed_ore', 'Crushed'], ['purified_ore', 'Purified'], ['refined_ore', 'Refined'], ['impure_mdust', 'Impure Dust']] as const) {
    c.addItem({ id: o(form), name: form === 'ore' ? `${mn.name} Ore` : `${label} ${mn.name}`, kind: 'ore', color: mn.color, mineral: mn.id, form });
  }
  if (!isPure(mn)) {
    c.addItem({ id: o('mdust'), name: `${mn.name} Dust`, kind: 'ore', color: mn.color, mineral: mn.id, form: 'mdust' });
    c.addItem({ id: o('small_mdust'), name: `Small Pile of ${mn.name} Dust`, kind: 'ore', color: mn.color, mineral: mn.id, form: 'small_mdust' });
    c.hand([s(o('small_mdust'), 4)], [s(o('mdust'))]);
  }
  const dust = mineralDust(mn);
  const bp = mn.byproducts.map(byproductStack);
  const bpItem = (i: number, chance?: number) => (bp[i]?.item ? [{ ...bp[i]!.item!, chance }] : []);
  const bpFluid = (i: number) => (bp[i]?.fluid ? { fluidsOut: [bp[i]!.fluid!] } : {});

  // Crushing: hand 1×, machines 2×.
  c.hand([s(o('ore'))], [s(o('crushed_ore'))], ['hammer']);
  c.mach('steam_macerator', [s(o('ore'))], [s(o('crushed_ore'), 2)], { power: 4 });
  c.mach('macerator', [s(o('ore'))], [s(o('crushed_ore'), 2)]);
  // Crushed → impure dust → dust.
  c.mach('quern', [s(o('crushed_ore'))], [s(o('impure_mdust'))], { ticks: 200 });
  c.mach('steam_macerator', [s(o('crushed_ore'))], [s(o('impure_mdust')), ...bpItem(0, 0.1)], { power: 4 });
  c.mach('macerator', [s(o('crushed_ore'))], [s(o('impure_mdust')), ...bpItem(0, 0.1)]);
  c.hand([s(o('impure_mdust'))], [s(dust)]); // sifting by hand (slow in-game; free in data)
  c.mach('steam_ore_washer', [s(o('impure_mdust'))], [s(dust)], { fluidsIn: [s('water', 100)], ticks: 40, power: 2 });
  c.mach('centrifuge', [s(o('impure_mdust'))], [s(dust), ...bpItem(0, 0.5)]);
  // Wash route.
  c.mach('sluice', [s(o('crushed_ore'))], [s(o('purified_ore'))], { fluidsIn: [s('water', 1000)], ticks: 200 });
  c.mach('steam_ore_washer', [s(o('crushed_ore'))], [s(o('purified_ore')), ...bpItem(0, 0.5)], { fluidsIn: [s('water', 1000)], power: 4 });
  c.mach('ore_washer', [s(o('crushed_ore'))], [s(o('purified_ore')), ...bpItem(0)], { fluidsIn: [s('water', 1000)] });
  c.mach('steam_macerator', [s(o('purified_ore'))], [s(dust), ...bpItem(1, 0.2)], { power: 4 });
  c.mach('macerator', [s(o('purified_ore'))], [s(dust), ...bpItem(1, 0.3)]);
  c.mach('thermal_centrifuge', [s(o('purified_ore'))], [s(o('refined_ore')), ...bpItem(1)], bpFluid(1));
  // P4b acid leaching: each acid frees a specific byproduct.
  c.mach('chemical_bath', [s(o('crushed_ore'))], [s(o('purified_ore')), ...bpItem(2, 0.7)], { fluidsIn: [s('sulfuric_acid', 100)] });
  c.mach('chemical_bath', [s(o('crushed_ore'))], [s(o('purified_ore')), ...bpItem(1, 0.7)], { fluidsIn: [s('hydrochloric_acid', 100)] });
  c.mach('macerator', [s(o('refined_ore'))], [s(dust), { ...s(mineralDust(mn, true)), chance: 0.6 }, ...bpItem(2, 0.5)]);

  // Direct smelting (1×) for smeltable minerals.
  const prod = MAT.get(mn.product);
  if (mn.smelt && prod?.flags.includes('B')) {
    const ingot = s(`ingot:${mn.product}`);
    if ((prod.meltK ?? 0) <= 1400) {
      c.mach('clay_furnace', [s(o('ore'))], [ingot], { ticks: 400, minHeatK: prod.meltK });
      c.mach('clay_furnace', [s(dust)], [ingot], { ticks: 400, minHeatK: prod.meltK });
    }
    c.mach('steam_furnace', [s(dust)], [ingot], { power: 4 });
    // Crushed / purified ore smelts too (1 ingot each: the 2× comes from crushing).
    if ((prod.meltK ?? 0) <= 1400) for (const f of ['ore', 'crushed_ore', 'purified_ore']) c.mach('steam_furnace', [s(o(f))], [ingot], { power: 4, ticks: 150 });
    c.mach('electric_furnace', [s(dust)], [ingot], { ticks: 80 });
  }
}

/** Primitive age (CONTENT §11c, P2d): clay → kiln, charcoal, bloomery iron, coke, steel, bronze alloying, lime, glass. */
function primitive(hand: Ctx['hand'], mach: Ctx['mach']) {
  // Clay shaping by hand, fired in the pit kiln.
  hand([s('ball:clay')], [s('unfired_brick:clay')]);
  hand([s('ball:clay', 5)], [s('unfired_crucible:clay')]);
  for (const m of ['ingot', 'plate', 'head']) {
    hand([s('ball:clay', 2)], [s(`unfired_mold_${m}:clay`)], ['knife']);
    mach('pit_kiln', [s(`unfired_mold_${m}:clay`)], [s(`mold_${m}:clay`)], { ticks: 400 });
  }
  mach('pit_kiln', [s('unfired_brick:clay')], [s('brick:brick')], { ticks: 300 });
  mach('pit_kiln', [s('unfired_crucible:clay')], [s('crucible:clay')], { ticks: 600 });
  // Fireclay = clay + grog (crushed brick); needs a charcoal fire to fire.
  hand([s('brick:brick')], [s('small_dust:brick', 2)], ['mortar']);
  mach('quern', [s('brick:brick')], [s('dust:brick')], { ticks: 100 });
  hand([s('ball:clay', 2), s('dust:brick')], [s('unfired_fire_brick:fireclay', 2)]);
  mach('pit_kiln', [s('unfired_fire_brick:fireclay')], [s('fire_brick:fireclay')], { ticks: 400, minHeatK: 1050 });
  mach('quern', [s('gravel:stone')], [s('dust:sand')], { ticks: 100 });
  mach('quern', [s('cobble:stone')], [s('gravel:stone')], { ticks: 100 });

  // Charcoal pile: logs smoulder under soil.
  mach('charcoal_pile', [s('log:wood', 8)], [s('lump:charcoal', 4), s('dust:ash', 1, 0.5)], { fluidsOut: [s('wood_tar', 200)], ticks: 2400 });
  // Coal by hand, coke oven.
  hand([s('ore:coal')], [s('lump:coal', 2)], ['hammer']);
  mach('coke_oven', [s('lump:coal')], [s('lump:coke')], { fluidsOut: [s('creosote', 250)], ticks: 900 });

  // Clay furnace extras: glass, vulcanised rubber.
  mach('clay_furnace', [s('dust:sand', 2), s('dust:ash')], [s('pane:glass')], { ticks: 400, minHeatK: 1300 });
  mach('clay_furnace', [s('sticky_resin', 3), s('small_dust:sulfur')], [s('sheet:rubber')], { ticks: 300, minHeatK: 420 });

  // Bronze: alloy in the crucible, then cast.
  mach('crucible', [s('ingot:copper', 3), s('ingot:tin')], [], { fluidsOut: [s('molten:bronze', INGOT_L * 4)], ticks: 400, minHeatK: 1358 });
  mach('crucible', [s('dust:copper', 3), s('dust:tin')], [], { fluidsOut: [s('molten:bronze', INGOT_L * 4)], ticks: 400, minHeatK: 1358 });

  // Lime kiln: calcite → quicklime (CO₂ vents).
  for (const f of ['crushed_ore', 'mdust']) mach('lime_kiln', [s(`${f}:calcite`)], [s('dust:quicklime')], { fluidsOut: [s('carbon_dioxide', 100)], ticks: 400 });

  // Bloomery iron → anvil → wrought iron → primitive blast furnace steel.
  for (const mn of ['hematite', 'magnetite', 'limonite']) for (const f of ['ore', 'crushed_ore']) {
    mach('bloomery', [s(`${f}:${mn}`, 2), s('lump:charcoal', 2)], [s('iron_bloom'), s('slag')], { ticks: 1200 });
  }
  mach('anvil', [s('iron_bloom')], [s('ingot:wrought_iron'), s('slag', 1, 0.5)], { ticks: 200, tools: ['hammer'] });
  mach('primitive_blast_furnace', [s('ingot:wrought_iron'), s('lump:coke', 2)], [s('ingot:steel'), s('slag')], { ticks: 2400 });
  mach('primitive_blast_furnace', [s('ingot:wrought_iron'), s('lump:coke'), s('dust:quicklime')], [s('ingot:steel'), s('slag')], { ticks: 1200 });
}

/** Steam age parts + machine recipes not covered by the material templates (CONTENT §11c, P3a). */
function steam(hand: Ctx['hand'], mach: Ctx['mach']) {
  hand([s('plate:bronze', 8), s('brick:brick', 4)], [s('hull:bronze')], ['hammer', 'wrench']);
  hand([s('plate:steel', 8), s('fire_brick:fireclay', 4)], [s('hull:steel')], ['hammer', 'wrench']);
  hand([s('plate:bronze'), s('rod:bronze'), s('small_gear:bronze')], [s('piston:bronze')], ['hammer']);
  hand([s('plate:steel', 3), s('ingot:steel')], [s('grinder_head:steel')], ['hammer', 'file']);
  // Alloy smelter: bronze straight to ingots (no crucible + mold).
  for (const f of ['ingot', 'dust']) mach('steam_alloy_smelter', [s(`${f}:copper`, 3), s(`${f}:tin`)], [s('ingot:bronze', 4)], { ticks: 200, power: 4 });
  mach('steam_alloy_smelter', [s('dust:sand', 2), s('dust:ash')], [s('pane:glass', 2)], { ticks: 200, power: 4 });
  // P3c rubber: extractor squeezes resin into raw rubber, the alloy smelter vulcanises it with sulfur (3× the clay furnace yield).
  mach('steam_extractor', [s('sticky_resin')], [s('raw:rubber')], { power: 2 });
  mach('steam_alloy_smelter', [s('raw:rubber', 2), s('small_dust:sulfur')], [s('sheet:rubber', 2)], { ticks: 200, power: 4 });
  // Compressor: dusts back into fuel lumps, rubber sheets into plates (double plates per material, see templates).
  for (const f of ['coal', 'charcoal', 'coke']) mach('steam_compressor', [s(`dust:${f}`)], [s(`lump:${f}`)], { power: 2 });
  mach('steam_compressor', [s('sheet:rubber', 2)], [s('plate:rubber')], { power: 2 });
}

/** LV (CONTENT §11c LV, §11d, P4a): alloys, parts, basic circuit chain. Machine/structure costs live in data/structures. */
function lv(hand: Ctx['hand'], mach: Ctx['mach']) {
  const P = { power: 4 }, W = ['wrench', 'screwdriver'] as ToolType[];
  // Alloys: solder (tin + lead), cupronickel; nickel from pentlandite by matte smelting.
  for (const f of ['ingot', 'dust']) {
    mach('steam_alloy_smelter', [s(`${f}:tin`, 2), s(`${f}:lead`)], [s('ingot:solder', 3)], { ticks: 200, ...P });
    mach('steam_alloy_smelter', [s(`${f}:copper`), s(`${f}:nickel`)], [s('ingot:cupronickel', 2)], { ticks: 200, ...P });
  }
  mach('electric_furnace', [s('mdust:pentlandite', 2)], [s('ingot:nickel'), s('slag')], { ticks: 200, power: 32 });
  mach('steam_alloy_smelter', [s('pane:glass')], [s('tube:glass', 2)], { ticks: 100, ...P });
  // Magnetisation: lodestone by hand, the Polarizer by power.
  hand([s('rod:iron')], [s('magnetic_rod:iron')], ['magnet']);
  mach('polarizer', [s('rod:iron')], [s('magnetic_rod:iron')], { ticks: 60, power: 8 });
  // Wood pulp → resin board (pressed with sticky resin).
  hand([s('log:wood')], [s('pulp:wood')], ['mortar']);
  mach('steam_macerator', [s('log:wood')], [s('pulp:wood', 4)], P);
  mach('macerator', [s('log:wood')], [s('pulp:wood', 6)]);
  mach('steam_compressor', [s('pulp:wood', 2), s('sticky_resin')], [s('board:resin')], P);
  // Basic circuit: board, tubes, resistors, solder; by hand with a soldering iron, cheaper in the assembler.
  hand([s('board:resin'), s('foil:copper', 2)], [s('circuit_board:basic')], ['knife']);
  hand([s('tube:glass'), s('fine_wire:copper', 2), s('bolt:steel')], [s('vacuum_tube')]);
  mach('assembler', [s('tube:glass'), s('fine_wire:copper', 2), s('bolt:steel')], [s('vacuum_tube', 2)]);
  hand([s('dust:coal'), s('fine_wire:copper', 2), s('sticky_resin')], [s('resistor:carbon', 2)]);
  mach('assembler', [s('dust:coal'), s('fine_wire:copper', 2), s('sticky_resin')], [s('resistor:carbon', 4)]);
  const circ = [s('circuit_board:basic'), s('vacuum_tube', 2), s('resistor:carbon', 2), s('wire:solder')];
  hand(circ, [s('circuit:basic')], ['soldering_iron']);
  mach('assembler', circ, [s('circuit:basic', 2)], { ticks: 200 });
  mach('assembler', [s('board:resin'), s('foil:copper', 2)], [s('circuit_board:basic')], { ticks: 100, power: 16 });
  // P4e: the EBF blows oxygen through iron dust → steel, on one energy hatch.
  mach('ebf', [s('dust:iron')], [s('ingot:steel')], { fluidsIn: [s('oxygen', 1000)], minHeatK: 1000, ticks: 300, power: 60 });
  // Parts.
  const part = (inputs: Stack[], out: string) => { hand(inputs, [s(out)], W); mach('assembler', inputs, [s(out)], { ticks: 200 }); };
  part([s('cable:tin', 2), s('fine_wire:copper', 4), s('rod:iron', 2), s('magnetic_rod:iron')], 'motor:lv');
  part([s('motor:lv'), s('rotor:steel'), s('ring:rubber', 2), s('pipe_small:bronze'), s('screw:steel')], 'pump:lv');
  part([s('motor:lv'), s('rod:steel', 2), s('gear:steel'), s('plate:steel', 2)], 'piston:lv');
  part([s('motor:lv', 2), s('plate:rubber', 6), s('cable:tin')], 'conveyor:lv');
  part([s('motor:lv', 2), s('piston:lv'), s('circuit:basic'), s('cable:tin', 2), s('rod:steel', 2)], 'robot_arm:lv');
  hand([s('plate:steel', 8), s('cable:tin', 2)], [s('hull:lv')], ['wrench']);
  // Rubber rings for pumps.
  hand([s('plate:rubber')], [s('ring:rubber', 2)], ['knife']);
}

/** Grid (P4c, CONTENT §11c): lead-antimony, the lead-acid battery (case canned with sulfuric acid). */
function grid(c: Ctx) {
  const { hand, mach } = c;
  for (const f of ['ingot', 'dust']) mach('steam_alloy_smelter', [s(`${f}:lead`, 4), s(`${f}:antimony`)], [s('ingot:lead_antimony', 5)], { ticks: 250, power: 4 });
  mach('mixer', [s('dust:lead', 4), s('dust:antimony')], [s('dust:lead_antimony', 5)], { ticks: 200, power: 8 });
  c.addItem({ id: 'battery_case:lead_acid', name: 'Lead-Acid Battery Case', kind: 'misc', color: 0x3a3a40 });
  c.addItem({ id: BATT, name: 'Lead-Acid Battery (empty)', kind: 'misc', color: 0x5c5a78, hazards: ['corrosive'] });
  c.addItem({ id: BATT_FULL, name: 'Lead-Acid Battery (charged)', kind: 'misc', color: 0x7a78a8, hazards: ['corrosive'] });
  hand([s('plate:lead_antimony', 2), s('sheet:rubber', 2), s('cable:tin')], [s('battery_case:lead_acid')], ['hammer', 'wire_cutter']);
  mach('assembler', [s('plate:lead_antimony', 2), s('sheet:rubber', 2), s('cable:tin')], [s('battery_case:lead_acid')], { ticks: 100, power: 16 });
  mach('canner', [s('battery_case:lead_acid')], [s(BATT)], { fluidsIn: [s('sulfuric_acid', 1000)], ticks: 100, power: 8 });
  // P4d: selenium ingots (solar panel), ground glass lenses (scanners).
  mach('electric_furnace', [s('dust:selenium')], [s('ingot:selenium')], { ticks: 80 });
  mach('steam_furnace', [s('dust:selenium')], [s('ingot:selenium')], { power: 4 });
  mach('lathe', [s('pane:glass')], [s('lens:glass')], { ticks: 200, power: 16 });
  // P4d electric tools: run on a lead-acid battery (swapped for a charged one from the inventory when flat).
  const etool = (type: ToolType, name: string, color: number, also: ToolType[], elec: number, parts: [string, number][]) => {
    c.addItem({ id: `tool:${type}:steel`, name, kind: 'tool', color, material: 'steel', tool: { type, level: 2, durability: 1000, elec, also } });
    hand([s(BATT), s('circuit:basic'), s('plate:steel', 2), ...parts.map(([id, n]) => s(id, n))], [s(`tool:${type}:steel`)], ['screwdriver', 'wrench']);
  };
  etool('drill', 'Electric Drill', 0xd0a030, ['pickaxe', 'shovel'], ETOOL_J, [['head_drill:steel', 1], ['motor:lv', 1]]);
  etool('chainsaw', 'Electric Chainsaw', 0xd06030, ['axe'], ETOOL_J, [['head_saw:steel', 1], ['motor:lv', 1]]);
  etool('scanner', 'Handheld Scanner', 0x40a0c0, [], SCAN_J, [['wire:copper', 4], ['lens:glass', 1], ['circuit:basic', 1]]);
}

/** Aluminium (P5a, CONTENT §11e.5): Bayer → alumina, red mud recovery, cryolite, Hall–Héroult cell, MV hull. */
function aluminium(hand: Ctx['hand'], mach: Ctx['mach']) {
  mach('chemical_reactor', [s('mdust:bauxite')], [], { fluidsIn: [s('sodium_hydroxide', 1000)], fluidsOut: [s('sodium_aluminate', 1000), s('red_mud', 500)], ticks: 200, power: 24 });
  mach('mixer', [], [s('dust:aluminium_hydroxide', 2)], { fluidsIn: [s('sodium_aluminate', 1000)], fluidsOut: [s('sodium_hydroxide', 900)], ticks: 200, power: 16 });
  mach('roaster', [s('dust:aluminium_hydroxide', 2)], [s('dust:alumina')], { ticks: 160, power: 24 });
  mach('centrifuge', [], [s('small_dust:iron', 2), s('small_mdust:rutile', 1, 0.5), s('small_dust:gallium', 1, 0.3)], { fluidsIn: [s('red_mud', 1000)], fluidsOut: [s('water', 500)], ticks: 200, power: 24 });
  mach('chemical_reactor', [s('mdust:fluorite')], [], { fluidsIn: [s('sulfuric_acid', 1000)], fluidsOut: [s('hydrofluoric_acid', 1000)], ticks: 200, power: 24 });
  mach('chemical_reactor', [s('dust:aluminium_hydroxide')], [s('dust:cryolite', 2)], { fluidsIn: [s('hydrofluoric_acid', 1000), s('sodium_hydroxide', 1000)], fluidsOut: [s('water', 1000)], ticks: 200, power: 24 });
  mach('steam_compressor', [s('dust:graphite', 4)], [s('electrode:graphite')], { power: 4 });
  // 2 Al₂O₃ + 3 C → 4 Al + 3 CO₂, in molten cryolite; 120 W = two LV energy hatches.
  mach('hall_heroult', [s('dust:alumina', 4), s('electrode:graphite'), s('dust:cryolite')], [s('ingot:aluminium', 4)], { fluidsOut: [s('carbon_dioxide', 1000)], ticks: 400, power: 120 });
  hand([s('plate:aluminium', 8), s('cable:copper', 2)], [s('hull:mv')], ['wrench']);
  mach('assembler', [s('plate:aluminium', 8), s('cable:copper', 2)], [s('hull:mv')], { ticks: 200, power: 32 });
}

/** MV electric (P5b, CONTENT §11c MV): magnetic steel, MV parts, lithium from spodumene, the lithium battery. */
function mvParts(c: Ctx) {
  const { mach } = c;
  mach('polarizer', [s('rod:steel')], [s('magnetic_rod:steel')], { ticks: 100, power: 16 });
  const part = (inputs: Stack[], out: string) => mach('assembler', inputs, [s(out)], { ticks: 200, power: 32 });
  part([s('cable:copper', 2), s('wire:copper', 4), s('rod:aluminium', 2), s('magnetic_rod:steel')], 'motor:mv');
  part([s('motor:mv'), s('rotor:aluminium'), s('ring:rubber', 2), s('pipe_small:steel'), s('screw:aluminium')], 'pump:mv');
  part([s('motor:mv'), s('rod:aluminium', 2), s('gear:aluminium'), s('plate:aluminium', 2)], 'piston:mv');
  part([s('motor:mv', 2), s('plate:rubber', 6), s('cable:copper')], 'conveyor:mv');
  part([s('motor:mv', 2), s('piston:mv'), s('circuit:basic', 2), s('cable:copper', 2), s('rod:aluminium', 2)], 'robot_arm:mv');
  // Lithium: spodumene acid leach → Li₂SO₄ solution; membrane electrolysis gives the acid back.
  mach('chemical_reactor', [s('mdust:spodumene')], [s('mdust:quartz')], { fluidsIn: [s('sulfuric_acid', 1000)], fluidsOut: [s('lithium_sulfate', 1000)], ticks: 300, power: 30 });
  mach('electrolyzer', [], [s('dust:lithium')], { fluidsIn: [s('lithium_sulfate', 1000)], fluidsOut: [s('sulfuric_acid', 1000), s('oxygen', 500)], ticks: 400, power: 30 });
  const B = BATTERIES.MV!;
  c.addItem({ id: 'battery_case:lithium', name: 'Lithium Battery Case', kind: 'misc', color: 0xb0c4d8 });
  c.addItem({ id: B.empty, name: 'Lithium Battery (empty)', kind: 'misc', color: 0x8aa0b8, hazards: ['flammable'] });
  c.addItem({ id: B.full, name: 'Lithium Battery (charged)', kind: 'misc', color: 0xb8d0f0, hazards: ['flammable'] });
  mach('assembler', [s('plate:aluminium', 2), s('sheet:rubber', 2), s('cable:copper')], [s('battery_case:lithium')], { ticks: 100, power: 32 });
  mach('canner', [s('battery_case:lithium'), s('dust:lithium', 2)], [s(B.empty)], { ticks: 100, power: 16 });
}

/** Organic chemistry + discrete circuit (P5c, CONTENT §11d MV, §11e.1/4/6). */
function organic(c: Ctx) {
  const { mach } = c, MV = { tier: 'MV' as TierId };
  // Pyrolyse oven: wood → charcoal + methanol + acetic acid + wood tar; coal → coke + coal tar.
  mach('pyrolyse_oven', [s('log:wood', 16)], [s('lump:charcoal', 12)], { fluidsOut: [s('methanol', 1000), s('acetic_acid', 500), s('wood_tar', 1000)], ticks: 600, power: 96 });
  mach('pyrolyse_oven', [s('lump:coal', 16)], [s('lump:coke', 16)], { fluidsOut: [s('coal_tar', 2000), s('hydrogen', 1000)], ticks: 600, power: 96 });
  mach('distillery', [], [], { fluidsIn: [s('coal_tar', 1000)], fluidsOut: [s('phenol', 250), s('benzene', 250), s('toluene', 150), s('creosote', 300)], ticks: 200, power: 64 });
  // Formaldehyde on a silver catalyst (kept, wears), then phenolic resin.
  mach('assembler', [s('fine_wire:silver', 8)], [s('catalyst:silver')], { ticks: 200, power: 16 });
  mach('chemical_reactor', [], [], { fluidsIn: [s('methanol', 1000), s('oxygen', 500)], fluidsOut: [s('formaldehyde', 1000), s('water', 1000)],
    keep: ['catalyst:silver'], wear: 0.02, ticks: 200, power: 30 });
  mach('chemical_reactor', [], [], { fluidsIn: [s('phenol', 1000), s('formaldehyde', 1000)], fluidsOut: [s('phenolic_resin', 1000), s('water', 500)], ticks: 300, power: 24 });
  // Paper → phenolic board → discrete circuit board; moulded component cases.
  mach('chemical_bath', [s('pulp:wood', 2)], [s('paper', 2)], { fluidsIn: [s('water', 500)], power: 8 });
  mach('chemical_bath', [s('paper', 2)], [s('board:phenolic')], { fluidsIn: [s('phenolic_resin', 250)], ticks: 200, power: 16 });
  mach('assembler', [s('board:phenolic'), s('foil:copper', 4)], [s('circuit_board:discrete')], { ticks: 200, power: 32 });
  mach('fluid_solidifier', [], [s('case:phenolic', 4)], { fluidsIn: [s('phenolic_resin', 250)], power: 16 });
  // Metallurgical silicon: SiO₂ + 2 C → Si + 2 CO (burnt to CO₂) at the cupronickel coils' limit.
  mach('ebf', [s('mdust:quartz'), s('dust:coal', 2)], [s('ingot:silicon')], { fluidsOut: [s('carbon_dioxide', 1000)], minHeatK: 2000, ticks: 400, power: 120 });
  // Components → discrete circuit; transistors also make basic circuits cheaper.
  const asm = (inputs: Stack[], out: string, n: number, ticks = 200) => mach('assembler', inputs, [s(out, n)], { ticks, power: 32 });
  asm([s('plate:silicon'), s('fine_wire:gold', 2), s('case:phenolic')], 'transistor', 2);
  asm([s('plate:silicon'), s('fine_wire:copper', 4), s('tube:glass')], 'diode', 4);
  asm([s('foil:aluminium', 2), s('paper'), s('case:phenolic')], 'capacitor', 2);
  asm([s('circuit_board:discrete'), s('transistor', 2), s('diode', 2), s('capacitor', 2), s('resistor:carbon', 2), s('wire:solder')], 'circuit:discrete', 1, 400);
  asm([s('circuit_board:basic'), s('transistor'), s('resistor:carbon', 2), s('wire:solder')], 'circuit:basic', 3);
  // Contact process: SO₂ → SO₃ on vanadium pentoxide (MV reactor), then into water: 4× the uncatalysed rate.
  mach('roaster', [s('dust:vanadium')], [s('catalyst:vanadium_pentoxide')], { fluidsIn: [s('oxygen', 1000)], ticks: 200, power: 24 });
  mach('chemical_reactor', [], [], { fluidsIn: [s('sulfur_dioxide', 1000), s('oxygen', 500)], fluidsOut: [s('sulfur_trioxide', 1000)],
    keep: ['catalyst:vanadium_pentoxide'], wear: 0.01, ticks: 600, power: 64, ...MV });
  mach('chemical_reactor', [], [], { fluidsIn: [s('sulfur_trioxide', 1000), s('water', 1000)], fluidsOut: [s('sulfuric_acid', 1000)], ticks: 100, power: 16 });
}

/** Sulfide minerals the Roaster turns into calcine + SO₂ (CONTENT §11e.4), with the metal the calcine reduces to. */
const SULFIDES: [mineral: string, metal: string][] = [['pyrite', 'iron'], ['chalcopyrite', 'copper'], ['galena', 'lead'], ['sphalerite', 'zinc'],
  ['stibnite', 'antimony'], ['pentlandite', 'nickel'], ['cobaltite', 'cobalt']];

/** Chemistry I (DESIGN §4 Chemistry v1, CONTENT §11e, P4b): cells, brine, chlor-alkali, HCl, roasting, sulfuric acid. */
function chem(c: Ctx) {
  const { hand, mach } = c;
  // Tin cells (1000 L) + the Canner.
  c.addItem({ id: 'cell:empty', name: 'Empty Tin Cell', kind: 'misc', color: 0xc8ccd0 });
  hand([s('plate:tin', 2), s('ring:rubber')], [s('cell:empty')], ['hammer']);
  mach('bender', [s('plate:tin', 2)], [s('cell:empty')], { circuit: 3 });
  for (const f of CELL_FLUIDS) {
    const ch = CHEMICALS.find((x) => x.id === f)!;
    c.addItem({ id: `cell:${f}`, name: `${ch.name} Cell`, kind: 'misc', color: ch.color, hazards: ch.hazards });
    mach('canner', [s('cell:empty')], [s(`cell:${f}`)], { fluidsIn: [s(f, CELL_L)], ticks: 40, power: 8 });
    mach('canner', [s(`cell:${f}`)], [s('cell:empty')], { fluidsOut: [s(f, CELL_L)], ticks: 40, power: 8 });
  }
  // Mixer: brine, alloy dusts.
  mach('mixer', [s('dust:salt')], [], { fluidsIn: [s('water', 1000)], fluidsOut: [s('brine', 1000)], power: 8 });
  const dusts = (ins: [string, number][], out: string, n: number) => {
    if ([...ins.map(([id]) => id), out].every((id) => c.itemIds.has(id))) mach('mixer', ins.map(([id, k]) => s(id, k)), [s(out, n)], { ticks: 200, power: 8 });
  };
  dusts([['dust:copper', 3], ['dust:tin', 1]], 'dust:bronze', 4);
  dusts([['dust:tin', 2], ['dust:lead', 1]], 'dust:solder', 3);
  dusts([['dust:copper', 1], ['dust:nickel', 1]], 'dust:cupronickel', 2);
  // Electrolyzer: chlor-alkali, water splitting.
  mach('electrolyzer', [], [], { fluidsIn: [s('brine', 2000)], fluidsOut: [s('sodium_hydroxide', 1000), s('chlorine', 1000), s('hydrogen', 1000)], ticks: 400, power: 30 });
  mach('electrolyzer', [], [], { fluidsIn: [s('water', 1000)], fluidsOut: [s('hydrogen', 1000), s('oxygen', 500)], ticks: 300, power: 30 });
  // Chemical reactor: HCl, neutralisation (recycles NaOH + HCl to brine), uncatalysed sulfuric acid (slow), vulcanising.
  mach('chemical_reactor', [], [], { fluidsIn: [s('hydrogen', 1000), s('chlorine', 1000)], fluidsOut: [s('hydrochloric_acid', 1000)], power: 16 });
  mach('chemical_reactor', [], [], { fluidsIn: [s('sodium_hydroxide', 1000), s('hydrochloric_acid', 1000)], fluidsOut: [s('brine', 1000)], power: 8 });
  mach('chemical_reactor', [], [], { fluidsIn: [s('sulfur_dioxide', 1000), s('oxygen', 500), s('water', 1000)], fluidsOut: [s('sulfuric_acid', 500)], ticks: 1200, power: 16 });
  mach('chemical_reactor', [s('raw:rubber', 2), s('small_dust:sulfur')], [s('sheet:rubber', 3)], { power: 16 });
  // Roaster: sulfides → calcine + SO₂; the electric furnace reduces calcine with coal. Cinnabar gives mercury; sulfur burns to SO₂.
  for (const [mn, metal] of SULFIDES) {
    const m = MIN.get(mn)!, calc = `roasted:${mn}`;
    c.addItem({ id: calc, name: `Roasted ${m.name}`, kind: 'ore', color: 0x7a4a30, mineral: mn, form: 'roasted' });
    mach('roaster', [s(`mdust:${mn}`)], [s(calc), ...(mn === 'cobaltite' ? [s('small_dust:arsenic')] : [])], { fluidsOut: [s('sulfur_dioxide', 500)], ticks: 200, power: 24 });
    mach('electric_furnace', [s(calc), s('dust:coal')], [s(`ingot:${metal}`)], { ticks: 120, power: 24 });
  }
  mach('roaster', [s('mdust:cinnabar')], [], { fluidsOut: [s('mercury', 144), s('sulfur_dioxide', 500)], ticks: 200, power: 24 });
  mach('roaster', [s('dust:sulfur')], [], { fluidsOut: [s('sulfur_dioxide', 1000)], ticks: 100, power: 16 });
  // Mercury amalgamates gold out of crushed ore.
  mach('chemical_bath', [s('crushed_ore:native_gold')], [s('purified_ore:native_gold'), s('small_dust:gold', 2)], { fluidsIn: [s('mercury', 144)] });
}
