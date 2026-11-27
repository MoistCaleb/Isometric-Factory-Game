// Machine panel (DESIGN §5, P2d): status, multiblock auto-fill, fuel + heat, recipe pick, load/unload, progress,
// crank, outputs and tank. Live state streams from the sim while open (`sim.watch`).
import { useMemo, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Recipe } from '../content/types';
import { BOIL_K, BOILER_WATER, FACE_NAMES, FUELS, MACHINE, SIDES, STEAM_BUF, STEAM_PER_POWER } from '../data/machines';
import { STRUCTURES } from '../data/structures';
import type { MachView } from '../sim/client';
import { MS, MS_TEXT, type MachCmd } from '../sim/machines';
import { slotsUsed } from '../sim/pipes';
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
  const [sides, setSides] = useState(false);
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

  const boiler = def.run === 'boiler';
  const need = boiler ? BOIL_K : r ? r.minHeatK ?? def.heatK ?? 0 : def.heatK ?? 0;
  const cmd = (c: DistOmit<MachCmd, 'key'>) => onCmd({ ...c, key } as Cmd);
  const pct = r ? Math.min(100, (m.prog / r.ticks) * 100) : 0;
  const bad = [MS.full, MS.incomplete, MS.noWater, MS.dry].includes(m.st as 3), warn = [MS.noInput, MS.cold, MS.noFuel, MS.noSteam, MS.noWaterIn].includes(m.st as 2);
  const meter = (label: string, n: number, cap: number, col: string) => (
    <><div class="bar"><div style={{ width: `${Math.min(100, (n / cap) * 100)}%`, background: col }} /></div>
      <div class="dim">{label}: {Math.round(n)} / {cap} L</div></>
  );
  const fuels = Object.keys(FUELS).filter((id) => count(inv, id) > 0);
  const casing = st.multi && STRUCT.get(st.multi.casing);
  const chest = def.run === 'store', barrel = def.run === 'tank', store = chest || barrel;
  const invIds = chest ? [...new Set(inv.inv.flatMap((sl) => (sl ? [sl.id] : [])))] : [];
  const faces = m.faces ?? [0, 0, 0, 0, 0, 0];

  return (
    <div class="panel mach">
      <div class="row">
        <b class="grow">{st.name}</b>
        {!store && <span class={`mst ${bad ? 'bad' : warn ? 'warn' : m.st === MS.working ? 'ok' : ''}`}>{MS_TEXT[m.st]}</span>}
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      {view!.blocked.length > 0 && <div class="dim">Inner chamber must be empty: clear {view!.blocked.length} tile(s) above the controller.</div>}
      {view!.miss.length > 0 && casing && (
        <div class="row">
          <span class="dim grow">Multiblock: {view!.miss.length} × {casing.name} missing (ghosted) · have {count(inv, `struct:${casing.id}`)}</span>
          <button onClick={() => cmd({ k: 'mfill' })}>Auto-fill</button>
        </div>
      )}

      {boiler && (
        <>
          <h3>Water → Steam</h3>
          {meter('Water', m.water ?? 0, BOILER_WATER, '#3070d0')}
          {meter('Steam', m.tank?.n ?? 0, def.tank ?? 0, '#d0d0d0')}
          <div class="dim">Up to {def.rate} L/tick of steam when hot. Pipe water in and steam out (bronze pipes). Never let it run dry while hot.</div>
        </>
      )}
      {def.run === 'steam' && (
        <>
          <h3>Steam</h3>
          {meter('Buffer', m.steam ?? 0, STEAM_BUF, '#d0d0d0')}
          <div class="dim">{r ? `Uses ${r.power * STEAM_PER_POWER} L/tick while working. ` : ''}Connect a bronze pipe from a boiler.</div>
        </>
      )}
      {chest && (
        <>
          <h3>Contents · {slotsUsed(m.out)} / {def.slots} slots</h3>
          <div class="row"><span class="io grow">{bag(m.out).map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}
            {!Object.keys(m.out).length && <span class="dim">Empty</span>}</span>
            {Object.keys(m.out).length > 0 && <button class="primary" onClick={() => cmd({ k: 'mtake' })}>Take all</button>}</div>
          <div class="dim">Put in (a stack per tap):</div>
          <div class="io put">{invIds.map((id) => <button key={id} onClick={() => cmd({ k: 'cput', id, n: 64 })}>+ {reg.item(id)?.name ?? id}</button>)}
            {!invIds.length && <span class="dim">Inventory empty</span>}</div>
          <div class="dim">Item pipes fill it from any side; set a side to Out to send its items on down a pipe.</div>
        </>
      )}
      {barrel && (
        <>
          <h3>Tank</h3>
          {meter(m.tank ? reg.fluid(m.tank.id)?.name ?? m.tank.id : 'Empty', m.tank?.n ?? 0, def.tank ?? 0, '#3070d0')}
          <div class="row"><span class="dim grow">Buffers one fluid from a pipe network: takes what's spare, gives it back when needed. Wood: no steam or molten metal.</span>
            {m.tank && <button onClick={() => cmd({ k: 'mdump' })}>Dump</button>}</div>
        </>
      )}
      {def.run === 'pump' && <div class="dim">Pumps {def.rate} L/tick of water from the next tile. Pipe it away.</div>}

      {(def.run === 'fuel' || boiler) && (
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

      {all.length > 0 && <h3>Recipe</h3>}
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
      {!pick && all.length > 0 && <div class="row"><button onClick={() => setPick(true)}>{r ? 'Change recipe' : 'Pick recipe'} ({all.length})</button></div>}
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

      {!store && (Object.keys(m.out).length > 0 || (m.tank && !boiler)) && <h3>Output</h3>}
      {!store && Object.keys(m.out).length > 0 && (
        <div class="row"><span class="io grow">{bag(m.out).map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}</span>
          <button class="primary" onClick={() => cmd({ k: 'mtake' })}>Collect</button></div>
      )}
      {m.tank && !boiler && !store && (
        <div class="row"><span class="io grow"><Chip st={m.tank} fluid /> <span class="dim">/ {def.tank} L</span></span>
          <button onClick={() => cmd({ k: 'mdump' })} title="Pour it away (or connect a pipe)">Dump</button></div>
      )}

      <div class="row"><button onClick={() => setSides(!sides)}>{sides ? '▾' : '▸'} Sides (pipes)</button>
        {!sides && faces.some(Boolean) && <span class="dim">{faces.filter(Boolean).length} set</span>}</div>
      {sides && (
        <>
          <div class="faces">
            {SIDES.map((n, i) => (
              <button key={n} class={faces[i] ? 'on' : ''} onClick={() => cmd({ k: 'mface', face: i, mode: (faces[i] + 1) % 4 })}>{n}: {FACE_NAMES[faces[i]]}</button>
            ))}
          </div>
          <div class="dim">Tap to cycle. <b>Auto</b>: {chest ? 'takes items in' : 'takes what it needs, sends out what it makes'} · <b>In</b> only · <b>Out</b> only · <b>Off</b>: ignores pipes on that side. Compass sides (north = up on the map).</div>
        </>
      )}
    </div>
  );
}
