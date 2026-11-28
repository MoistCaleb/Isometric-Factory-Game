// Machine panel (DESIGN §5, P2d): status, multiblock auto-fill, fuel + heat, recipe pick, load/unload, progress,
// crank, outputs and tank. Live state streams from the sim while open (`sim.watch`).
import { SMOG } from '../sim/pollution';
import { useMemo, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Recipe } from '../content/types';
import { AMP_IN, BOIL_K, CELL_FLUIDS, BOILER_WATER, DIG_DEPTH, DIG_H, DIG_R, DIG_TICKS, FACE_NAMES, FUELS, MACHINE, SIDES, STEAM_BUF, STEAM_PER_POWER, THUMP_DEPTH, THUMP_R,
  THUMP_TICKS, OC_POWER, OC_SPEED, battOf, hatchW, XFMR_W, xfFront, WIND_FULL_B, LAKE_FLOW, MAINT, MAINT_LOSS } from '../data/machines';
import { STRUCTURES } from '../data/structures';
import { TIER_VOLTAGE, tierIndex } from '../data/tiers';
import { bufJ, inputW } from '../sim/power';
import { fmtJ, fmtW } from './format';
import type { MachView } from '../sim/client';
import { MS, MS_TEXT, flCap, issues, overclock, type MachCmd } from '../sim/machines';
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
  const all = useMemo(() => reg.machineRecipes(def.base ?? def.id).filter((x) => def.ehatch || tierIndex(x.tier) <= tierIndex(def.tier)), [def.id]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((x) => !n || [...x.inputs, ...x.outputs, ...(x.fluidsOut ?? []), ...(x.fluidsIn ?? [])]
      .some((s) => (reg.item(s.id)?.name ?? reg.fluid(s.id)?.name ?? s.id).toLowerCase().includes(n)))
      .sort((a, b) => Number(can(inv, b)) - Number(can(inv, a))).slice(0, 80);
  }, [all, q, inv]);
  if (!m) return <div class="panel mach"><div class="row"><b class="grow">{st.name}</b><button onClick={onClose}>✕</button></div><div class="dim">Gone.</div></div>;

  const boiler = def.run === 'boiler';
  const sv = def.survey ?? [THUMP_R, THUMP_DEPTH, THUMP_TICKS], dg = def.dig ?? [DIG_R, DIG_DEPTH, DIG_H, DIG_TICKS];
  const need = boiler ? BOIL_K : r ? r.minHeatK ?? def.heatK ?? 0 : def.heatK ?? 0;
  const cmd = (c: DistOmit<MachCmd, 'key'>) => onCmd({ ...c, key } as Cmd);
  const pct = r ? Math.min(100, (m.prog / r.ticks) * 100) : 0;
  const bad = [MS.full, MS.incomplete, MS.noWater, MS.dry, MS.minedOut].includes(m.st as 3), warn = [MS.noInput, MS.cold, MS.noFuel, MS.noSteam, MS.noWaterIn, MS.noSun, MS.noPower, MS.noWind, MS.noFlow, MS.coils, MS.hatchW, MS.tier].includes(m.st as 2);
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
      {(def.run === 'elec' || def.run === 'gen' || def.run === 'batt' || def.run === 'xfmr' || def.elec) && (
        <>
          <h3>Power</h3>
          {(def.run === 'elec' || def.elec) && <><div class="bar"><div style={{ width: `${Math.min(100, ((m.e ?? 0) / Math.max(1, bufJ(def, m))) * 100)}%`, background: '#f0d040' }} /></div>
            <div class="dim">Buffer {fmtJ(m.e ?? 0)} / {fmtJ(bufJ(def, m))} · in {fmtW(m.pw ?? 0)} (max {fmtW(inputW(def, m))} = {def.ehatch ? `${m.eh ?? 0} energy hatch${m.eh === 1 ? '' : 'es'}, 2 A each` : `${TIER_VOLTAGE[def.tier]} V × ${AMP_IN} A`}){r ? ` · recipe uses ${fmtW(r.power)}` : def.elec ? ` · uses ${fmtW(def.elec)}` : ''}</div>
            {r && overclock(def, m, r) > 0 && <div class="dim">⏩ Overclocked ×{overclock(def, m, r)}: {OC_SPEED ** overclock(def, m, r)}× speed at {fmtW(r.power * OC_POWER ** overclock(def, m, r))} ({def.ehatch ? 'its hatches are' : 'it is'} {overclock(def, m, r)} tier{overclock(def, m, r) > 1 ? 's' : ''} above the recipe).</div>}</>}
          {def.run === 'gen' && <div class="dim">Out {fmtW(m.pw ?? 0)} of {fmtW(def.gen ?? 0)} at {TIER_VOLTAGE[def.tier]} V{def.steam ? ` · uses up to ${def.steam} L/tick of steam, only as much as the cables draw` : ''}</div>}
          {view!.pw ? <div class="dim">Network: {view!.pw.v} V · {fmtW(view!.pw.w)} delivered of {fmtW(view!.pw.cap)} available · {view!.pw.a.toFixed(2)} A / {view!.pw.maxA} A max · cable loss {fmtW(view!.pw.loss)} · {view!.pw.cables} cable blocks</div>
            : <div class="dim">{def.run === 'gen' ? 'Not feeding any cable with a machine on it.' : 'No generator on its cables.'} {def.ehatch ? 'Cable its energy hatches to generators.' : 'Place tin cable touching it.'}</div>}
        </>
      )}
      {def.coilK && (
        <>
          <h3>Blast furnace</h3>
          <div class="dim">Cupronickel coils: {def.coilK} K{r?.minHeatK ? ` · recipe needs ${r.minHeatK} K` : ''}. Each energy hatch takes 2 A on its own line: LV {fmtW(hatchW('LV'))}, MV {fmtW(hatchW('MV'))}. Two LV hatches run MV-level recipes; MV hatches overclock LV recipes.{def.smoke ? ` Smoke ${def.smoke}/s while working.` : ''}</div>
        </>
      )}
      {def.maint && (
        <>
          <h3>Maintenance</h3>
          {issues(m) ? <>
            <div class="dim">{issues(m)} issue{issues(m) === 1 ? '' : 's'}: −{Math.round(issues(m) * MAINT_LOSS * 100)} % speed. Fix each with its tool from your tool slots.</div>
            <div class="row">{MAINT.map(([tool, what], i) => ((m.mt ?? 0) >> i) & 1 ? <button key={i} disabled={!inv.tools.some((t) => t?.id.startsWith(`tool:${tool}:`))} onClick={() => cmd({ k: 'mfix', i })}>{what} ({tool.replace('_', ' ')})</button> : null)}</div>
          </> : <div class="dim">All good. New issues turn up now and then while it works.</div>}
        </>
      )}
      {def.burns && (
        <>
          <h3>Fuel</h3>
          {meter(m.tank ? reg.fluid(m.tank.id)?.name ?? m.tank.id : 'Empty', m.tank?.n ?? 0, def.tank ?? 0, '#a07030')}
          <div class="row"><span class="dim grow">Burns {Object.entries(def.burns).map(([id, j]) => `${reg.fluid(id)?.name ?? id} (${j} J/L)`).join(', ')} — pipe it in or pour cells. Only as much as the cables draw.</span>
            {m.tank && <button onClick={() => cmd({ k: 'mdump' })}>Dump</button>}</div>
          {m.tank ? cells(m.tank.id, true) : Object.keys(def.burns).filter((id) => count(inv, `cell:${id}`) > 0).map((id) => cells(id, true))}
        </>
      )}
      {def.ambient && <div class="dim">{def.ambient === 'sun' ? 'Follows the sun: full output at noon, less in rain, nothing at night.'
        : def.ambient === 'wind' ? `Follows the wind (top bar). Height ×${Math.min(1, 0.3 + (0.7 * Number(key.split(',')[2])) / WIND_FULL_B).toFixed(2)}: full at block level ${WIND_FULL_B} (storey ${WIND_FULL_B / 3}).`
        : `Beside a river: full output, more in rain. Beside a lake: ${Math.round(LAKE_FLOW * 100)} %.`}</div>}
      {def.run === 'batt' && (() => {
        const B = battOf(def), n = m.inp[B.empty] ?? 0, bw = TIER_VOLTAGE[def.tier];
        return <>
          <h3>Batteries</h3>
          <div class="bar"><div style={{ width: `${n ? Math.min(100, ((m.e ?? 0) / (n * B.j)) * 100) : 0}%`, background: '#f0d040' }} /></div>
          <div class="dim">{n} / {def.slots} batteries ({reg.item(B.empty)?.name.replace(/ \(empty\)$/, '')}) · stored {fmtJ(m.e ?? 0)} of {fmtJ(n * B.j)} · {(m.pw ?? 0) >= 0 ? `charging ${fmtW(m.pw ?? 0)}` : `supplying ${fmtW(-(m.pw ?? 0))}`} (max {fmtW(n * bw)})</div>
          <div class="row">
            {[B.full, B.empty].map((id) => <button key={id} disabled={!count(inv, id)} onClick={() => cmd({ k: 'mbat', put: id })}>Insert {id === B.empty ? 'empty' : 'charged'} ({count(inv, id)})</button>)}
            <button disabled={!n} onClick={() => cmd({ k: 'mbat' })}>Take one</button>
          </div>
          <div class="dim">Charges from spare generator output, supplies its network when generators fall short (1 A at {bw} V = {fmtW(bw)} per battery). A battery taken out comes out charged if a full battery's worth ({fmtJ(B.j)}) is stored.</div>
        </>;
      })()}
      {def.run === 'xfmr' && (
        <>
          <h3>Transformer</h3>
          <div class="bar"><div style={{ width: `${Math.min(100, ((m.e ?? 0) / XFMR_W) * 100)}%`, background: '#f0d040' }} /></div>
          <div class="dim">{m.up ? 'Step-up' : 'Step-down'}: {m.up ? `low sides in at ${TIER_VOLTAGE.LV} V → ${SIDES[xfFront(ent.r)]} (front) out at ${TIER_VOLTAGE.MV} V` : `${SIDES[xfFront(ent.r)]} (front) in at ${TIER_VOLTAGE.MV} V → other sides out at ${TIER_VOLTAGE.LV} V`} · passing {fmtW(m.pw ?? 0)} of {fmtW(XFMR_W)}</div>
          <div class="row"><button onClick={() => cmd({ k: 'mxf' })}>Switch to {m.up ? 'step-down' : 'step-up'}</button></div>
          <div class="dim">The front face is the {TIER_VOLTAGE.MV} V side. Anything rated {TIER_VOLTAGE.LV} V on that side explodes, tin cable melts — use copper there. The low side can draw {XFMR_W / TIER_VOLTAGE.LV} A: more than a tin cable carries.</div>
        </>
      )}
      {def.run === 'thump' && (
        <>
          <h3>Survey</h3>
          <div class="bar"><div style={{ width: `${m.cur ? 100 : (m.prog / sv[2]) * 100}%` }} /></div>
          <div class="dim">{def.steam ? 'Thumps' : 'Listens'} for {sv[2] / 20} s, then surveys every vein within {sv[0]} tiles down to layer {sv[1]} (see the vein overlay, O). Once per spot.</div>
        </>
      )}
      {def.run === 'dig' && (
        <>
          <h3>Excavation</h3>
          <div class="bar"><div style={{ width: `${Math.min(100, (m.prog / (dg[3] * (1 + dg[2]))) * 100)}%` }} /></div>
          <div class="dim">{m.st === MS.minedOut ? 'Done' : `Layer ${Math.min(dg[1], 1 + Math.floor((m.cur ?? 0) / (2 * dg[0] + 1) ** 2))} of ${dg[1]}`} · mines ore of hardness ≤ {dg[2]} in the {2 * dg[0] + 1}×{2 * dg[0] + 1} square below it; leaves the rock. Pipe the ore away.</div>
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
          <div class="dim">{r.ticks / 20} s{r.minHeatK ? ` · ${r.minHeatK} K` : ''}{r.keep ? (r.wear ? ` · catalyst kept, wears out ${Math.round(r.wear * 100)} % per run` : ' · mold is kept') : ''}</div>
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
      {!store && (Object.keys(m.out).length > 0 || (m.tank && !boiler && !def.burns)) && <h3>Output</h3>}
      {!store && Object.keys(m.out).length > 0 && (
        <div class="row"><span class="io grow">{bag(m.out).map((s) => <Chip key={s.id} st={s} onLook={onLook} />)}</span>
          <button class="primary" onClick={() => cmd({ k: 'mtake' })}>Collect</button></div>
      )}
      {m.tank && !boiler && !store && !def.burns && (
        <div class="row"><span class="io grow"><Chip st={m.tank} fluid /> <span class="dim">/ {def.tank} L</span></span>
          <button onClick={() => cmd({ k: 'mdump' })} title="Pour it away (or connect a pipe)">Dump</button></div>
      )}
      {m.tank && !boiler && !store && !def.burns && cells(m.tank.id, false)}

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
