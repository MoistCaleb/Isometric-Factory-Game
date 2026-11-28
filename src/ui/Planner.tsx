// Planner / ratio calculator (DESIGN §8, P5f).
import { useMemo, useState } from 'preact/hooks';
import { plan, sketch, totals, type Choice, type PlanNode } from '../content/planner';
import { registry } from '../content/registry';
import { MACHINE } from '../data/machines';
import type { TierId } from '../data/tiers';
import type { Cmd } from '../sim/player';
import { hex, matcher } from './Recipes';
import { fmt } from './Stats';

const reg = () => registry();
const UP_TO: TierId[] = ['P', 'S', 'LV', 'MV'];
const nameOf = (id: string) => reg().item(id)?.name ?? reg().fluid(id)?.name ?? id;
const isFluid = (id: string) => !reg().item(id) && !!reg().fluid(id);
const colorOf = (id: string) => reg().item(id)?.color ?? reg().fluid(id)?.color ?? 0x888888;
const per = (id: string) => (isFluid(id) ? 'L/min' : '/min');
const machName = (m: string) => (m === 'hand' ? 'by hand' : MACHINE.get(m)?.name ?? m);
const Sw = ({ id }: { id: string }) => <span class="sw" style={{ background: hex(colorOf(id)), borderRadius: isFluid(id) ? '50%' : undefined }} />;

function Row({ n, depth, choice, onPick }: { n: PlanNode; depth: number; choice: Choice; onPick: (id: string, v: string) => void }) {
  const opts = [...n.options.map((r) => r.id), 'raw'];
  const cur = n.recipe?.id ?? (n.raw === 'chosen' ? 'raw' : undefined);
  const cycle = () => { if (opts.length > 1) onPick(n.id, opts[(opts.indexOf(cur ?? 'raw') + 1) % opts.length]); };
  return (
    <>
      <div class="prow" style={{ paddingLeft: `${depth * 12}px` }}>
        <span class="pname"><Sw id={n.id} /> {nameOf(n.id)}</span>
        <span class="num">{fmt(n.rate)} {per(n.id)}</span>
        <button class={`pmach ${n.recipe ? '' : 'dim'}`} disabled={opts.length < 2} onClick={cycle}
          title={opts.length > 1 ? `Tap: next of ${opts.length - 1} recipe(s), then raw` : 'Only source'}>
          {n.recipe ? <>{machName(n.recipe.machine)}{n.machines !== undefined && <b> ×{fmt(n.machines)}</b>}{n.w ? ` · ${fmt(n.w)} W` : n.steam ? ` · ${fmt(n.steam)} L/s steam` : ''}</>
            : n.raw === 'world' ? 'world' : n.raw === 'loop' ? 'loop → raw' : n.raw === 'chosen' ? 'raw' : n.raw}
          {opts.length > 1 && ' ⟳'}
        </button>
      </div>
      {n.kids.map((k, i) => <Row key={k.id + i} n={k} depth={depth + 1} choice={choice} onPick={onPick} />)}
    </>
  );
}

export function Planner({ start, onCmd, onClose }: { start: string | null; onCmd: (c: Cmd) => void; onClose: () => void }) {
  const [id, setId] = useState<string | null>(start);
  const [q, setQ] = useState('');
  const [rate, setRate] = useState(60);
  const [choice, setChoice] = useState<Choice>({});
  const [upTo, setUpTo] = useState<TierId>('MV');
  const results = useMemo(() => {
    if (!q) return [];
    const f = matcher(q), lq = q.toLowerCase();
    return [...reg().items.filter(f).map((i) => i.id), ...reg().fluids.filter((fl) => fl.name.toLowerCase().includes(lq)).map((fl) => fl.id)]
      .filter((x) => reg().recipesFor(x).length).slice(0, 40);
  }, [q]);
  const root = useMemo(() => (id ? plan(id, rate, choice, upTo) : null), [id, rate, choice, upTo]);
  const tot = useMemo(() => (root ? totals(root) : null), [root]);
  const pickRecipe = (pid: string, v: string) => setChoice((c) => ({ ...c, [pid]: v }));
  return (
    <div class="panel planner">
      <div class="row">
        <h3 class="grow">📐 Planner</h3>
        <button onClick={onClose}>✕</button>
      </div>
      <div class="row">
        <input type="search" placeholder="Item or fluid to make…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      {q && (
        <div class="picks">
          {results.map((r) => <button key={r} class="pick" onClick={() => { setId(r); setQ(''); setChoice({}); }}><Sw id={r} />{nameOf(r)}</button>)}
          {!results.length && <span class="dim">No craftable matches</span>}
        </div>
      )}
      {root && tot && (
        <>
          <div class="row">
            <Sw id={root.id} /><b class="grow">{nameOf(root.id)}</b>
            <input class="rate" type="number" min={0.1} step={1} value={rate} onInput={(e) => setRate(Math.max(0.01, Number((e.target as HTMLInputElement).value) || 0))} />
            <span class="dim">{per(root.id)}</span>
            <select value={upTo} onChange={(e) => { setUpTo((e.target as HTMLSelectElement).value as TierId); setChoice({}); }} title="Prefer the most advanced recipes up to this tier">
              {UP_TO.map((t) => <option key={t} value={t}>≤ {t}</option>)}
            </select>
          </div>
          <div class="ptree"><Row n={root} depth={0} choice={choice} onPick={pickRecipe} /></div>
          <h3>Machines</h3>
          {[...tot.steps.values()].map((s) => <div key={s.r.id} class="prow"><span class="pname">{machName(s.r.machine)}</span><span class="num">{Math.ceil(s.machines - 1e-9)}</span><span class="dim">({fmt(s.machines)} busy)</span></div>)}
          {!tot.steps.size && <div class="dim">Hand-crafted only.</div>}
          <div class="dim">Power ≈ {fmt(tot.w)} W{tot.steam ? ` · steam ${fmt(tot.steam)} L/s` : ''} (average, base speed)</div>
          <h3>Raw inputs</h3>
          {[...tot.raw].map(([r, n]) => <div key={r} class="prow"><span class="pname"><Sw id={r} /> {nameOf(r)}</span><span class="num">{fmt(n)} {per(r)}</span></div>)}
          {tot.by.size > 0 && <h3>Byproducts</h3>}
          {[...tot.by].map(([r, n]) => <div key={r} class="prow"><span class="pname"><Sw id={r} /> {nameOf(r)}</span><span class="num">{fmt(n)} {per(r)}</span></div>)}
          <div class="row">
            <button class="primary" disabled={!tot.steps.size} onClick={() => onCmd({ k: 'bpsave', bp: sketch(root, `Plan: ${nameOf(root.id)} ${fmt(rate)}/min`) })}
              title="Save a blueprint: a row of machines per step, recipes set">Sketch blueprint</button>
          </div>
        </>
      )}
      {!root && <div class="dim">Search for something to make, or tap 📐 on an item in the recipe browser.</div>}
    </div>
  );
}
