// Machine panel (DESIGN §5, P2d): status, multiblock auto-fill, fuel + heat, recipe pick, load/unload, progress,
// crank, outputs and tank. Live state streams from the sim while open (`sim.watch`).
import { useMemo, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Recipe } from '../content/types';
import { FUELS, MACHINE } from '../data/machines';
import { STRUCTURES } from '../data/structures';
import type { MachView } from '../sim/client';
import { MS, MS_TEXT, type MachCmd } from '../sim/machines';
import { count, type Cmd, type Inv } from '../sim/player';
import type { Ent } from '../sim/state';
import { Chip, type Look } from './Recipes';

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const STRUCT = new Map(STRUCTURES.map((s) => [s.id, s]));
const bag = (b: Record<string, number>) => Object.entries(b).map(([id, n]) => ({ id, n }));
const can = (inv: Inv, r: Recipe) => r.inputs.every((i) => count(inv, i.id) >= i.n);

interface Props {
  ent: Ent; view: MachView | null; inv: Inv;
  onCmd: (c: Cmd) => void; onLook: (l: Look) => void; onClose: () => void;
}

export function Machine({ ent, view, inv, onCmd, onLook, onClose }: Props) {
  const reg = registry();
  const st = STRUCT.get(ent.s)!, def = MACHINE.get(st.machine!)!;
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState('');
  const m = view?.m, key = view?.key ?? '';
  const r = m?.rec ? reg.recipe(m.rec) : undefined;
  const all = useMemo(() => reg.machineRecipes(def.id), [def.id]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((x) => !n || [...x.inputs, ...x.outputs, ...(x.fluidsOut ?? []), ...(x.fluidsIn ?? [])]
      .some((s) => (reg.item(s.id)?.name ?? reg.fluid(s.id)?.name ?? s.id).toLowerCase().includes(n)))
      .sort((a, b) => Number(can(inv, b)) - Number(can(inv, a))).slice(0, 80);
  }, [all, q, inv]);
  if (!m) return <div class="panel mach"><div class="row"><b class="grow">{st.name}</b><button onClick={onClose}>✕</button></div><div class="dim">Gone.</div></div>;

  const need = r ? r.minHeatK ?? def.heatK ?? 0 : def.heatK ?? 0;
  const cmd = (c: DistOmit<MachCmd, 'key'>) => onCmd({ ...c, key } as Cmd);
  const pct = r ? Math.min(100, (m.prog / r.ticks) * 100) : 0;
  const bad = [MS.full, MS.incomplete, MS.noWater].includes(m.st as 3), warn = [MS.noInput, MS.cold, MS.noFuel].includes(m.st as 2);
  const fuels = Object.keys(FUELS).filter((id) => count(inv, id) > 0);
  const casing = st.multi && STRUCT.get(st.multi.casing);

  return (
    <div class="panel mach">
      <div class="row">
        <b class="grow">{st.name}</b>
        <span class={`mst ${bad ? 'bad' : warn ? 'warn' : m.st === MS.working ? 'ok' : ''}`}>{MS_TEXT[m.st]}</span>
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      {view!.miss.length > 0 && casing && (
        <div class="row">
          <span class="dim grow">Multiblock: {view!.miss.length} × {casing.name} missing (ghosted) · have {count(inv, `struct:${casing.id}`)}</span>
          <button onClick={() => cmd({ k: 'mfill' })}>Auto-fill</button>
        </div>
      )}

      {def.run === 'fuel' && (
        <>
          <h3>Heat</h3>
          <div class="bar"><div style={{ width: `${Math.min(100, (m.heat / (def.maxHeatK ?? 1)) * 100)}%`, background: m.heat >= need ? '#e08030' : '#806040' }} />
            <i style={{ left: `${(need / (def.maxHeatK ?? 1)) * 100}%` }} /></div>
          <div class="dim">{Math.round(m.heat)} K · needs {need} K · max {def.maxHeatK} K{m.burn > 0 ? ` · burning ${Math.ceil(m.burn / 20)} s` : ''}</div>
          <div class="io">
            {bag(m.fuel).map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}
            {!Object.keys(m.fuel).length && <span class="dim">No fuel loaded</span>}
          </div>
          <div class="row">
            {fuels.map((id) => (
              <button key={id} onClick={() => cmd({ k: 'mfuel', id, n: 8 })} title={`${FUELS[id][0]} K · ${FUELS[id][1] / 20} s each`}>
                + {reg.item(id)?.name} ×{Math.min(8, count(inv, id))}
              </button>
            ))}
            {!fuels.length && <span class="dim">Fuel: straw, sticks, planks, logs, charcoal, coal, coke</span>}
          </div>
        </>
      )}

      <h3>Recipe</h3>
      {r && !pick && (
        <div class="card">
          <div class="io">
            {r.inputs.map((s) => <Chip key={s.id} st={s} bad={(m.inp[s.id] ?? 0) < s.n} onLook={onLook} />)}
            {r.fluidsIn?.map((s) => <Chip key={s.id} st={s} fluid bad={m.tank?.id !== s.id || m.tank.n < s.n} />)}
            {r.keep?.map((k) => <Chip key={k} st={{ id: k, n: 1 }} bad={!m.inp[k]} onLook={onLook} />)}
            {r.tools?.map((t) => <span key={t} class="chip tool">🔧 {t}</span>)}
            <span class="arrow">→</span>
            {r.outputs.map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}
            {r.fluidsOut?.map((s) => <Chip key={s.id} st={s} fluid />)}
          </div>
          <div class="dim">{r.ticks / 20} s{r.minHeatK ? ` · ${r.minHeatK} K` : ''}{r.keep ? ' · mold is kept' : ''}</div>
        </div>
      )}
      {!pick && <div class="row"><button onClick={() => setPick(true)}>{r ? 'Change recipe' : 'Pick recipe'} ({all.length})</button></div>}
      {pick && (
        <>
          <div class="row">
            <input placeholder="Filter by item…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <button onClick={() => setPick(false)}>Cancel</button>
          </div>
          <ul class="vlist">
            {list.map((x) => (
              <li key={x.id} class={can(inv, x) ? '' : 'dim'} onClick={() => { cmd({ k: 'mrec', recipe: x.id }); setPick(false); }}>
                <span class="io">
                  {x.inputs.map((s) => <Chip key={s.id} st={s} />)}{x.fluidsIn?.map((s) => <Chip key={s.id} st={s} fluid />)}
                  <span class="arrow">→</span>
                  {x.outputs.map((s) => <Chip key={s.id} st={s} />)}{x.fluidsOut?.map((s) => <Chip key={s.id} st={s} fluid />)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r && !pick && (
        <>
          <h3>Input</h3>
          <div class="io">
            {bag(m.inp).map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}
            {!Object.keys(m.inp).length && <span class="dim">Empty</span>}
          </div>
          <div class="row">
            {(r.inputs.length > 0 || r.keep) && [1, 8].map((n) => <button key={n} onClick={() => cmd({ k: 'mload', n })}>Load ×{n}</button>)}
            <button onClick={() => cmd({ k: 'munload' })}>Unload</button>
          </div>
          <h3>Progress</h3>
          <div class="bar"><div style={{ width: `${pct}%` }} /></div>
          {def.run === 'crank' && (
            <div class="row"><button class="primary" disabled={m.st !== MS.crank} onClick={() => cmd({ k: 'crank' })}>
              {def.id === 'anvil' ? '🔨 Strike' : '⟳ Crank'}</button><span class="dim">each press = 1 s of work</span></div>
          )}
        </>
      )}

      {(Object.keys(m.out).length > 0 || m.tank) && <h3>Output</h3>}
      {Object.keys(m.out).length > 0 && (
        <div class="row"><span class="io grow">{bag(m.out).map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}</span>
          <button class="primary" onClick={() => cmd({ k: 'mtake' })}>Collect</button></div>
      )}
      {m.tank && (
        <div class="row"><span class="io grow"><Chip st={m.tank} fluid /> <span class="dim">/ {def.tank} L</span></span>
          <button onClick={() => cmd({ k: 'mdump' })} title="Pour it away (barrels + pipes arrive with steam)">Dump</button></div>
      )}
    </div>
  );
}
