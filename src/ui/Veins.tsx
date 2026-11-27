// Prospecting journal (DESIGN §3 discovery / §8): known veins with filters, sorted by distance; tap to fly there.
import { useState } from 'preact/hooks';
import type { KnownVein } from '../render/veins';
import { mineralName, veinColor } from '../render/veins';
import { KNOW } from '../sim/state';
import type { WorldGen } from '../world/gen';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const STATUS = ['', 'Hint', 'Exposed', 'Surveyed'];

interface Props {
  gen: WorldGen; list: KnownVein[]; at: { x: number; y: number };
  overlay: boolean; onOverlay: () => void; onFly: (x: number, y: number) => void; onClose: () => void;
}

/** Rough ore left: blocks in the ellipse × layers × ore per block (mined blocks not subtracted yet). */
const estimate = (k: KnownVein) => Math.round(Math.PI * k.v.a * k.v.b * (k.v.z1 - k.v.z0 + 1) * k.v.richness / 100) * 100;
const kilo = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export function Veins({ gen, list, at, overlay, onOverlay, onFly, onClose }: Props) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState(0);
  const needle = q.trim().toLowerCase();
  const rows = list
    .filter((k) => !st || k.level === st)
    .filter((k) => !needle || k.v.def.name.toLowerCase().includes(needle)
      || (k.level === KNOW.surveyed && k.v.def.parts.some((p) => mineralName(p.ref).toLowerCase().includes(needle) || p.ref.includes(needle))))
    .map((k) => ({ k, d: Math.hypot(gen.dx(k.x, at.x), k.y - at.y) }))
    .sort((a, b) => a.d - b.d);
  return (
    <div class="panel veins">
      <div class="row">
        <h3 class="grow">Veins ({list.length})</h3>
        <label><input type="checkbox" checked={overlay} onChange={onOverlay} /> Overlay (O)</label>
        <button onClick={onClose}>✕</button>
      </div>
      <div class="row">
        <input placeholder="Search vein or mineral…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        {STATUS.map((n, i) => <button key={i} class={st === i ? 'on' : ''} onClick={() => setSt(i)}>{n || 'All'}</button>)}
      </div>
      <ul class="vlist">
        {rows.map(({ k, d }) => (
          <li key={k.id} onClick={() => onFly(Math.floor(k.x), Math.floor(k.y))} title="Fly there">
            <span class="sw" style={{ background: hex(veinColor(k.v)) }} />
            <span class="grow">
              <b>{k.v.def.name}</b> <span class="dim">· {STATUS[k.level]}</span>
              <br />
              <span class="dim">
                {k.level === KNOW.hint ? `somewhere within ~12 tiles · ${k.v.def.depth[0] <= 2 ? 'shallow' : 'stone depth'}`
                  : k.level === KNOW.exposed ? `layers ${k.v.z0}–${k.v.z1} · mix unknown — prospect it`
                    : `layers ${k.v.z0}–${k.v.z1} · ${k.v.def.parts.map((p) => `${mineralName(p.ref)} ${p.weight}%`).join(', ')} · ~${kilo(estimate(k))} ore`}
              </span>
            </span>
            <span class="dim">{Math.round(d)} t</span>
          </li>
        ))}
        {!rows.length && <li class="dim">{list.length ? 'No matches' : 'No veins known yet — pick up ore samples on the ground, dig, or prospect.'}</li>}
      </ul>
    </div>
  );
}
