// Pipe / cable panel: channel + per-side cut, so tightly packed lines can stay separate networks.
import { CHANNELS, STRUCTURES } from '../data/structures';
import { SIDES } from '../data/machines';
import type { Cmd } from '../sim/player';
import type { Ent } from '../sim/state';

const NAME = new Map(STRUCTURES.map((s) => [s.id, s.name]));
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Channel swatches (0 = plain). */
export function Channels({ ch, onPick }: { ch: number; onPick: (c: number) => void }) {
  return (
    <span class="chans">
      {CHANNELS.map((c, i) => (
        <button key={i} class={ch === i ? 'on' : ''} title={i ? `Channel ${i}` : 'Plain (no channel)'} onClick={() => onPick(i)}>
          {i ? <span class="sw" style={{ background: hex(c) }} /> : '∅'}
        </button>
      ))}
    </span>
  );
}

export function Conduit({ k, ent, onCmd, onClose }: { k: string; ent: Ent; onCmd: (c: Cmd) => void; onClose: () => void }) {
  const cut = ent.cut ?? 0, set = (c: Partial<{ ch: number; cut: number }>) => onCmd({ k: 'conduit', key: k, ...c });
  return (
    <div class="panel mach">
      <div class="row"><b class="grow">{NAME.get(ent.s) ?? ent.s}</b><button onClick={onClose} title="Close (Esc)">✕</button></div>
      <h3>Channel</h3>
      <Channels ch={ent.ch ?? 0} onPick={(ch) => set({ ch })} />
      <div class="dim">Same-kind pipes (or any cables) join only when on the same channel. Use another channel for a line that runs right next to this one.</div>
      <h3>Sides</h3>
      <div class="faces">
        {SIDES.map((n, i) => (
          <button key={n} class={cut >> i & 1 ? 'on' : ''} onClick={() => set({ cut: cut ^ (1 << i) })}>{n}: {cut >> i & 1 ? 'Cut' : 'Open'}</button>
        ))}
      </div>
      <div class="row">
        <button onClick={() => set({ cut: 63 })}>Cut all</button><button onClick={() => set({ cut: 0 })}>Open all</button>
      </div>
      <div class="dim">A cut side joins nothing: not the next pipe/cable, not a machine. Compass sides (north = up on the map).</div>
    </div>
  );
}
