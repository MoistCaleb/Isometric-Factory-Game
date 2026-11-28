// Recipe browser v1 (DESIGN §8): search `#form $material @machine t:tier -exclude`, recipes (R) / uses (U),
// bookmarks + history (localStorage), hand crafting from the 27-slot inventory with tools from the tool slots.
import { useMemo, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { ItemDef, Recipe, Stack } from '../content/types';
import { MACHINES } from '../data/machines';
import { MATERIALS } from '../data/materials';
import { MINERALS } from '../data/minerals';
import { WORLD_ITEMS } from '../data/misc';
import { TIERS } from '../data/tiers';
import { bestTool, count, missing, type Inv } from '../sim/player';

export type Look = { id: string; tab: 'recipes' | 'uses' };
export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const MACH = new Map(MACHINES.map((m) => [m.id, m]));
const MAT = new Map(MATERIALS.map((m) => [m.id, m]));
const MIN = new Map(MINERALS.map((m) => [m.id, m]));

const load = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? '[]'); } catch { return []; } };
const save = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

function tierOf(i: ItemDef): string {
  if (i.material) return MAT.get(i.material)?.tier ?? 'P';
  if (i.mineral) return TIERS[MIN.get(i.mineral)?.hardness ?? 0];
  return 'P';
}

/** Search query → item predicate. Tokens AND together. */
export function matcher(q: string): (i: ItemDef) => boolean {
  const reg = registry();
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  const tests = toks.map((t): ((i: ItemDef) => boolean) => {
    const neg = t.startsWith('-') && t.length > 1;
    const s = neg ? t.slice(1) : t;
    let f: (i: ItemDef) => boolean;
    if (s.startsWith('$')) { const v = s.slice(1); f = (i) => !!i.material && (i.material.includes(v) || (MAT.get(i.material)?.name.toLowerCase().includes(v) ?? false)) || (!!i.mineral && i.mineral.includes(v)); }
    else if (s.startsWith('@')) {
      const v = s.slice(1);
      const ids = new Set(MACHINES.filter((m) => m.id.includes(v) || m.name.toLowerCase().includes(v)).map((m) => m.id));
      f = (i) => reg.recipesFor(i.id).some((r) => ids.has(r.machine));
    } else if (s.startsWith('#')) { const v = s.slice(1); f = (i) => (i.form ?? i.kind).includes(v) || (i.tool?.type.includes(v) ?? false); }
    else if (s.startsWith('t:')) { const v = s.slice(2); f = (i) => tierOf(i).toLowerCase() === v; }
    else f = (i) => i.name.toLowerCase().includes(s) || i.id.includes(s);
    return neg ? (i) => !f(i) : f;
  });
  return (i) => tests.every((t) => t(i));
}

export function Chip({ st, fluid, bad, onLook }: { st: Stack; fluid?: boolean; bad?: boolean; onLook?: (l: Look) => void }) {
  const reg = registry();
  const d = fluid ? reg.fluid(st.id) : reg.item(st.id);
  return (
    <span class={`chip ${bad ? 'bad' : ''}`} onClick={() => !fluid && onLook?.({ id: st.id, tab: 'recipes' })}
      onDblClick={() => !fluid && onLook?.({ id: st.id, tab: 'uses' })} title={st.id}>
      <span class="sw" style={{ background: hex(d?.color ?? 0x888888), borderRadius: fluid ? '50%' : undefined }} />
      {fluid ? `${st.n} L` : `${st.n}×`} {d?.name ?? st.id}{st.chance !== undefined ? ` (${Math.round(st.chance * 100)}%)` : ''}
    </span>
  );
}

function Card({ r, inv, onLook, onCraft }: { r: Recipe; inv: Inv; onLook: (l: Look) => void; onCraft: (id: string, n: number) => void }) {
  const hand = r.machine === 'hand';
  const miss = hand ? missing(inv, r) : null;
  const extra = [r.circuit && `circuit ${r.circuit}`, r.minHeatK && `${r.minHeatK} K`, r.ticks && `${r.ticks / 20} s`, r.power && `${r.power} W`].filter(Boolean).join(' · ');
  return (
    <div class="card">
      <div class="dim cardhead">{MACH.get(r.machine)?.name ?? r.machine} <span class="tier">{r.tier}</span>{extra && ` · ${extra}`}</div>
      <div class="io">
        {r.inputs.map((st) => <Chip key={st.id} st={st} bad={hand && count(inv, st.id) < st.n} onLook={onLook} />)}
        {r.fluidsIn?.map((st) => <Chip key={st.id} st={st} fluid />)}
        {r.keep?.map((k) => <Chip key={k} st={{ id: k, n: 1 }} bad={hand && count(inv, k) < 1} onLook={onLook} />)}
        {r.tools?.map((t) => <span key={t} class={`chip tool ${bestTool(inv, t) ? '' : 'bad'}`}>🔧 {t.replace('_', ' ')}</span>)}
        <span class="arrow">→</span>
        {r.outputs.map((st) => <Chip key={st.id} st={st} onLook={onLook} />)}
        {r.fluidsOut?.map((st) => <Chip key={st.id} st={st} fluid />)}
      </div>
      {hand && (
        <div class="row craftrow">
          {[1, 4, 16].map((n) => <button key={n} disabled={!!miss} onClick={() => onCraft(r.id, n)}>Craft ×{n}</button>)}
          {miss && <span class="dim">missing: {miss.join(', ')}</span>}
        </div>
      )}
    </div>
  );
}

interface Props { inv: Inv; look: Look | null; onLook: (l: Look | null) => void; onCraft: (id: string, n: number) => void; onClose: () => void; onFlag?: (f: 'search' | 'bookmark') => void; onPlan?: (id: string) => void }

export function Recipes({ inv, look, onLook, onCraft, onClose, onFlag, onPlan }: Props) {
  const reg = registry();
  const [q, setQ] = useState('');
  const [craftable, setCraftable] = useState(true);
  const [marks, setMarks] = useState(() => load('bookmarks'));
  const [hist, setHist] = useState(() => load('history'));

  const go = (l: Look | null) => {
    if (l) { const h = [l.id, ...hist.filter((x) => x !== l.id)].slice(0, 16); setHist(h); save('history', h); }
    onLook(l);
  };
  const toggleMark = (id: string) => {
    const m = marks.includes(id) ? marks.filter((x) => x !== id) : [id, ...marks];
    setMarks(m); save('bookmarks', m); onFlag?.('bookmark');
  };

  const results = useMemo(() => {
    const f = matcher(q);
    let items = reg.items.filter(f);
    if (craftable) {
      const ok = new Set(reg.recipes.filter((r) => r.machine === 'hand' && !missing(inv, r)).flatMap((r) => r.outputs.map((o) => o.id)));
      items = items.filter((i) => ok.has(i.id));
    }
    return items.slice(0, 200);
  }, [q, craftable, inv]);

  const item = look ? reg.item(look.id) : undefined;
  const list = look ? (look.tab === 'recipes' ? reg.recipesFor(look.id) : reg.usesOf(look.id)) : [];
  const row = (ids: string[]) => ids.map((id) => reg.item(id)).filter(Boolean).map((i) => (
    <button key={i!.id} class="pick" onClick={() => go({ id: i!.id, tab: 'recipes' })} title={i!.name}>
      <span class="sw" style={{ background: hex(i!.color) }} />{i!.name}
    </button>
  ));

  return (
    <div class="recipes">
      <div class="rhead row">
        {look && <button onClick={() => go(null)} title="Back to search">←</button>}
        <input type="search" placeholder="Search  #form $material @machine t:tier -exclude" value={q}
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); onLook(null); onFlag?.('search'); }} />
        {!look && <label class="dim"><input type="checkbox" checked={craftable} onChange={() => setCraftable(!craftable)} /> craftable</label>}
        <button onClick={onClose} title="Close (C)">✕</button>
      </div>
      {!look && (
        <div class="rbody">
          {!q && marks.length > 0 && <><h3>★ Bookmarks</h3><div class="picks">{row(marks)}</div></>}
          {!q && hist.length > 0 && <><h3>Recent</h3><div class="picks">{row(hist)}</div></>}
          <h3>{craftable ? 'Craftable now' : 'Items'} ({results.length}{results.length === 200 ? '+' : ''})</h3>
          <div class="picks">{row(results.map((i) => i.id))}</div>
          {!results.length && <div class="dim">{craftable ? 'Nothing craftable yet — gather sticks (trees), fibre (grass) and flint (gravel, dirt). Untick "craftable" to browse everything.' : 'No matches'}</div>}
        </div>
      )}
      {look && item && (
        <div class="rbody">
          <div class="row ititle">
            <span class="sw big" style={{ background: hex(item.color) }} />
            <b>{item.name}</b><span class="dim">{tierOf(item)} · have {count(inv, item.id)}</span>
            <span class="grow" />
            {onPlan && reg.recipesFor(item.id).length > 0 && <button onClick={() => onPlan(item.id)} title="Plan a production line for this">📐</button>}
            <button class={marks.includes(item.id) ? 'on' : ''} onClick={() => toggleMark(item.id)} title="Bookmark">★</button>
          </div>
          <div class="row tabs">
            <button class={look.tab === 'recipes' ? 'on' : ''} onClick={() => go({ id: item.id, tab: 'recipes' })}>Recipes (R) {reg.recipesFor(item.id).length}</button>
            <button class={look.tab === 'uses' ? 'on' : ''} onClick={() => go({ id: item.id, tab: 'uses' })}>Uses (U) {reg.usesOf(item.id).length}</button>
          </div>
          {list.slice(0, 60).map((r) => <Card key={r.id} r={r} inv={inv} onLook={go} onCraft={onCraft} />)}
          {!list.length && <div class="dim">{look.tab === 'uses' ? 'No uses yet.' : WORLD_ITEMS.includes(item.id) || item.form === 'ore' ? 'Gathered or mined from the world.' : 'No recipe yet.'}</div>}
        </div>
      )}
    </div>
  );
}
