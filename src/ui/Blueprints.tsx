// Blueprint mode bar (DESIGN §7, P5f): copy tool + saved blueprints to paste.
import { registry } from '../content/registry';
import { bpCost, type Blueprint } from '../sim/blueprints';
import type { Slot } from '../sim/state';

export type BpTool = 'copy' | number;
const have = (inv: (Slot | null)[], id: string) => inv.reduce((a, s) => a + (s?.id === id ? s.n : 0), 0);

interface Props { bps: Blueprint[]; tool: BpTool; onTool: (t: BpTool) => void; anchor: boolean; inv: (Slot | null)[]; rot: number; onRot: () => void; onDel: (i: number) => void }

export function BlueprintBar({ bps, tool, onTool, anchor, inv, rot, onRot, onDel }: Props) {
  const bp = typeof tool === 'number' ? bps[tool] : undefined;
  const miss = bp ? [...bpCost(bp)].map(([id, n]) => [id, n - have(inv, id)] as const).filter(([, n]) => n > 0) : [];
  return (
    <div class="buildbar">
      <button class={tool === 'copy' ? 'on' : ''} onClick={() => onTool('copy')} title="Copy: tap two opposite corners">✂ <span class="lbl">copy</span></button>
      {bps.map((b, i) => <button key={b.name} class={tool === i ? 'on' : ''} onClick={() => onTool(i)} title={`${b.w}×${b.h}, ${b.ents.length} blocks`}>📋 {b.name}</button>)}
      {tool === 'copy' && <span class="dim">{anchor ? 'Tap the opposite corner (from this storey up is copied)' : 'Tap the first corner (it becomes the paste anchor)'}</span>}
      {bp && <>
        <button onClick={onRot} title="Rotate (F)">↻ {rot * 90}°</button>
        <span class={miss.length ? 'warn' : 'dim'}>{miss.length ? `missing ${miss.map(([id, n]) => `${n}× ${registry().item(id)?.name ?? id}`).join(', ')}` : 'all blocks in inventory'} · tap to paste</span>
        <button onClick={() => confirm(`Delete blueprint “${bp.name}”?`) && onDel(tool as number)} title="Delete">🗑</button>
      </>}
    </div>
  );
}
