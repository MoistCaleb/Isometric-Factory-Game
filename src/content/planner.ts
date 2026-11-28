// Planner / ratio calculator (DESIGN §8, P5f): expand a target rate into a recipe tree with machine counts, power,
// raw inputs and byproducts; sketch a blueprint from it.
import { MACHINE, STEAM_PER_POWER } from '../data/machines';
import { WORLD_FLUIDS, WORLD_ITEMS } from '../data/misc';
import { STRUCTURES } from '../data/structures';
import { tierIndex, type TierId } from '../data/tiers';
import type { Blueprint, BpEnt } from '../sim/blueprints';
import { TPS } from '../sim/state';
import { registry } from './registry';
import type { Recipe } from './types';

/** Per product: chosen recipe id, or 'raw' to treat it as an input. */
export type Choice = Record<string, string>;
export interface PlanNode {
  id: string; rate: number;
  recipe?: Recipe; options: Recipe[];
  /** Runs per minute · machines needed at base speed · their structure · average draw (W, electric) or steam (L/s). */
  runs?: number; machines?: number; struct?: string; w?: number; steam?: number;
  /** Why it's an input: world item, no recipe, loop, chosen, too deep. */
  raw?: string;
  kids: PlanNode[];
  /** Other outputs per minute. */
  by: [string, number][];
}

const MAX_DEPTH = 14;
const isWorld = (id: string) => id.startsWith('ore:') || WORLD_ITEMS.includes(id) || WORLD_FLUIDS.includes(id);
const outN = (r: Recipe, id: string) => [...r.outputs, ...(r.fluidsOut ?? [])].filter((o) => o.id === id).reduce((a, o) => a + o.n * (o.chance ?? 1), 0);

/** Recipes that make id, best default first: machine before hand, id as the main output, the most advanced tier up to `upTo`
 * (then lowest above it), never one that takes id itself. */
export function optionsFor(id: string, upTo: TierId = 'MV'): Recipe[] {
  const main = (r: Recipe) => (r.outputs[0]?.id === id || r.fluidsOut?.[0]?.id === id ? 0 : 1), max = tierIndex(upTo);
  const tierKey = (r: Recipe) => { const t = tierIndex(r.tier); return t <= max ? max - t : 100 + t; };
  return registry().recipesFor(id)
    .filter((r) => outN(r, id) > 0 && ![...r.inputs, ...(r.fluidsIn ?? [])].some((i) => i.id === id))
    .sort((a, b) => (a.machine === 'hand' ? 1 : 0) - (b.machine === 'hand' ? 1 : 0) || main(a) - main(b) || tierKey(a) - tierKey(b));
}

/** Structure that runs a recipe: its machine, or the lowest-tier variant (`base`) at or above the recipe tier. */
export function structFor(r: Recipe): string | undefined {
  const c = STRUCTURES.filter((st) => st.machine && (st.machine === r.machine || MACHINE.get(st.machine)?.base === r.machine))
    .map((st) => ({ st, t: tierIndex(MACHINE.get(st.machine!)!.tier) }))
    .sort((a, b) => a.t - b.t);
  return (c.find((x) => x.t >= tierIndex(r.tier)) ?? c[0])?.st.id;
}

export function plan(id: string, rate: number, choice: Choice = {}, upTo: TierId = 'MV', path: string[] = []): PlanNode {
  const options = optionsFor(id, upTo), node: PlanNode = { id, rate, options, kids: [], by: [] };
  const pick = choice[id];
  if (pick === 'raw') { node.raw = 'chosen'; return node; }
  if (path.includes(id)) { node.raw = 'loop'; return node; }
  if (path.length >= MAX_DEPTH) { node.raw = 'too deep'; return node; }
  // Default: the first option whose inputs can be made without coming straight back here (or the first at all).
  const ins = (o: Recipe) => [...o.inputs, ...(o.fluidsIn ?? [])].map((i) => i.id);
  const seen = [...path, id], loops = (o: Recipe) => ins(o).some((i) => seen.includes(i)
    || (!isWorld(i) && choice[i] !== 'raw' && optionsFor(i, upTo).length > 0 && optionsFor(i, upTo).every((p) => ins(p).some((j) => seen.includes(j) || j === i))));
  // …preferring one that makes the material from something else (Hall–Héroult) over re-forming it (furnace ← its own dust).
  const mat = (x: string) => x.split(':').pop(), conv = (o: Recipe) => ins(o).every((i) => mat(i) === mat(id));
  const rank = (o: Recipe) => (loops(o) ? 2 : 0) + (conv(o) ? 1 : 0);
  const best = options.reduce<Recipe | undefined>((b, o) => (!b || rank(o) < rank(b) ? o : b), undefined);
  const r = options.find((o) => o.id === pick) ?? (isWorld(id) ? undefined : best);
  if (!r) { node.raw = isWorld(id) ? 'world' : 'no recipe'; return node; }
  node.recipe = r;
  const runs = rate / outN(r, id);
  node.runs = runs;
  if (r.machine !== 'hand' && r.ticks > 0) {
    const def = MACHINE.get(r.machine);
    node.machines = runs / ((60 * TPS) / r.ticks);
    node.struct = structFor(r);
    if (def?.run === 'steam') node.steam = r.power * STEAM_PER_POWER * TPS * node.machines;
    else if (r.power) node.w = r.power * node.machines;
  }
  for (const i of [...r.inputs, ...(r.fluidsIn ?? [])]) node.kids.push(plan(i.id, i.n * runs, choice, upTo, [...path, id]));
  for (const o of [...r.outputs, ...(r.fluidsOut ?? [])]) if (o.id !== id) node.by.push([o.id, o.n * (o.chance ?? 1) * runs]);
  return node;
}

export interface PlanTotals { steps: Map<string, { r: Recipe; machines: number; struct?: string }>; raw: Map<string, number>; by: Map<string, number>; w: number; steam: number }

export function totals(root: PlanNode): PlanTotals {
  const t: PlanTotals = { steps: new Map(), raw: new Map(), by: new Map(), w: 0, steam: 0 };
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  const walk = (n: PlanNode) => {
    if (!n.recipe) { add(t.raw, n.id, n.rate); return; }
    const s = t.steps.get(n.recipe.id);
    if (n.machines !== undefined) t.steps.set(n.recipe.id, { r: n.recipe, machines: (s?.machines ?? 0) + n.machines, struct: n.struct });
    t.w += n.w ?? 0; t.steam += n.steam ?? 0;
    for (const [id, v] of n.by) add(t.by, id, v);
    n.kids.forEach(walk);
  };
  walk(root);
  return t;
}

export const SKETCH_ROW = 16;
/** Blueprint sketch: one row per machine step (deepest inputs first), whole machines with the recipe set. */
export function sketch(root: PlanNode, name: string): Blueprint {
  const ents: BpEnt[] = [];
  let y = 0;
  for (const { r, machines, struct } of [...totals(root).steps.values()].reverse()) {
    if (!struct) continue;
    const n = Math.min(SKETCH_ROW, Math.max(1, Math.ceil(machines - 1e-9)));
    for (let x = 0; x < n; x++) ents.push({ x, y, b: 0, s: struct, r: 0, rec: r.id });
    y += 2;
  }
  return { name: name.slice(0, 40), w: Math.max(1, ...ents.map((e) => e.x + 1)), h: Math.max(1, y - 1), ents, base: [] };
}
