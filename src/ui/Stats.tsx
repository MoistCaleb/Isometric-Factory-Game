// Statistics panel (DESIGN §8, P5f): power, pollution and per-item made/used charts from the sim's sampled history.
import { useEffect, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { SimClient } from '../sim/client';
import type { Hist, Sample } from '../sim/stats';
import { hex } from './Recipes';

const C_A = '#338ced', C_B = '#e76624';
const W = 320, H = 110, PAD_L = 4, PAD_T = 8, PAD_B = 16;

export const fmt = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(1)}k` : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
const nice = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 5, 10].map((m) => m * p).find((x) => x >= v)!; };

interface Series { name: string; color: string; v: number[] }
/** Line chart: one shared y-axis from 0, x = samples (oldest left), crosshair readout on hover. */
function Chart({ series, every, unit }: { series: Series[]; every: number; unit: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const n = Math.max(2, ...series.map((s) => s.v.length)), top = nice(Math.max(0, ...series.flatMap((s) => s.v)));
  const x = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - 2), y = (v: number) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B);
  const sec = (n - 1) * every, span = sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`;
  const move = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    setHi(Math.max(0, Math.min(n - 1, Math.round((((e.clientX - r.left) / r.width) * W - PAD_L) / ((W - PAD_L - 2) / (n - 1))))));
  };
  return (
    <div class="chart">
      <div class="legend">
        {series.length > 1 && series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        <span class="grow" />
        <span class="dim">{hi !== null ? `${Math.round(((n - 1 - hi) * every) / 60 * 10) / 10} min ago: ${series.map((s) => `${fmt(s.v[hi] ?? 0)}`).join(' / ')} ${unit}` : `max ${fmt(top)} ${unit}`}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerLeave={() => setHi(null)}>
        {[0.5, 1].map((f) => <line key={f} x1={PAD_L} x2={W} y1={y(top * f)} y2={y(top * f)} class="grid" />)}
        <line x1={PAD_L} x2={W} y1={y(0)} y2={y(0)} class="axis" />
        {series.map((s) => s.v.length > 1 && (
          <polyline key={s.name} fill="none" stroke={s.color} stroke-width={2} stroke-linejoin="round" stroke-linecap="round"
            points={s.v.map((v, i) => `${x(i + n - s.v.length)},${y(v)}`).join(' ')} />
        ))}
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={PAD_T} y2={y(0)} class="cross" />}
        {hi !== null && series.map((s) => s.v[hi] !== undefined && <circle key={s.name} cx={x(hi)} cy={y(s.v[hi])} r={4} fill={s.color} stroke="#181c22" stroke-width={2} />)}
        <text x={PAD_L} y={H - 3} class="tick">−{span}</text>
        <text x={W - 2} y={H - 3} class="tick" text-anchor="end">now</text>
      </svg>
    </div>
  );
}

/** Tiny made-vs-used trend for the item table. */
function Spark({ a, b }: { a: number[]; b: number[] }) {
  const n = Math.max(2, a.length), top = Math.max(1e-9, ...a, ...b);
  const pts = (v: number[]) => v.map((q, i) => `${(i / (n - 1)) * 60},${17 - (q / top) * 15}`).join(' ');
  return <svg class="spark" viewBox="0 0 60 18"><polyline fill="none" stroke={C_A} stroke-width={1.5} points={pts(a)} /><polyline fill="none" stroke={C_B} stroke-width={1.5} points={pts(b)} /></svg>;
}

export function Stats({ sim, onClose }: { sim: SimClient; onClose: () => void }) {
  const [h, setH] = useState<Hist | null>(null);
  const [long, setLong] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    sim.onHist = setH; sim.hist();
    const t = setInterval(() => sim.hist(), 2000);
    return () => { clearInterval(t); sim.onHist = undefined; };
  }, [sim]);
  const reg = registry();
  const list: Sample[] = h ? (long ? h.long : h.short) : [], every = h ? h.every[long ? 1 : 0] : 10, perMin = 60 / every;
  const ids = [...new Set(list.flatMap((s) => [...Object.keys(s.made), ...Object.keys(s.used)]))];
  const avg = (id: string, k: 'made' | 'used') => (list.reduce((a, s) => a + (s[k][id] ?? 0), 0) / Math.max(1, list.length)) * perMin;
  const rows = ids.map((id) => ({ id, made: avg(id, 'made'), used: avg(id, 'used') })).sort((a, b) => b.made + b.used - a.made - a.used);
  const ser = (id: string, k: 'made' | 'used') => list.map((s) => (s[k][id] ?? 0) * perMin);
  const name = (id: string) => reg.item(id)?.name ?? reg.fluid(id)?.name ?? id, fluid = (id: string) => !reg.item(id) && !!reg.fluid(id);
  return (
    <div class="panel stats">
      <div class="row">
        <h3 class="grow">📈 Statistics</h3>
        <button class={!long ? 'on' : ''} onClick={() => setLong(false)}>10 min</button>
        <button class={long ? 'on' : ''} onClick={() => setLong(true)}>1 h</button>
        <button onClick={onClose}>✕</button>
      </div>
      {!list.length && <div class="dim">Collecting… the first sample comes after {every} s{long ? ' (one per minute)' : ''}. History starts fresh each time you load.</div>}
      {list.length > 0 && pick && (
        <>
          <h3><button onClick={() => setPick(null)}>←</button> {name(pick)} {fluid(pick) ? '(L/min)' : '(per min)'}</h3>
          <Chart series={[{ name: 'made', color: C_A, v: ser(pick, 'made') }, { name: 'used', color: C_B, v: ser(pick, 'used') }]} every={every} unit={fluid(pick) ? 'L/min' : '/min'} />
        </>
      )}
      {list.length > 0 && !pick && (
        <>
          <h3>Power</h3>
          <Chart series={[{ name: 'generated', color: C_A, v: list.map((s) => s.gen / every) }, { name: 'used', color: C_B, v: list.map((s) => s.use / every) }]} every={every} unit="W" />
          <h3>Pollution (all chunks)</h3>
          <Chart series={[{ name: 'pollution', color: C_A, v: list.map((s) => s.poll) }]} every={every} unit="" />
          <h3>Items & fluids <span class="legend inline"><span><i style={{ background: C_A }} />made</span><span><i style={{ background: C_B }} />used</span> · per min</span></h3>
          <table class="stab">
            <tbody>
              {rows.slice(0, 80).map((r) => (
                <tr key={r.id} onClick={() => setPick(r.id)} title="Tap for its chart">
                  <td><span class="sw" style={{ background: hex(reg.item(r.id)?.color ?? reg.fluid(r.id)?.color ?? 0x888888), borderRadius: fluid(r.id) ? '50%' : undefined }} /> {name(r.id)}</td>
                  <td class="num">{fmt(r.made)}</td><td class="num">{fmt(r.used)}</td>
                  <td><Spark a={ser(r.id, 'made')} b={ser(r.id, 'used')} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td class="dim">No machine has finished a recipe yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
