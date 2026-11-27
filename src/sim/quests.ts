// Quest book + loot crates (DESIGN §8, P2e). s.quests: id → 1 done (reward unclaimed) · 2 claimed.
// Completion is checked every second for unlocked quests; progress is pure so the UI can show it from its own copies.
import { registry } from '../content/registry';
import { CRATE_ROLLS, crateId, LOOT, LUCKY } from '../data/loot';
import { QUEST, QUESTS, type QuestDef, type QuestTask } from '../data/quests';
import { TIERS, type TierId } from '../data/tiers';
import type { Stack } from '../content/types';
import type { ActResult, Inv } from './player';
import { give, STACK, take } from './player';
import { next } from './rng';
import { TPS, type GameState } from './state';

export type QuestCmd = { k: 'qclaim'; id: string } | { k: 'open'; id: string };
export const QDONE = 1, QCLAIMED = 2;

/** Held count: inventory + tool slots. */
export const held = (s: Inv, id: string) => [...s.inv, ...s.tools].reduce((a, sl) => a + (sl?.id === id ? sl.n : 0), 0);

/** Structures placed, by structure id. */
export function builtCounts(ents: GameState['ents']): Record<string, number> {
  const c: Record<string, number> = {};
  for (const e of Object.values(ents)) c[e.s] = (c[e.s] ?? 0) + 1;
  return c;
}

/** [have, need] for a task. */
export type QView = Inv & { flags: Record<string, number> };
export const taskProgress = (t: QuestTask, s: QView, built: Record<string, number>): [number, number] =>
  t.k === 'flag' ? [s.flags[t.id] ? 1 : 0, 1] : [t.k === 'build' ? built[t.id] ?? 0 : t.ids.reduce((a, id) => a + held(s, id), 0), t.n];

export const unlocked = (q: QuestDef, done: Record<string, number>) => q.req.every((r) => !!done[r]);
const complete = (q: QuestDef, inv: QView, built: Record<string, number>) => q.tasks.every((t) => { const [a, b] = taskProgress(t, inv, built); return a >= b; });

/** Marks newly completed quests; returns their ids. Chains resolve in one pass (order = definition order). */
export function checkQuests(s: GameState): string[] {
  let built: Record<string, number> | null = null;
  const out: string[] = [];
  for (const q of QUESTS) {
    if (s.quests[q.id] || !unlocked(q, s.quests)) continue;
    built ??= builtCounts(s.ents);
    if (complete(q, s, built)) { s.quests[q.id] = QDONE; out.push(q.id); }
  }
  return out;
}

export function stepQuests(s: GameState) {
  if (s.tick % TPS === 0) checkQuests(s);
}

/** Inventory room for a set of stacks (each needs its own slot unless it tops up an existing one). */
function fits(s: GameState, stacks: [string, number][]): boolean {
  let free = s.inv.filter((x) => !x).length + s.tools.filter((x) => !x).length;
  for (const [id, n] of stacks) {
    const room = s.inv.reduce((a, sl) => a + (sl?.id === id ? STACK - sl.n : 0), 0);
    if (n > room) free -= Math.ceil((n - room) / STACK);
  }
  return free >= 0;
}

function roll(s: GameState, tier: TierId): Stack {
  let t = tier;
  const up = TIERS[TIERS.indexOf(tier) + 1];
  if (up && LOOT[up] && next(s) < LUCKY) t = up;
  const list = LOOT[t]!, tot = list.reduce((a, e) => a + e.w, 0);
  let r = next(s) * tot;
  const e = list.find((x) => (r -= x.w) < 0) ?? list[list.length - 1];
  return { id: e.id, n: e.n[0] + Math.floor(next(s) * (e.n[1] - e.n[0] + 1)) };
}

export function questCmd(s: GameState, c: QuestCmd): ActResult {
  if (c.k === 'qclaim') {
    const q = QUEST.get(c.id);
    if (!q) return { ok: false, msg: 'Unknown quest' };
    if (!s.quests[q.id]) checkQuests(s);
    if (s.quests[q.id] === QCLAIMED) return { ok: false, msg: 'Already claimed' };
    if (s.quests[q.id] !== QDONE) return { ok: false, msg: 'Not complete yet' };
    const r: [string, number][] = [...(q.reward.crates ?? []).map(([t, n]): [string, number] => [crateId(t), n]), ...(q.reward.items ?? [])];
    if (!fits(s, r)) return { ok: false, msg: 'Make room in your inventory' };
    for (const [id, n] of r) give(s, id, n);
    s.quests[q.id] = QCLAIMED;
    return { ok: true, gained: r.map(([id, n]) => ({ id, n })), quests: { [q.id]: QCLAIMED } };
  }
  const tier = TIERS.find((t) => crateId(t) === c.id);
  if (!tier || !LOOT[tier]) return { ok: false, msg: 'Not a crate' };
  if (!s.inv.some((x) => x?.id === c.id)) return { ok: false, msg: 'No crate' };
  if (s.inv.filter((x) => !x).length + s.tools.filter((x) => !x).length < CRATE_ROLLS) return { ok: false, msg: `Need ${CRATE_ROLLS} free slots` };
  take(s, c.id, 1);
  const gained: Stack[] = [];
  for (let i = 0; i < CRATE_ROLLS; i++) {
    const st = roll(s, tier), left = give(s, st.id, st.n);
    if (st.n - left > 0) gained.push({ id: st.id, n: st.n - left });
  }
  return { ok: true, gained, msg: `Opened ${registry().item(c.id)?.name}` };
}
