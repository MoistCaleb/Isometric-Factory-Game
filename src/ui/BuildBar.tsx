// Mode palette above the hotbar (DESIGN §3/§8): Machine Build lists structures in the inventory + rotate;
// Base Build picks a free part; Demolition shows a hint.
import { registry } from '../content/registry';
import type { BaseKind } from '../sim/build';
import type { Slot } from '../sim/state';
import type { Act } from '../render/renderer';
import { isConduit } from '../data/structures';
import { Channels } from './Conduit';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const PARTS: [BaseKind, string, string][] = [
  ['floor', '▭', 'Floor / foundation'], ['wall', '▌', 'Wall (nearest edge)'], ['window', '◫', 'Window (nearest edge)'],
  ['door', '🚪', 'Door (nearest edge)'], ['roof', '⌂', 'Roof'], ['light', '💡', 'Light'],
];

interface Props {
  act: Act; inv: (Slot | null)[];
  buildId: string | null; onBuildId: (id: string | null) => void; rot: number; onRot: () => void;
  baseKind: BaseKind; onBaseKind: (k: BaseKind) => void; onBook: () => void;
  /** Channel for new pipes/cables. */
  ch: number; onCh: (c: number) => void;
}

export function BuildBar({ act, inv, buildId, onBuildId, rot, onRot, baseKind, onBaseKind, onBook, ch, onCh }: Props) {
  const reg = registry();
  if (act === 'demolish') return <div class="buildbar"><span class="dim">Tap a structure to pick it up · near an edge removes walls · else roof → light → walls → floor</span></div>;
  if (act === 'base') {
    return (
      <div class="buildbar">
        {PARTS.map(([k, icon, name]) => <button key={k} class={baseKind === k ? 'on' : ''} onClick={() => onBaseKind(k)} title={name}>{icon} <span class="lbl">{k}</span></button>)}
        <span class="dim">free · ▲ for upper storeys</span>
      </div>
    );
  }
  const have = new Map<string, number>();
  for (const sl of inv) if (sl && reg.item(sl.id)?.kind === 'structure') have.set(sl.id, (have.get(sl.id) ?? 0) + sl.n);
  return (
    <div class="buildbar">
      {[...have].map(([id, n]) => {
        const d = reg.item(id)!;
        return (
          <button key={id} class={buildId === id ? 'on' : ''} onClick={() => onBuildId(buildId === id ? null : id)} title={d.name}>
            <span class="sw" style={{ background: hex(d.color) }} />{d.name} ×{n}
          </button>
        );
      })}
      {!have.size && <span class="dim">No structures — craft some in 📖</span>}
      {buildId && isConduit(buildId.replace('struct:', '')) && <><span class="dim">Channel:</span><Channels ch={ch} onPick={onCh} /></>}
      <button onClick={onBook} title="Recipes">📖</button>
      <button onClick={onRot} title="Rotate (F)">↻ {['S', 'W', 'N', 'E'][rot]}</button>
    </div>
  );
}
