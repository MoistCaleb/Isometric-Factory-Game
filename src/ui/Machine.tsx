// Machine panel (DESIGN §5, P2d): status, multiblock auto-fill, fuel + heat, recipe pick, load/unload, progress,
// crank, outputs and tank. Live state streams from the sim while open (`sim.watch`).
import { SMOG } from '../sim/pollution';
import { useMemo, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Recipe } from '../content/types';
import { AMP_IN, BOIL_K, CELL_FLUIDS, BOILER_WATER, DIG_DEPTH, DIG_H, DIG_R, DIG_TICKS, FACE_NAMES, FUELS, MACHINE, SIDES, STEAM_BUF, STEAM_PER_POWER, THUMP_DEPTH, THUMP_R,
  THUMP_TICKS } from '../data/machines';
import { STRUCTURES } from '../data/structures';
import { TIER_VOLTAGE } from '../data/tiers';
import { bufJ, inputW } from '../sim/power';
import { fmtJ, fmtW } from './format';
import type { MachView } from '../sim/client';
import { MS, MS_TEXT, flCap, type MachCmd } from '../sim/machines';
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
  /** Pollution in this machine's chunk (P3e). */
  poll?: number;
  onCmd: (c: Cmd) => void; onLook: (l: Look) => void; onClose: () => void;
}

export function Machine({ ent, view, inv, poll = 0, onCmd, onLook, onClose }: Props) {
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
  const bad = [MS.full, MS.incomplete, MS.noWater, MS.dry, MS.minedOut].includes(m.st as 3), warn = [MS.noInput, MS.cold, MS.noFuel, MS.noSteam, MS.noWaterIn, MS.noSun, MS.noPower].includes(m.st as 2);
  const meter = (label: string, n: number, cap: number, col: string) => (
    <><div class="bar"><div style={{ width: `${Math.min(100, (n / cap) * 100)}%`, background: col }} /></div>
      <div class="dim">{label}: {Math.round(n)} / {cap} L</div></>
  );
  const fuels = Object.keys(FUELS).filter((id) => count(inv, id) > 0);
  // Missing casings grouped by structure (P3d: several casing kinds) and required hatches.
  const missBy = new Map<string, number>();
  for (const [, id] of view!.miss) missBy.set(id, (missBy.get(id) ?? 0) + 1);
  const chest = def.run === 'store', barrel = def.run === 'tank', store = chest || barrel;
  const invIds = chest ? [...new Set(inv.inv.flatMap((sl) => (sl ? [sl.id] : [])))] : [];
  const faces = m.faces ?? [0, 0, 0, 0, 0, 0];
  const fl = Object.entries(m.fl ?? {});
  /** Cell buttons for a fluid (P4b): pour full cells in (inputs, barrels) and fill empty cells. */
  const cells = (id: string, pour: boolean) => {
    if (!CELL_FLUIDS.includes(id)) return null;
    const full = count(inv, `cell:${id}`), empty = count(inv, 'cell:empty');
    if (!(pour && full) && !empty) return null;
    return (
      <div class="row">
        {pour && full > 0 && <button onClick={() => cmd({ k: 'mcell', id })}>Pour {full} × {reg.item(`cell:${id}`)?.name}</button>}
        {empty > 0 && <button onClick={() => cmd({ k: 'mcell', id, fill: true })}>Fill cells ({empty} empty)</button>}
      </div>
    );
  };

  return (
    <div class="panel mach">
      <div class="row">
        <b class="grow">{st.name}</b>
        {!store && <span class={`mst ${bad ? 'bad' : warn ? 'warn' : m.st === MS.working ? 'ok' : ''}`}>{MS_TEXT[m.st]}</span>}
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      {poll >= SMOG && !boiler && def.run !== 'store' && def.run !== 'tank' && <div class="warn">☁ Smog here ({Math.round(poll)}): machines in this area run 25 % slower. Spread out your furnaces and boilers.</div>}
      {view!.blocked.length > 0 && <div class="dim">Inner chamber must be empty: clear {view!.blocked.length} tile(s) above the controller.</div>}
      {view!.miss.length > 0 && (
        <div class="row">
          <span class="dim grow">Multiblock — missing (ghosted): {[...missBy].map(([id, n]) => `${n} × ${STRUCT.get(id)?.name ?? id} (have ${count(inv, `struct:${id}`)})`).join(' · ')}</span>
          <button onClick={() => cmd({ k: 'mfill' })}>Auto-fill</button>
        </div>
      )}
      {view!.need.length > 0 && <div class="dim">Needs hatches on its outer casing: {view!.need.map((id) => STRUCT.get(id)?.name ?? id).join(', ')}. Place them on ghosted outer tiles before Auto-fill, or swap out a top casing.</div>}
      {st.multi?.hatches && <div class="dim">Pipes connect only through its hatches. Rotation: the controller's front faces the way you placed it.</div>}

      {boiler && (
        <>
          <h3>Water → Steam</h3>
          {meter('Water', m.water ?? 0, def.waterTank ?? BOILER_WATER, '#3070d0')}
          {meter('Steam', m.tank?.n ?? 0, def.tank ?? 0, '#d0d0d0')}
          {cells('water', true)}
          <div class="dim">Up to {def.rate} L/tick of steam at {def.maxHeatK} K{def.fuelUse ? `, burning fuel ${def.fuelUse}× as fast` : ''}{def.solar ? ', heated by sunlight (none at night, less in rain)' : ''}. Pipe water in and steam out (bronze pipes). Never let it run dry while hot.</div>
        </>
      )}
      {(def.run === 'steam' || def.steam) && (
        <>
          <h3>Steam</h3>
          {meter('Buffer', m.steam ?? 0, STEAM_BUF, '#d0d0d0')}
          <div class="dim">{r ? `Uses ${r.power * STEAM_PER_POWER} L/tick while working. ` : def.steam ? `Uses ${def.steam} L/tick while working. ` : ''}Connect a bronze pipe from a boiler.</div>
        </>
      )}
      {(def.run === 'elec' || def.run === 'gen' || def.elec) && (
        <>
          <h3>Power</h3>
          {def.run !== 'gen' && <><div class="bar"><div style={{ width: `${Math.min(100, ((m.e ?? 0) / bufJ(def)) * 100)}%`, background: '#f0d040' }} /></div>
            <div class="dim">Buffer {fmtJ(m.e ?? 0)} / {fmtJ(bufJ(def))} · in {fmtW(m.pw ?? 0)} (max {fmtW(inputW(def))} = {TIER_VOLTAGE[def.tier]} V × {AMP_IN} A){r ? ` · recipe uses ${fmtW(r.power)}` : def.elec ? ` · uses ${fmtW(def.elec)}` : ''}</div></>}
          {def.run === 'gen' && <div class="dim">Out {fmtW(m.pw ?? 0)} of {fmtW(def.gen ?? 0)} at {TIER_VOLTAGE[def.tier]} V{def.steam ? ` · uses up to ${def.steam} L/tick of steam, only as much as the cables draw` : ''}</div>}
          {view!.pw ? <div class="dim">Network: {view!.pw.v} V · {fmtW(view!.pw.w)} delivered of {fmtW(view!.pw.cap)} available · {view!.pw.a.toFixed(2)} A / {view!.pw.maxA} A max · cable loss {fmtW(view!.pw.loss)} · {view!.pw.cables} cable blocks</div>
            : <div class="dim">{def.run === 'gen' ? 'Not feeding any cable with a machine on it.' : 'No generator on its cables.'} Place tin cable touching it.</div>}
        </>
      )}
      {def.run === 'thump' && (
        <>
          <h3>Survey</h3>
          <div class="bar"><div style={{ width: `${m.cur ? 100 : (m.prog / THUMP_TICKS) * 100}%` }} /></div>
          <div class="dim">Thumps for {THUMP_TICKS / 20} s, then surveys every vein within {THUMP_R} tiles down to layer {THUMP_DEPTH} (see the vein overlay, O). Once per spot.</div>
        </>
      )}
      {def.run === 'dig' && (
        <>
          <h3>Excavation</h3>
          <div class="bar"><div style={{ width: `${Math.min(100, (m.prog / (DIG_TICKS * (1 + DIG_H))) * 100)}%` }} /></div>
          <div class="dim">{m.st === MS.minedOut ? 'Done' : `Layer ${Math.min(DIG_DEPTH, 1 + Math.floor((m.cur ?? 0) / (2 * DIG_R + 1) ** 2))} of ${DIG_DEPTH}`} · mines ore of hardness ≤ {DIG_H} in the {2 * DIG_R + 1}×{2 * DIG_R + 1} square below it; leaves the rock. Pipe the ore away.</div>
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
          {m.tank ? cells(m.tank.id, false) : CELL_FLUIDS.filter((id) => count(inv, `cell:${id}`) > 0).map((id) => cells(id, true))}
        </>
      )}
      {def.run === 'pump' && <div class="dim">Pumps {def.rate} L/tick of water from the next tile{def.steam ? ` for ${def.steam} L/tick of steam` : ''}{def.elec ? ` for ${fmtW(def.elec)}` : ''}. Pipe it away.</div>}

      {(def.run === 'fuel' || boiler) && (
        <>
          <h3>Heat</h3>
          <div class="bar"><div style={{ width: `${Math.min(100, (m.heat / (def.maxHeatK ?? 1)) * 100)}%`, background: m.heat >= need ? '#e08030' : '#806040' }} />
            <i style={{ left: `${(need / (def.maxHeatK ?? 1)) * 100}%` }} /></div>
          <div class="dim">{Math.round(m.heat)} K · needs {need} K · max {def.maxHeatK} K{m.burn > 0 && !def.solar ? ` · burning ${Math.ceil(m.burn / 20 / (def.fuelUse ?? 1))} s` : ''}{def.smoke ? ` · smoke ${def.smoke}/s while burning` : ''}</div>
          {!def.solar && <><div class="io">
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
          </div></>}
        </>
      )}

      {all.length > 0 && <h3>Recipe</h3>}
      {r && !pick && (
        <div class="card">
          <div class="io">
            {r.inputs.map((s) => <Chip key={s.id} st={s} bad={(m.inp[s.id] ?? 0) < s.n} onLook={onLook} />)}
            {r.fluidsIn?.map((s) => <Chip key={s.id} st={s} fluid bad={(m.fl?.[s.id] ?? 0) < s.n} />)}
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

      {fl.length > 0 && (
        <>
          <h3>Fluids</h3>
          {fl.map(([id, n]) => {
            const input = !!r?.fluidsIn?.some((f) => f.id === id);
            return (
              <div key={id}>
                <div class="row"><span class="io grow"><Chip st={{ id, n: Math.round(n) }} fluid /> <span class="dim">/ {flCap(def)} L · {input ? 'input' : 'output'}</span></span>
                  <button onClick={() => cmd({ k: 'mdump', id })} title="Pour it away (toxic fluids and gases pollute)">Dump</button></div>
                {cells(id, input)}
              </div>
            );
          })}
        </>
      )}
      {r?.fluidsIn?.filter((f) => !m.fl?.[f.id] && count(inv, `cell:${f.id}`) > 0).map((f) => <div key={f.id}>{cells(f.id, true)}</div>)}
      {!store && (Object.keys(m.out).length > 0 || (m.tank && !boiler)) && <h3>Output</h3>}
      {!store && Object.keys(m.out).length > 0 && (
        <div class="row"><span class="io grow">{bag(m.out).map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}</span>
          <button class="primary" onClick={() => cmd({ k: 'mtake' })}>Collect</button></div>
      )}
      {m.tank && !boiler && !store && (
        <div class="row"><span class="io grow"><Chip st={m.tank} fluid /> <span class="dim">/ {def.tank} L</span></span>
          <button onClick={() => cmd({ k: 'mdump' })} title="Pour it away (or connect a pipe)">Dump</button></div>
      )}
      {m.tank && !boiler && !store && cells(m.tank.id, false)}

      <div class="row"><button onClick={() => setSides(!sides)}>{sides ? '▾' : '▸'} Sides (pipes, cables)</button>
        {!sides && faces.some(Boolean) && <span class="dim">{faces.filter(Boolean).length} set</span>}</div>
      {sides && (
        <>
          <div class="faces">
            {SIDES.map((n, i) => (
              <button key={n} class={faces[i] ? 'on' : ''} onClick={() => cmd({ k: 'mface', face: i, mode: (faces[i] + 1) % 4 })}>{n}: {FACE_NAMES[faces[i]]}</button>
            ))}
          </div>
          <div class="dim">Tap to cycle. <b>Auto</b>: {chest ? 'takes items in' : 'takes what it needs, sends out what it makes'} · <b>In</b> only · <b>Out</b> only · <b>Off</b>: ignores pipes and cables on that side. Compass sides (north = up on the map).</div>
        </>
      )}
    </div>
  );
}
