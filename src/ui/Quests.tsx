// Quest book (DESIGN §8, P2e): visual tree per chapter — tier chapters (the main path) and topic chapters (power, mining, …,
// laid out in tier columns); tap a quest for its tasks, progress and reward.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import { crateId } from '../data/loot';
import { QUEST, QUESTS, TOPICS, reqIds, tierOf, type ChapterId, type QuestDef } from '../data/quests';
import { TIER_NAME, TIERS, tierIndex } from '../data/tiers';
import type { Inv } from '../sim/player';
import { builtCounts, QCLAIMED, QDONE, taskProgress, unlocked } from '../sim/quests';
import type { Ent } from '../sim/state';
import { Chip, type Look } from './Recipes';

const NW = 136, NH = 44, CW = 164, RH = 56, PAD = 8;
const TIER_CH = TIERS.slice(0, 6);
const TOPIC_NAME = Object.fromEntries(TOPICS) as Record<string, string>;
const chName = (c: ChapterId) => TOPIC_NAME[c] ?? TIER_NAME[c as keyof typeof TIER_NAME];
const BAND = 18;

/** Column = depth in the req graph (reqs in this chapter only — a chapter starts where the others leave off); topic
 * chapters start each tier in a fresh column band. Rows ordered by the mean row of their reqs (fewer crossing edges). */
function layout(list: QuestDef[], topic: boolean) {
  const depth = new Map<string, number>(), base = new Map<string, number>();
  const inCh = (q: QuestDef) => reqIds(q).map((r) => QUEST.get(r)!).filter((x) => x.chapter === q.chapter);
  const d = (q: QuestDef): number => depth.get(q.id) ?? (depth.set(q.id, Math.max(base.get(tierOf(q)) ?? 0, 1 + Math.max(-1, ...inCh(q).map(d)))), depth.get(q.id)!);
  const tiers = [...new Set(list.map(tierOf))].sort((a, b) => tierIndex(a) - tierIndex(b));
  let next = 0;
  for (const t of tiers) { base.set(t, next); for (const q of list) if (tierOf(q) === t) next = Math.max(next, d(q) + 1); }
  const cols: QuestDef[][] = [];
  list.forEach((q) => (cols[d(q)] ??= []).push(q));
  const top = topic ? BAND : 0, row = new Map<string, number>(), pos = new Map<string, [number, number]>();
  const mean = (q: QuestDef) => { const r = reqIds(q).map((id) => row.get(id) ?? 0); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0; };
  cols.forEach((col, c) => [...col].sort((a, b) => mean(a) - mean(b)).forEach((q, i) => { row.set(q.id, i); pos.set(q.id, [PAD + c * CW, top + PAD + i * RH]); }));
  const bands = topic ? tiers.map((t) => ({ t, x: PAD + base.get(t)! * CW })) : [];
  return { pos, bands, w: PAD * 2 + Math.max(0, cols.length - 1) * CW + NW, h: top + PAD * 2 + (Math.max(1, ...cols.map((c) => c.length)) - 1) * RH + NH };
}

/** Paragraph with **bold** spans. */
const rich = (t: string) => t.split('**').map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x));

/** Claimable rewards (top bar badge). */
export const claimable = (q: Record<string, number> | undefined) => Object.values(q ?? {}).filter((v) => v === QDONE).length;

interface Props {
  quests: Record<string, number>; flags: Record<string, number>; inv: Inv; ents: Record<string, Ent>;
  onClaim: (id: string) => void; onLook: (l: Look) => void; onClose: () => void;
}

export function Quests({ quests, flags, inv, ents, onClaim, onLook, onClose }: Props) {
  const [ch, setCh] = useState<ChapterId>('P');
  const topic = !TIER_CH.includes(ch as never);
  const list = useMemo(() => QUESTS.filter((q) => q.chapter === ch), [ch]);
  const { pos, bands, w, h } = useMemo(() => layout(list, topic), [list]);
  const built = useMemo(() => builtCounts(ents), [ents]);
  const [selId, setSel] = useState<string>(() => list.find((q) => quests[q.id] === QDONE)?.id ?? list.find((q) => !quests[q.id] && unlocked(q, quests))?.id ?? list[0]?.id);
  useEffect(() => { if (QUEST.get(selId)?.chapter !== ch) setSel(list.find((q) => quests[q.id] === QDONE || (!quests[q.id] && unlocked(q, quests)))?.id ?? list[0]?.id); }, [ch]);
  const sel = QUEST.get(selId);
  const reg = registry();
  const state = (q: QuestDef) => quests[q.id] === QCLAIMED ? 'claimed' : quests[q.id] === QDONE ? 'done' : unlocked(q, quests) ? 'open' : 'locked';
  const n = list.filter((q) => quests[q.id]).length;
  /** Quest title, with its chapter when it lives in another one. */
  const where = (id: string) => { const q = QUEST.get(id)!; return q.chapter === ch ? q.title : `${q.title} (${chName(q.chapter)})`; };

  return (
    <div class="quests">
      <div class="row rhead">
        <b>Quest book</b>
        <span class="tabs row">
          {TIER_CH.map((t) => <button key={t} class={t === ch ? 'on' : ''} disabled={!QUESTS.some((q) => q.chapter === t)} onClick={() => setCh(t)}>{TIER_NAME[t]}</button>)}
          <span class="tabsep" />
          {TOPICS.map(([t, name]) => {
            const n = QUESTS.filter((q) => q.chapter === t).length;
            return <button key={t} class={t === ch ? 'on' : ''} disabled={!n} title={n ? undefined : 'Opens later'} onClick={() => setCh(t)}>{name}</button>;
          })}
        </span>
        <span class="grow" />
        <span class="dim">{n}/{list.length}</span>
        <button onClick={onClose} title="Close (L)">✕</button>
      </div>
      <div class="qbody">
      <div class="qtree">
        <div style={{ position: 'relative', width: `${w}px`, height: `${h}px` }}>
          <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }}>
            {list.flatMap((q) => q.req.flatMap((g) => (typeof g === 'string' ? [g] : g).map((r) => {
              const a = pos.get(r), b = pos.get(q.id);
              if (!a || !b) return null;
              const x0 = a[0] + NW, y0 = a[1] + NH / 2, x1 = b[0], y1 = b[1] + NH / 2, mx = (x0 + x1) / 2;
              return <path key={`${r}-${q.id}`} d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`} class={`qedge${quests[r] ? ' on' : ''}${typeof g === 'string' ? '' : ' any'}`} />;
            })))}
          </svg>
          {bands.map(({ t, x }) => <div key={t} class="qband" style={{ left: `${x}px` }}>{TIER_NAME[t]}</div>)}
          {list.map((q) => {
            const [x, y] = pos.get(q.id)!, st = state(q);
            return (
              <button key={q.id} class={`qnode ${st} ${q.id === selId ? 'sel' : ''}`} style={{ left: `${x}px`, top: `${y}px`, width: `${NW}px`, height: `${NH}px` }}
                onClick={() => setSel(q.id)}>
                {st === 'claimed' ? '✔ ' : st === 'done' ? '🎁 ' : st === 'locked' ? '🔒 ' : ''}{q.title}
              </button>
            );
          })}
        </div>
      </div>
      {sel && (
        <div class="qinfo">
          <div class="row"><b class="grow">{sel.title}</b>
            {state(sel) === 'done' && <button class="primary" onClick={() => onClaim(sel.id)}>Claim reward</button>}
            {state(sel) === 'claimed' && <span class="dim">Claimed</span>}
          </div>
          {sel.text.map((p, i) => <p key={i} class="qtext">{rich(p)}</p>)}
          {state(sel) === 'locked' && <div class="dim">Needs: {sel.req.filter((r) => (typeof r === 'string' ? !quests[r] : !r.some((x) => quests[x])))
            .map((r) => (typeof r === 'string' ? where(r) : `any one of ${r.map(where).join(' / ')}`)).join(', ')}</div>}
          <h3>Tasks</h3>
          {sel.tasks.map((t, i) => {
            const [a, b] = taskProgress(t, { ...inv, flags }, built), ok = !!quests[sel.id] || a >= b;
            return (
              <div key={i} class="row qtask">
                <span class="grow">{ok ? '✔' : '○'} {t.k === 'build' ? `Build: ${reg.item(`struct:${t.id}`)?.name ?? t.id}` : t.k === 'flag' ? t.label : t.label ?? reg.item(t.ids[0])?.name ?? t.ids[0]}</span>
                {t.k === 'have' && t.ids.length === 1 && <Chip st={{ id: t.ids[0], n: t.n }} onLook={onLook} />}
                {t.k !== 'flag' && <span class={ok ? 'ok' : 'dim'}>{Math.min(a, b)}/{b}</span>}
              </div>
            );
          })}
          <h3>Reward</h3>
          <div class="io">
            {sel.reward.crates?.map(([t, k]) => <Chip key={t} st={{ id: crateId(t), n: k }} onLook={onLook} />)}
            {sel.reward.items?.map(([id, k]) => <Chip key={id} st={{ id, n: k }} onLook={onLook} />)}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
