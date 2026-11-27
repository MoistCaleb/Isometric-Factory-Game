// Content validator (DESIGN §9). Errors fail the build; warnings track coverage gaps
// that later phases must close (hand-written chemistry, machines, alloys).
import { CHEMICALS } from '../data/chemicals';
import { TOOL_TYPES } from '../data/forms';
import { MACHINES } from '../data/machines';
import { MATERIALS } from '../data/materials';
import { MINERALS } from '../data/minerals';
import { WORLD_FLUIDS, WORLD_ITEMS } from '../data/misc';
import { CRATE_TIERS, crateId, LOOT } from '../data/loot';
import { QUEST, QUESTS, SIM_FLAGS, UI_FLAGS } from '../data/quests';
import { STRUCTURES } from '../data/structures';
import { TIERS } from '../data/tiers';
import { BIOMES, VEINS } from '../data/veins';
import { byproductStack, mineralDust } from './generate';
import type { Registry } from './registry';

export interface Report { errors: string[]; warnings: string[] }

export function validate(reg: Registry): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  // Unique ids per namespace.
  const dupes = (ns: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) seen.has(id) ? err(`duplicate ${ns} id: ${id}`) : seen.add(id);
  };
  dupes('material', MATERIALS.map((m) => m.id));
  dupes('mineral', MINERALS.map((m) => m.id));
  dupes('chemical', CHEMICALS.map((c) => c.id));
  dupes('vein', VEINS.map((v) => v.id));
  dupes('machine', MACHINES.map((m) => m.id));
  dupes('item', reg.items.map((i) => i.id));
  dupes('fluid', reg.fluids.map((f) => f.id));
  dupes('recipe', reg.recipes.map((r) => r.id));

  const matIds = new Set(MATERIALS.map((m) => m.id));
  const chemIds = new Set(CHEMICALS.map((c) => c.id));
  const minIds = new Set(MINERALS.map((m) => m.id));
  const machines = new Map(MACHINES.map((m) => [m.id, m]));

  // Materials.
  for (const m of MATERIALS) {
    if (!TIERS.includes(m.tier)) err(`material ${m.id}: bad tier ${m.tier}`);
    if (m.flags.includes('T') && m.toolLevel === undefined) err(`material ${m.id}: T flag without toolLevel`);
    if (m.flags.includes('W') && !m.flags.includes('B')) err(`material ${m.id}: W requires B`);
  }

  // Minerals.
  const ref = (r: string) => r.startsWith('later:') || matIds.has(r) || chemIds.has(r) || (r.startsWith('m:') && minIds.has(r.slice(2)));
  for (const mn of MINERALS) {
    if (mn.hardness < 0 || mn.hardness > 5) err(`mineral ${mn.id}: hardness ${mn.hardness} out of 0–5`);
    if (!ref(mn.product)) err(`mineral ${mn.id}: unresolved product ${mn.product}`);
    for (const b of mn.byproducts) if (!ref(b)) err(`mineral ${mn.id}: unresolved byproduct ${b}`);
    if (!VEINS.some((v) => v.parts.some((p) => p.ref === mn.id))) err(`mineral ${mn.id}: in no vein`);
    if (mn.handDrop && !reg.item(mn.handDrop)) err(`mineral ${mn.id}: unknown handDrop ${mn.handDrop}`);
  }

  // Veins.
  for (const v of VEINS) {
    const sum = v.parts.reduce((a, p) => a + p.weight, 0);
    if (sum !== 100) err(`vein ${v.id}: weights sum ${sum} ≠ 100`);
    const [d0, d1] = v.depth;
    if (d0 < 1 || d1 > 24 || d0 > d1) err(`vein ${v.id}: bad depth ${d0}–${d1}`);
    for (const p of v.parts) {
      const ok = p.ref.startsWith('mat:') ? matIds.has(p.ref.slice(4)) : minIds.has(p.ref);
      if (!ok) err(`vein ${v.id}: unknown part ${p.ref}`);
    }
    for (const b of v.bias) if (!([...BIOMES, 'river', 'ocean_edge', 'volcanic', 'any'] as string[]).includes(b)) err(`vein ${v.id}: bad bias ${b}`);
  }

  // Recipes: refs, heat, tools.
  for (const r of reg.recipes) {
    const m = machines.get(r.machine);
    if (!m) { err(`recipe ${r.id}: unknown machine ${r.machine}`); continue; }
    for (const st of [...r.inputs, ...r.outputs]) {
      if (!reg.item(st.id)) err(`recipe ${r.id}: unknown item ${st.id}`);
      if (!(st.n > 0)) err(`recipe ${r.id}: bad count for ${st.id}`);
    }
    for (const st of [...(r.fluidsIn ?? []), ...(r.fluidsOut ?? [])]) if (!reg.fluid(st.id)) err(`recipe ${r.id}: unknown fluid ${st.id}`);
    for (const k of r.keep ?? []) if (!reg.item(k)) err(`recipe ${r.id}: unknown kept item ${k}`);
    for (const t of r.tools ?? []) if (!TOOL_TYPES.includes(t)) err(`recipe ${r.id}: unknown tool ${t}`);
    if (r.minHeatK && (m.maxHeatK ?? 0) < r.minHeatK) err(`recipe ${r.id}: needs ${r.minHeatK} K, ${m.id} max ${m.maxHeatK ?? 0} K`);
    if (!r.outputs.length && !r.fluidsOut?.length) err(`recipe ${r.id}: no outputs`);
  }

  // Machine recipe conflicts (GT-style: same machine + same input set, counts ignored → need distinct circuits).
  // Hand recipes are picked explicitly from a list, so they can't conflict.
  const keys = new Map<string, string>();
  for (const r of reg.recipes) {
    if (r.machine === 'hand') continue;
    const k = [r.machine, r.circuit ?? 0, ...r.inputs.map((i) => i.id).sort(), '|', ...(r.fluidsIn ?? []).map((f) => f.id).sort(), '|', ...(r.keep ?? []).sort()].join(',');
    const prev = keys.get(k);
    if (prev) err(`recipe conflict: ${prev} vs ${r.id} (assign circuit numbers)`);
    else keys.set(k, r.id);
  }

  // ---- quests + loot ----
  const reach = reachable(reg);
  const structs = new Set(STRUCTURES.map((x) => x.id));
  dupes('quest', QUESTS.map((q) => q.id));
  for (const q of QUESTS) {
    for (const r of q.req) if (!QUEST.has(r)) err(`quest ${q.id}: unknown req ${r}`);
    for (const t of q.tasks) {
      if (t.k === 'build') { if (!structs.has(t.id)) err(`quest ${q.id}: unknown structure ${t.id}`); else if (!reach.has(`struct:${t.id}`)) err(`quest ${q.id}: struct:${t.id} unobtainable`); }
      else if (t.k === 'flag') { if (![...UI_FLAGS, ...SIM_FLAGS].includes(t.id as never)) err(`quest ${q.id}: unknown flag ${t.id}`); }
      else for (const id of t.ids) { if (!reg.item(id)) err(`quest ${q.id}: unknown item ${id}`); else if (t.ids.length === 1 && !reach.has(id)) err(`quest ${q.id}: ${id} unobtainable`); }
    }
    for (const [id] of q.reward.items ?? []) if (!reg.item(id)) err(`quest ${q.id}: unknown reward ${id}`);
    for (const [t] of q.reward.crates ?? []) if (!LOOT[t]) err(`quest ${q.id}: no ${t} crate`);
  }
  const depth = new Map<string, number>(), seen = new Set<string>();
  const d = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) { err(`quest cycle at ${id}`); return 0; }
    seen.add(id);
    const v = 1 + Math.max(-1, ...(QUEST.get(id)?.req ?? []).map(d));
    depth.set(id, v);
    return v;
  };
  QUESTS.forEach((q) => d(q.id));
  for (const [t, list] of Object.entries(LOOT)) for (const e of list ?? []) if (!reg.item(e.id)) err(`loot ${t}: unknown item ${e.id}`);

  // ---- coverage (warnings) ----
  const unreachable = reg.items.filter((i) => !reach.has(i.id)).map((i) => i.id);
  if (unreachable.length) warnings.push(`${unreachable.length} items not yet obtainable: ${summarize(unreachable)}`);

  const used = new Set<string>();
  for (const r of reg.recipes) {
    for (const i of r.inputs) used.add(i.id);
    for (const f of r.fluidsIn ?? []) used.add(f.id);
  }
  const unusedBp = new Set<string>();
  for (const mn of MINERALS) {
    for (const b of mn.byproducts) {
      const st = byproductStack(b);
      const id = st?.item?.id ?? st?.fluid?.id;
      if (id && !used.has(id)) unusedBp.add(id);
    }
    if (!used.has(mineralDust(mn)) && !MATERIALS.some((m) => `dust:${m.id}` === mineralDust(mn))) unusedBp.add(mineralDust(mn));
  }
  if (unusedBp.size) warnings.push(`${unusedBp.size} byproducts/mineral dusts without a use: ${summarize([...unusedBp])}`);
  const later = MINERALS.flatMap((m) => [m.product, ...m.byproducts]).filter((r) => r.startsWith('later:'));
  if (later.length) warnings.push(`later refs (content not yet added): ${[...new Set(later)].join(', ')}`);

  return { errors, warnings };
}

const summarize = (ids: string[], n = 12) => ids.slice(0, n).join(', ') + (ids.length > n ? ` … (+${ids.length - n})` : '');

/** Items reachable from world sources via recipes (tools must be reachable too). Machines are not yet gated. */
export function reachable(reg: Registry): Set<string> {
  // Crates come from quest rewards.
  const have = new Set<string>([...WORLD_ITEMS, ...CRATE_TIERS.map(crateId), ...WORLD_FLUIDS, ...reg.items.filter((i) => i.form === 'ore').map((i) => i.id)]);
  const tools = new Set<string>();
  const addTools = () => { for (const i of reg.items) if (i.tool && have.has(i.id)) tools.add(i.tool.type); };
  addTools();
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of reg.recipes) {
      const ok = r.inputs.every((i) => have.has(i.id)) && (r.fluidsIn ?? []).every((f) => have.has(f.id))
        && (r.keep ?? []).every((k) => have.has(k)) && (r.tools ?? []).every((t) => tools.has(t));
      if (!ok) continue;
      for (const o of [...r.outputs, ...(r.fluidsOut ?? [])]) if (!have.has(o.id)) { have.add(o.id); changed = true; }
    }
    if (changed) addTools();
  }
  return have;
}
