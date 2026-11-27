// Quest book (DESIGN §8, P2e): visual tree per tier chapter; tap a quest for its tasks, progress and reward.
import { useMemo, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import { crateId } from '../data/loot';
import { QUEST, QUESTS, type QuestDef } from '../data/quests';
import { TIER_NAME, TIERS, type TierId } from '../data/tiers';
import type { Inv } from '../sim/player';
import { builtCounts, QCLAIMED, QDONE, taskProgress, unlocked } from '../sim/quests';
import type { Ent } from '../sim/state';
import { Chip, type Look } from './Recipes';

const NW = 136, NH = 44, CW = 164, RH = 56, PAD = 8;
const CHAPTERS = TIERS.slice(0, 6);

/** Column = depth in the req graph; rows ordered by the mean row of their reqs (fewer crossing edges). */
function layout(list: QuestDef[]) {
  const depth = new Map<string, number>();
  const d = (q: QuestDef): number => depth.get(q.id) ?? (depth.set(q.id, 1 + Math.max(-1, ...q.req.map((r) => d(QUEST.get(r)!)))), depth.get(q.id)!);
  const cols: QuestDef[][] = [];
  list.forEach((q) => (cols[d(q)] ??= []).push(q));
  const row = new Map<string, number>(), pos = new Map<string, [number, number]>();
  const mean = (q: QuestDef) => { const r = q.req.map((id) => row.get(id) ?? 0); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0; };
  cols.forEach((col, c) => [...col].sort((a, b) => mean(a) - mean(b)).forEach((q, i) => { row.set(q.id, i); pos.set(q.id, [PAD + c * CW, PAD + i * RH]); }));
  return { pos, w: PAD * 2 + (cols.length - 1) * CW + NW, h: PAD * 2 + (Math.max(...cols.map((c) => c.length)) - 1) * RH + NH };
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
  const [ch, setCh] = useState<TierId>('P');
  const list = useMemo(() => QUESTS.filter((q) => q.chapter === ch), [ch]);
  const { pos, w, h } = useMemo(() => layout(list), [list]);
  const built = useMemo(() => builtCounts(ents), [ents]);
  const [selId, setSel] = useState<string>(() => list.find((q) => quests[q.id] === QDONE)?.id ?? list.find((q) => !quests[q.id] && unlocked(q, quests))?.id ?? list[0]?.id);
  const sel = QUEST.get(selId);
  const reg = registry();
  const state = (q: QuestDef) => quests[q.id] === QCLAIMED ? 'claimed' : quests[q.id] === QDONE ? 'done' : unlocked(q, quests) ? 'open' : 'locked';
  const n = list.filter((q) => quests[q.id]).length;

  return (
    <div class="quests">
      <div class="row rhead">
        <b>Quest book</b>
        <span class="tabs row">
          {CHAPTERS.map((t) => <button key={t} class={t === ch ? 'on' : ''} disabled={!QUESTS.some((q) => q.chapter === t)} onClick={() => setCh(t)}>{TIER_NAME[t]}</button>)}
        </span>
        <span class="grow" />
        <span class="dim">{n}/{list.length}</span>
        <button onClick={onClose} title="Close (L)">✕</button>
      </div>
      <div class="qbody">
      <div class="qtree">
        <div style={{ position: 'relative', width: `${w}px`, height: `${h}px` }}>
          <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }}>
            {list.flatMap((q) => q.req.map((r) => {
              const a = pos.get(r), b = pos.get(q.id);
              if (!a || !b) return null;
              const x0 = a[0] + NW, y0 = a[1] + NH / 2, x1 = b[0], y1 = b[1] + NH / 2, mx = (x0 + x1) / 2;
              return <path key={`${r}-${q.id}`} d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`} class={quests[r] ? 'qedge on' : 'qedge'} />;
            }))}
          </svg>
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
          {state(sel) === 'locked' && <div class="dim">Needs: {sel.req.filter((r) => !quests[r]).map((r) => QUEST.get(r)?.title).join(', ')}</div>}
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
