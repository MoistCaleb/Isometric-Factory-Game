// Player actions (DESIGN §3/§8): global inventory, tool slots + wear, click-gather mining.
// Pure functions on GameState so they run in the worker and in tests.
import { blighted, pollKey } from './pollution';
import { registry } from '../content/registry';
import type { Recipe, Stack } from '../content/types';
import type { ToolType } from '../data/forms';
import { MINERALS } from '../data/minerals';
import { B, BLOCKS } from '../world/blocks';
import { LAYERS, Tree, type WorldGen } from '../world/gen';
import { addBase, builtOn, demolish, place, type BaseKind, type Side } from './build';
import { next } from './rng';
import { CABLES, CHANNELS, isConduit } from '../data/structures';
import { topoChanged } from './pipes';
import { machCmd, type MachCmd } from './machines';
import { checkQuests, questCmd, type QuestCmd } from './quests';
import { know, pickSample, prospect } from './veins';
import { KNOW, STOREY, type Ent, type GameState, type Slot } from './state';
import { BATT, BATT_FULL, BATT_J } from '../data/machines';
import { UI_FLAGS } from '../data/quests';
import { bpCmd, type Blueprint, type BpCmd } from './blueprints';
import { harvest, plant, reap } from './farm';
import { saplingOfTree } from '../data/crops';

export const STACK = 64;
/** Just the inventory part of the state (the UI checks craftability against its copy). */
export type Inv = Pick<GameState, 'inv' | 'tools'>;
export type SlotRef = { box: 'inv' | 'tools'; i: number };

export type Cmd =
  | { k: 'mine'; x: number; y: number; z: number }
  | { k: 'harvest'; x: number; y: number; f: number }
  | { k: 'move'; a: SlotRef; b: SlotRef }
  | { k: 'trash'; a: SlotRef }
  | { k: 'craft'; recipe: string; n: number }
  | { k: 'place'; id: string; x: number; y: number; f: number; r: number; ch?: number }
  /** Pipe/cable block: set channel and/or cut sides (bitmask E W S N up down). */
  | { k: 'conduit'; key: string; ch?: number; cut?: number; trip?: number }
  | { k: 'base'; kind: BaseKind; x: number; y: number; f: number; side?: Side }
  | { k: 'demolish'; x: number; y: number; f: number; side?: Side }
  | { k: 'prospect'; x: number; y: number }
  | MachCmd
  | QuestCmd
  /** Tutorial flag for UI-only actions (camera, panels). */
  | { k: 'flag'; id: (typeof UI_FLAGS)[number] }
  /** Dev kit (Debug menu): structures, casings, a few P2d test materials. */
  | { k: 'devkit' }
  | { k: 'devpoll'; x: number; y: number }
  | BpCmd;

export interface ActResult {
  ok: boolean;
  msg?: string;
  /** Made by the sim itself (explosion, excavator, thumper), not a reply to a command. */
  sim?: boolean;
  /** Diff changes to apply to the rendered world. */
  changes?: Record<string, number>;
  gained?: Stack[];
  /** Dig progress [hits, needed] while a block is not yet broken. */
  progress?: [number, number];
  target?: string;
  /** Structure / base part changes (null = removed). */
  ents?: Record<string, Ent | null>;
  base?: Record<string, number | null>;
  /** Vein knowledge raised (vein id → KNOW level). */
  veins?: Record<string, number>;
  /** Quest state changes (id → QDONE/QCLAIMED). */
  quests?: Record<string, number>;
  /** Saved blueprints after a change (P5f). */
  bps?: Blueprint[];
}

// ---------- inventory ----------
const box = (s: GameState, r: SlotRef) => (r.box === 'inv' ? s.inv : s.tools);

/** Add items; tools go to free tool slots first. Returns the count that did not fit. */
export function give(s: GameState, id: string, n: number): number {
  const def = registry().item(id);
  if (!def) throw new Error(`unknown item ${id}`);
  if (def.tool) {
    while (n > 0) {
      const t = s.tools.indexOf(null), i = t < 0 ? s.inv.indexOf(null) : -1;
      if (t < 0 && i < 0) break;
      (t >= 0 ? s.tools : s.inv)[t >= 0 ? t : i] = { id, n: 1, dur: def.tool.durability };
      n--;
    }
    return n;
  }
  for (const sl of s.inv) if (n > 0 && sl?.id === id && sl.n < STACK) { const k = Math.min(n, STACK - sl.n); sl.n += k; n -= k; }
  for (let i = 0; i < s.inv.length && n > 0; i++) if (!s.inv[i]) { const k = Math.min(n, STACK); s.inv[i] = { id, n: k }; n -= k; }
  return n;
}

export function count(s: Inv, id: string): number {
  return s.inv.reduce((a, sl) => a + (sl?.id === id ? sl.n : 0), 0);
}

/** Remove n of an item from the inventory (caller checks `count` first). */
export function take(s: GameState, id: string, n: number) {
  for (let i = s.inv.length - 1; i >= 0 && n > 0; i--) {
    const sl = s.inv[i];
    if (sl?.id !== id) continue;
    const k = Math.min(n, sl.n);
    sl.n -= k; n -= k;
    if (!sl.n) s.inv[i] = null;
  }
}

/** Why a hand recipe can't be crafted right now (missing inputs/tools), or null if it can. */
export function missing(s: Inv, r: Recipe): string[] | null {
  const out: string[] = [];
  const reg = registry();
  for (const i of r.inputs) if (count(s, i.id) < i.n) out.push(reg.item(i.id)?.name ?? i.id);
  for (const k of r.keep ?? []) if (count(s, k) < 1) out.push(reg.item(k)?.name ?? k);
  for (const t of r.tools ?? []) if (!bestTool(s, t)) out.push(t.replace('_', ' '));
  return out.length ? out : null;
}

/** Hand-craft a recipe up to n times (stops early when inputs/tools run out). */
export function craft(s: GameState, id: string, n: number): ActResult {
  const r = registry().recipes.find((x) => x.id === id);
  if (!r || r.machine !== 'hand') return { ok: false, msg: 'Not a hand recipe' };
  const gained = new Map<string, number>();
  let done = 0, msg: string | undefined, lost = 0;
  for (; done < Math.max(1, Math.min(n, 64)); done++) {
    const miss = missing(s, r);
    if (miss) { if (!done) return { ok: false, msg: `Missing: ${miss.join(', ')}` }; break; }
    for (const i of r.inputs) take(s, i.id, i.n);
    for (const t of r.tools ?? []) msg = wear(s, bestTool(s, t)!.i) ?? msg;
    for (const o of r.outputs) {
      if (o.chance !== undefined && next(s) >= o.chance) continue;
      const left = give(s, o.id, o.n);
      lost += left;
      gained.set(o.id, (gained.get(o.id) ?? 0) + o.n - left);
    }
  }
  if (lost) msg = [msg, 'Inventory full — items dropped'].filter(Boolean).join(' · ');
  return { ok: true, msg, gained: [...gained].filter(([, k]) => k > 0).map(([id, k]) => ({ id, n: k })) };
}

/** Move/swap/merge a stack. Tool slots only hold tools. */
export function move(s: GameState, a: SlotRef, b: SlotRef): ActResult {
  const A = box(s, a), Bx = box(s, b), sa = A[a.i], sb = Bx[b.i];
  if (!sa || (a.box === b.box && a.i === b.i)) return { ok: false };
  const isTool = (sl: Slot | null) => !sl || !!registry().item(sl.id)?.tool;
  if ((b.box === 'tools' && !isTool(sa)) || (a.box === 'tools' && !isTool(sb))) return { ok: false, msg: 'Tool slots hold tools only' };
  if (sb && sb.id === sa.id && sa.dur === undefined) {
    const k = Math.min(sa.n, STACK - sb.n);
    sb.n += k; sa.n -= k;
    if (!sa.n) A[a.i] = null;
  } else { A[a.i] = sb; Bx[b.i] = sa; }
  return { ok: true };
}

/** An electric tool can run: charge for one use, or a charged battery in the bag to swap in (P4d). */
const charged = (s: Inv, sl: Slot, need: number) => (sl.e ?? 0) >= need - 1e-9 || count(s, BATT_FULL) > 0;

/** Best tool of a type in the tool slots (highest level; electric tools that can run win ties). */
export function bestTool(s: Inv, type: ToolType): { i: number; level: number; elec?: boolean } | null {
  let best: { i: number; level: number; elec?: boolean } | null = null, rank = -1;
  s.tools.forEach((sl, i) => {
    const t = sl && registry().item(sl.id)?.tool;
    if (!t || (t.type !== type && !t.also?.includes(type)) || (t.elec && !charged(s, sl, t.elec))) return;
    const r = t.level + (t.elec ? 0.5 : 0);
    if (r > rank) { rank = r; best = { i, level: t.level, elec: !!t.elec }; }
  });
  return best;
}

/** Wear a tool by one use (electric tools also spend charge, swapping a flat battery for a charged one from the bag);
 * returns a message if it broke or swapped. */
export function wear(s: GameState, i: number): string | undefined {
  const sl = s.tools[i];
  if (!sl) return;
  const t = registry().item(sl.id)?.tool;
  let msg: string | undefined;
  if (t?.elec) {
    if ((sl.e ?? 0) < t.elec - 1e-9 && count(s, BATT_FULL)) {
      take(s, BATT_FULL, 1);
      msg = give(s, BATT, 1) ? 'Swapped in a charged battery (bag full: the flat one was lost)' : 'Swapped in a charged battery';
      sl.e = (sl.e ?? 0) + BATT_J;
    }
    sl.e = Math.max(0, (sl.e ?? 0) - t.elec);
    s.flags.etool = (s.flags.etool ?? 0) + 1;
  }
  if (sl.dur === undefined) return msg;
  if (--sl.dur <= 0) { s.tools[i] = null; return `${registry().item(sl.id)?.name ?? sl.id} broke`; }
  return msg;
}

// ---------- mining ----------
interface BlockRule { tool: 'shovel' | 'pickaxe'; hits: number; hardness: number; drop: (s: GameState) => Stack[] }
const chance = (s: GameState, p: number, id: string, n = 1): Stack[] => (next(s) < p ? [{ id, n }] : []);
const soil = (hits: number, drop: BlockRule['drop']): BlockRule => ({ tool: 'shovel', hits, hardness: 0, drop });
const rock = (hits: number, hardness: number): BlockRule => ({ tool: 'pickaxe', hits, hardness, drop: () => [{ id: 'cobble:stone', n: 1 }] });
const turf = (straw: number) => soil(2, (s) => [{ id: 'dirt', n: 1 }, ...chance(s, 0.35, 'fiber'), ...chance(s, straw, 'straw')]);

const RULES: Record<string, BlockRule> = {
  grass: turf(0.2), forest_floor: turf(0), jungle_floor: turf(0), tundra: turf(0.1),
  snow: soil(1, () => []),
  mud: soil(2, (s) => [{ id: 'dirt', n: 1 }, ...chance(s, 0.15, 'fiber')]),
  dirt: soil(2, (s) => [{ id: 'dirt', n: 1 }, ...chance(s, 0.06, 'shard:flint')]),
  silt: soil(2, (s) => [{ id: 'dirt', n: 1 }, ...chance(s, 0.1, 'shard:flint')]),
  permafrost: soil(4, () => [{ id: 'dirt', n: 1 }]),
  clay: soil(2, () => [{ id: 'ball:clay', n: 2 }]),
  sand: soil(2, (s) => [{ id: 'dust:sand', n: 1 }, ...chance(s, 0.05, 'shard:flint')]),
  gravel: soil(2, (s) => [{ id: 'gravel:stone', n: 1 }, ...chance(s, 0.3, 'shard:flint')]),
  basalt: rock(3, 0), stone: rock(3, 0), deepstone: rock(4, 1), abyssal: rock(5, 2),
};
const MINERAL = new Map(MINERALS.map((m) => [m.id, m]));
const HAND_SOIL = 3; // hand digging is 3× slower than a shovel
const HAND_DROP = 0.03;

export const blockAt = (s: GameState, gen: WorldGen, x: number, y: number, z: number) =>
  s.diffs[`${gen.wrapX(x)},${y},${z}`] ?? gen.block(x, y, z);

/** A block can be dug from the surface, from an open block above, or from an open neighbour on its layer. */
function exposed(s: GameState, gen: WorldGen, x: number, y: number, z: number): boolean {
  if (z === 0) return true;
  const air = (xx: number, yy: number, zz: number) => gen.inBounds(yy) && blockAt(s, gen, xx, yy, zz) === B.air;
  return air(x, y, z - 1) || air(x - 1, y, z) || air(x + 1, y, z) || air(x, y - 1, z) || air(x, y + 1, z);
}

const speed = (level: number) => 1 + 0.5 * level;
/** Electric drills and chainsaws work twice as fast as a hand tool of their level (P4d). */
const tspeed = (t: { level: number; elec?: boolean }) => speed(t.level) * (t.elec ? 2 : 1);

function hit(s: GameState, key: string, need: number): ActResult | null {
  if (s.dig?.key !== key) s.dig = { key, hits: 0 };
  if (++s.dig.hits < need) return { ok: true, progress: [s.dig.hits, need] };
  s.dig = undefined;
  return null;
}

function collect(s: GameState, drops: Stack[], res: ActResult): ActResult {
  const gained: Stack[] = [];
  let lost = 0;
  for (const d of drops) { const left = give(s, d.id, d.n); lost += left; if (d.n - left) gained.push({ id: d.id, n: d.n - left }); }
  if (lost) res.msg = [res.msg, 'Inventory full'].filter(Boolean).join(' · ');
  return { ...res, gained };
}

const TREE_LOGS: Record<number, number> = { [Tree.Broadleaf]: 3, [Tree.Conifer]: 3, [Tree.Jungle]: 4, [Tree.Cactus]: 0 };

function chop(s: GameState, x: number, y: number, tree: Tree): ActResult {
  const key = `${x},${y},t`, target = tree === Tree.Cactus ? 'Cactus' : 'Tree';
  // Rubber trees (jungle, some swamp): a treetap in the tool slots taps them for resin and leaves them standing (P3c).
  const tap = tree === Tree.Jungle ? bestTool(s, 'treetap') : null;
  const dead = blighted(s, x, y); // P5e: withered by pollution — no resin
  if (tap && dead) return { ok: false, target: 'Withered rubber tree', msg: 'Withered by pollution — no resin until the air clears' };
  if (tap) {
    const p = hit(s, `${x},${y},r`, 3);
    if (p) return { ...p, target: 'Rubber tree' };
    s.flags.tap = (s.flags.tap ?? 0) + 1;
    return collect(s, [{ id: 'sticky_resin', n: 1 }, ...chance(s, 0.5, 'sticky_resin')], { ok: true, target: 'Rubber tree', msg: wear(s, tap.i) });
  }
  const axe = bestTool(s, 'axe');
  if (!axe) {
    // Bare hands: snap twigs, strip fibre. Slow and random.
    const drops = [...chance(s, 0.4, 'stick:wood'), ...chance(s, 0.15, 'fiber')];
    return collect(s, drops, { ok: true, target, msg: drops.length ? undefined : 'Nothing — an axe fells trees' });
  }
  const p = hit(s, key, Math.ceil(5 / tspeed(axe)));
  if (p) return { ...p, target };
  const broke = wear(s, axe.i);
  s.diffs[key] = 0;
  const sap = saplingOfTree(tree), drops: Stack[] = tree === Tree.Cactus ? [{ id: 'fiber', n: 2 }] : [{ id: 'log:wood', n: TREE_LOGS[tree] }, ...chance(s, 0.5, 'stick:wood', 2), ...(tree === Tree.Jungle && !dead ? chance(s, 0.5, 'sticky_resin') : []),
    ...(sap ? [{ id: `sapling:${sap}`, n: 1 }, ...chance(s, 0.3, `sapling:${sap}`)] : [])]; // P5h saplings
  return collect(s, drops, { ok: true, target, msg: broke, changes: { [key]: 0 } });
}

/** Wild plant on a surface tile (P5h): picking it gives seeds + produce. */
function pickPlant(s: GameState, gen: WorldGen, x: number, y: number): ActResult | null {
  const key = `${x},${y},p`, c = s.diffs[key] === undefined ? gen.plant(x, y) : null;
  if (!c) return null;
  s.diffs[key] = 0;
  s.flags.forage = (s.flags.forage ?? 0) + 1;
  return collect(s, [{ id: `seed:${c}`, n: 1 }, ...chance(s, 0.5, `seed:${c}`), { id: `crop:${c}`, n: 1 }], { ok: true, target: 'Wild plant', changes: { [key]: 0 } });
}

/** A grown planted tree (P5h): felled like a wild one, needs an axe. */
function chopPlanted(s: GameState, x: number, y: number): ActResult {
  const key = `${x},${y},0`, e = s.ents[key];
  if ((e.g ?? 0) < 1) return { ok: false, target: 'Sapling', msg: `Still growing (${Math.floor((e.g ?? 0) * 100)} %)` };
  const axe = bestTool(s, 'axe');
  if (!axe) return { ok: false, target: 'Tree', msg: 'Needs an axe' };
  const p = hit(s, `${key},pt`, Math.ceil(5 / tspeed(axe)));
  if (p) return { ...p, target: 'Tree' };
  const broke = wear(s, axe.i), r = reap(s, key)!;
  s.flags.chop = (s.flags.chop ?? 0) + 1;
  return collect(s, r.drops, { ok: true, target: 'Tree', msg: broke, ents: { [key]: null } });
}

/** One click/tap of mining at (x, y, z). Digging a hole continues downward through open blocks. */
export function mine(s: GameState, gen: WorldGen, xIn: number, y: number, zIn: number): ActResult {
  const x = gen.wrapX(xIn);
  if (!gen.inBounds(y)) return { ok: false };
  if (zIn === 0) { const smp = pickSample(s, gen, x, y); if (smp) return smp; }
  if (zIn === 0 && s.ents[`${x},${y},0`]?.s === 'tree') return chopPlanted(s, x, y);
  if (zIn === 0 && builtOn(s, x, y)) return { ok: false, msg: 'Something is built here — demolish it first' };
  if (zIn === 0) { const wild = pickPlant(s, gen, x, y); if (wild) return wild; }
  if (zIn === 0 && s.diffs[`${x},${y},t`] === undefined) {
    const tree = gen.tree(x, y);
    if (tree && blockAt(s, gen, x, y, 0) !== B.air) return chop(s, x, y, tree);
  }
  let z = zIn, b = blockAt(s, gen, x, y, z);
  while (b === B.air && z < LAYERS.bedrock) b = blockAt(s, gen, x, y, ++z);
  const def = BLOCKS[b];
  if (def.liquid) return { ok: false, msg: `Can't dig ${def.name.toLowerCase()}` };
  if (def.unbuildable) return { ok: false, msg: `${def.name} is too hard` };
  if (z > 0 && BLOCKS[blockAt(s, gen, x, y, z - 1)].liquid) return { ok: false, msg: 'Under water — needs an offshore rig' };
  if (!exposed(s, gen, x, y, z)) return { ok: false, msg: 'Dig down from above or beside it first' };

  const mineral = def.mineral ? MINERAL.get(def.mineral) : undefined;
  const rule: BlockRule = mineral ? { tool: 'pickaxe', hits: 3 + mineral.hardness, hardness: mineral.hardness, drop: () => [] } : RULES[def.key] ?? rock(3, 0);
  const tool = bestTool(s, rule.tool);
  let need: number;
  if (rule.tool === 'pickaxe') {
    if (!tool) return { ok: false, msg: `Need a pickaxe for ${def.name}` };
    // Hand-pick reach: a tier-T pick mines hardness ≤ T+1 (CONTENT §11c).
    if (rule.hardness > tool.level + 1) return { ok: false, msg: `${def.name} needs a better pickaxe (hardness ${rule.hardness})` };
    need = Math.ceil(rule.hits / tspeed(tool));
  } else need = tool ? Math.ceil(rule.hits / tspeed(tool)) : rule.hits * HAND_SOIL;

  const key = `${x},${y},${z}`;
  const p = hit(s, key, need);
  if (p) return { ...p, target: def.name };

  let drops: Stack[], veins: Record<string, number> | undefined, found: string | undefined;
  if (mineral) {
    const hit = gen.ore(x, y, z);
    const n = hit?.richness ?? 1;
    if (hit && s.diffs[`${x},${y},${z}`] === undefined) { veins = know(s, hit.vein.id, KNOW.exposed); if (veins) found = hit.vein.def.name; }
    drops = [{ id: `ore:${mineral.id}`, n }];
    if (mineral.handDrop) drops.push(...chance(s, HAND_DROP, mineral.handDrop));
  } else drops = rule.drop(s);
  s.diffs[key] = B.air;
  const changes: Record<string, number> = { [key]: B.air };
  // Felling the surface takes its tree with it.
  if (z === 0 && gen.tree(x, y) && s.diffs[`${x},${y},t`] === undefined) { s.diffs[`${x},${y},t`] = 0; changes[`${x},${y},t`] = 0; }
  const broke = tool ? wear(s, tool.i) : undefined;
  return collect(s, drops, { ok: true, target: def.name, msg: [found && `Exposed: ${found}`, broke].filter(Boolean).join(' · ') || undefined, changes, veins });
}

/** Apply a command, recording tutorial action flags on success (data/quests). */
export function apply(s: GameState, gen: WorldGen, c: Cmd): ActResult {
  const r = run(s, gen, c);
  if (r.ok) { for (const f of flagsOf(c, r)) s.flags[f] = (s.flags[f] ?? 0) + 1; checkQuests(s); }
  return r;
}

const SIM_FLAGS = new Set(['craft', 'move', 'base', 'demolish', 'prospect', 'mload', 'mfuel', 'mtake', 'crank', 'mfill', 'mdump', 'open', 'qclaim']);
function flagsOf(c: Cmd, r: ActResult): string[] {
  if (c.k === 'flag') return [];
  const out: string[] = SIM_FLAGS.has(c.k) ? [c.k] : [];
  const ch = Object.keys(r.changes ?? {});
  if (c.k === 'mine') {
    if (ch.some((k) => k.endsWith(',s'))) out.push('sample');
    else if (ch.some((k) => k.endsWith(',t')) && !ch.some((k) => !k.endsWith(',t'))) out.push('chop');
    else if (ch.length) out.push('mine');
  }
  if (c.k === 'place') for (const k of Object.keys(r.ents ?? {})) { const b = +k.split(',')[2]; out.push('place'); if (b % STOREY) out.push('stack'); if (b >= STOREY) out.push('upper'); }
  return out;
}

function run(s: GameState, gen: WorldGen, c: Cmd): ActResult {
  switch (c.k) {
    case 'mine': return mine(s, gen, c.x, c.y, c.z);
    case 'move': return move(s, c.a, c.b);
    case 'trash': box(s, c.a)[c.a.i] = null; return { ok: true };
    case 'craft': return craft(s, c.recipe, c.n);
    case 'place': return c.id.startsWith('struct:') ? place(s, gen, c.id, c.x, c.y, c.f, c.r, c.ch) : plant(s, gen, c.id, c.x, c.y, c.f);
    case 'harvest': return harvest(s, gen, c.x, c.y, c.f);
    case 'conduit': {
      const e = s.ents[c.key];
      if (!e || !isConduit(e.s)) return { ok: false, msg: 'Not a pipe or cable' };
      const n: Ent = { ...e };
      if (c.ch !== undefined) { if (c.ch > 0 && c.ch < CHANNELS.length) n.ch = c.ch; else delete n.ch; }
      if (c.cut !== undefined) { if (c.cut & 63) n.cut = c.cut & 63; else delete n.cut; }
      if (c.trip !== undefined && CABLES.get(e.s)?.breaker) { if (c.trip) n.trip = 1; else delete n.trip; s.flags.breaker = (s.flags.breaker ?? 0) + 1; }
      s.ents[c.key] = n; topoChanged();
      return { ok: true, ents: { [c.key]: n } };
    }
    case 'base': return addBase(s, gen, c.kind, c.x, c.y, c.f, c.side);
    case 'demolish': return demolish(s, gen, c.x, c.y, c.f, c.side);
    case 'prospect': return prospect(s, gen, c.x, c.y);
    case 'mrec': case 'mload': case 'mfuel': case 'mtake': case 'munload': case 'mdump': case 'crank': case 'mfill': case 'mface': case 'cput': case 'mcell': case 'mbat': case 'mxf': case 'mfix': return machCmd(s, gen, c);
    case 'qclaim': case 'open': return questCmd(s, c);
    case 'bpcopy': case 'bpsave': case 'bppaste': case 'bpdel': return bpCmd(s, gen, c);
    case 'flag': if ((UI_FLAGS as readonly string[]).includes(c.id)) s.flags[c.id] = (s.flags[c.id] ?? 0) + 1; return { ok: true };
    case 'devpoll': { const k = pollKey(c.x, c.y); s.poll[k] = (s.poll[k] ?? 0) + 2000; return { ok: true, msg: 'Dev: +2000 pollution here' }; }
    case 'devkit': {
      const kit: [string, number][] = [...registry().items.filter((i) => i.kind === 'structure').reverse().map((i): [string, number] => [i.id, /wall|cover|casing|coil/.test(i.id) ? 64 : /pipe|cable|wire/.test(i.id) ? 16 : 1]),
        ['tool:prospector:bronze', 1], ['tool:hammer:stone', 1], ['lump:charcoal', 32], ['log:wood', 16], ['unfired_brick:clay', 8], ['ingot:copper', 6], ['ingot:tin', 2], ['mold_ingot:clay', 1]];
      const gained = kit.map(([id, n]) => ({ id, n: n - give(s, id, n) }));
      return { ok: true, gained };
    }
  }
}

