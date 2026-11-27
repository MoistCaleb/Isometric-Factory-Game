// Generates items, fluids and templated recipes from data (DESIGN §1).
import { CHEMICALS } from '../data/chemicals';
import { FLAG_FORMS, FORMS, type ToolType } from '../data/forms';
import { MACHINES } from '../data/machines';
import { MATERIALS, type MaterialDef } from '../data/materials';
import { MINERALS, type MineralDef } from '../data/minerals';
import { MISC_ITEMS } from '../data/misc';
import { STRUCTURES } from '../data/structures';
import type { TierId } from '../data/tiers';
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
  hand([s('plank:wood'), s('stick:wood')], [s('tool:treetap:wood')]);
  // Wood (§11c hand recipes).
  hand([s('log:wood')], [s('plank:wood', 2)]);
  hand([s('log:wood')], [s('plank:wood', 4)], ['saw']);
  hand([s('plank:wood')], [s('stick:wood', 2)]);
  hand([s('plank:wood')], [s('stick:wood', 4)], ['saw']);

  primitive(hand, mach);

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
  c.mach('macerator', [s(o('crushed_ore'))], [s(o('impure_mdust')), ...bpItem(0, 0.1)]);
  c.hand([s(o('impure_mdust'))], [s(dust)]); // sifting by hand (slow in-game; free in data)
  c.mach('centrifuge', [s(o('impure_mdust'))], [s(dust), ...bpItem(0, 0.5)]);
  // Wash route.
  c.mach('sluice', [s(o('crushed_ore'))], [s(o('purified_ore'))], { fluidsIn: [s('water', 1000)], ticks: 200 });
  c.mach('steam_ore_washer', [s(o('crushed_ore'))], [s(o('purified_ore')), ...bpItem(0, 0.5)], { fluidsIn: [s('water', 1000)], power: 4 });
  c.mach('ore_washer', [s(o('crushed_ore'))], [s(o('purified_ore')), ...bpItem(0)], { fluidsIn: [s('water', 1000)] });
  c.mach('macerator', [s(o('purified_ore'))], [s(dust), ...bpItem(1, 0.3)]);
  c.mach('thermal_centrifuge', [s(o('purified_ore'))], [s(o('refined_ore')), ...bpItem(1)], bpFluid(1));
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
