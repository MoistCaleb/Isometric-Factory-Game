// Bottom HUD (DESIGN §8): 9 tool slots + bag with the 27-slot global inventory.
// Tap a slot to pick it up, tap another to move/swap/merge.
import { registry } from '../content/registry';
import type { SlotRef } from '../sim/player';
import type { Slot } from '../sim/state';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Short in-slot label: material-less items keep their name; forms show the form word. */
function label(id: string, name: string): string {
  const words = name.split(' ');
  if (id.startsWith('tool:')) return words.slice(-1)[0];
  return words.length > 2 ? words.slice(-2).join(' ') : name;
}

export function SlotView({ sl, sel, onClick }: { sl: Slot | null; sel?: boolean; onClick?: () => void }) {
  const def = sl ? registry().item(sl.id) : undefined;
  const max = def?.tool?.durability ?? 0;
  return (
    <button class={`slot ${sel ? 'sel' : ''}`} onClick={onClick} title={def ? `${def.name}${sl!.dur !== undefined ? ` · ${sl!.dur}/${max} uses` : ''}` : ''}>
      {sl && def && (
        <>
          <span class="sw" style={{ background: hex(def.color) }} />
          <span class="lb">{label(sl.id, def.name)}</span>
          {sl.n > 1 && <span class="n">{sl.n}</span>}
          {sl.dur !== undefined && max > 0 && <span class="dur" style={{ width: `${(sl.dur / max) * 100}%` }} />}
        </>
      )}
    </button>
  );
}

interface Props {
  inv: (Slot | null)[];
  tools: (Slot | null)[];
  open: boolean;
  sel: SlotRef | null;
  onSel: (r: SlotRef | null) => void;
  onMove: (a: SlotRef, b: SlotRef) => void;
  onTrash: (a: SlotRef) => void;
  onToggle: () => void;
}

export function Inventory({ inv, tools, open, sel, onSel, onMove, onTrash, onToggle }: Props) {
  const tap = (r: SlotRef, sl: Slot | null) => {
    if (!sel) { if (sl) onSel(r); return; }
    if (sel.box === r.box && sel.i === r.i) return onSel(null);
    onMove(sel, r);
    onSel(null);
  };
  const is = (r: SlotRef) => sel?.box === r.box && sel.i === r.i;
  return (
    <>
      {open && (
        <div class="bag">
          <div class="grid">
            {inv.map((sl, i) => <SlotView key={i} sl={sl} sel={is({ box: 'inv', i })} onClick={() => tap({ box: 'inv', i }, sl)} />)}
          </div>
          <div class="row bagbar">
            <span class="dim">{sel ? 'Tap a slot to move' : 'Tap an item to pick it up'}</span>
            <span class="grow" />
            {sel && <button onClick={() => { onTrash(sel); onSel(null); }} title="Destroy stack">🗑</button>}
          </div>
        </div>
      )}
      <div class="hotbar">
        {tools.map((sl, i) => <SlotView key={i} sl={sl} sel={is({ box: 'tools', i })} onClick={() => tap({ box: 'tools', i }, sl)} />)}
        <button class={`slot bagbtn ${open ? 'on' : ''}`} onClick={onToggle} title="Inventory (I)">🎒</button>
      </div>
    </>
  );
}
