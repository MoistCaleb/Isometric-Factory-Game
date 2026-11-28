// Blueprints (DESIGN §7, P5f): copy an area (structures from a storey up + base parts, with config) into the save, paste it
// rotated at an anchor, taking each block from the inventory.
import { rotCell } from '../data/structures';
import type { WorldGen } from '../world/gen';
import { addBase, placeAt, STRUCT, type BaseKind, type Side } from './build';
import type { ActResult } from './player';
import { count } from './player';
import { EDGE, FLOORS, STOREY, type BasePart, type Ent, type GameState } from './state';

export const BP_MAX = 32;
export const BP_SLOTS = 20;
/** A block: offset from the anchor, block level above the paste storey's base, structure, rotation + config. */
export interface BpEnt { x: number; y: number; b: number; s: string; r: number; ch?: number; cut?: number; rec?: string; faces?: number[]; up?: boolean }
/** Base part: offset, storey above the paste storey, part, variant. */
export type BpBase = [number, number, number, BasePart, number];
export interface Blueprint { name: string; w: number; h: number; ents: BpEnt[]; base: BpBase[] }

const mod = (a: number, n: number) => ((a % n) + n) % n;
/** One quarter turn ((dx, dy) → (−dy, dx), as `rotCell`) moves side E→S, W→N, S→W, N→E (SIDES order E W S N up down). */
const TURN = [2, 3, 1, 0, 4, 5];
const turnSide = (i: number, r: number) => { for (let k = 0; k < r; k++) i = TURN[i]; return i; };
const turnBits = (bits: number, r: number) => { let o = 0; for (let i = 0; i < 6; i++) if ((bits >> i) & 1) o |= 1 << turnSide(i, r); return o; };
const EDGE_SIDE: Side[] = ['e', 'w', 's', 'n'];
const SIDE_I: Record<string, number> = { e: 0, w: 1, s: 2, n: 3 };
const EDGE_KIND = Object.fromEntries(Object.entries(EDGE).map(([k, v]) => [v, k])) as Record<number, keyof typeof EDGE>;

/** The blueprint turned r quarter turns about its anchor (0, 0). */
export function rotateBp(bp: Blueprint, r: number): Blueprint {
  r = mod(r, 4);
  if (!r) return bp;
  const ents = bp.ents.map((e) => {
    const [x, y] = rotCell([e.x, e.y, 0], r), n: BpEnt = { ...e, x: x + 0, y: y + 0, r: mod(e.r + r, 4) }; // + 0: no −0
    if (e.cut) n.cut = turnBits(e.cut, r);
    if (e.faces) { const f = [0, 0, 0, 0, 0, 0]; e.faces.forEach((v, i) => (f[turnSide(i, r)] = v)); n.faces = f; }
    return n;
  });
  const base = bp.base.map(([bx, by, f, p, v]): BpBase => {
    const [x, y] = rotCell([bx + 0, by, 0], r).map((v) => v + 0);
    if (p !== 'n' && p !== 'w') return [x, y, f, p, v];
    // An edge part sits on its tile's n/w side: turn that side, then store it canonically (s/e → the neighbour's n/w).
    const side = EDGE_SIDE[turnSide(SIDE_I[p], r)];
    return side === 's' ? [x, y + 1, f, 'n', v] : side === 'e' ? [x + 1, y, f, 'w', v] : [x, y, f, side, v];
  });
  return { ...bp, w: r % 2 ? bp.h : bp.w, h: r % 2 ? bp.w : bp.h, ents, base };
}

/** Copy the rectangle between two corners (first corner = anchor) at storey f and every storey above it. */
export function copyArea(s: GameState, gen: WorldGen, x0: number, y0: number, x1: number, y1: number, f: number, name: string): Blueprint | string {
  const sx = mod(x1 - x0 + gen.w / 2, gen.w) - gen.w / 2, sy = y1 - y0;
  if (Math.abs(sx) >= BP_MAX || Math.abs(sy) >= BP_MAX) return `Too big — at most ${BP_MAX}×${BP_MAX}`;
  const ents: BpEnt[] = [], base: BpBase[] = [];
  for (let dx = Math.min(0, sx); dx <= Math.max(0, sx); dx++) for (let dy = Math.min(0, sy); dy <= Math.max(0, sy); dy++) {
    const x = gen.wrapX(x0 + dx), y = y0 + dy;
    for (let b = f * STOREY; b < (FLOORS + 1) * STOREY; b++) {
      const k = `${x},${y},${b}`, e = s.ents[k];
      if (!e) continue;
      const o: BpEnt = { x: dx, y: dy, b: b - f * STOREY, s: e.s, r: e.r };
      if (e.ch) o.ch = e.ch;
      if (e.cut) o.cut = e.cut;
      const m = s.mach[k];
      if (m?.rec) o.rec = m.rec;
      if (m?.faces) o.faces = [...m.faces];
      if (m?.up) o.up = true;
      ents.push(o);
    }
    for (let ff = f; ff <= FLOORS; ff++) for (const p of ['f', 'r', 'l', 'n', 'w'] as BasePart[]) {
      const v = s.base[`${x},${y},${ff},${p}`];
      if (v) base.push([dx, dy, ff - f, p, v]);
    }
  }
  if (!ents.length && !base.length) return 'Nothing built there';
  return { name: name.slice(0, 40) || 'Blueprint', w: Math.abs(sx) + 1, h: Math.abs(sy) + 1, ents, base };
}

/** Items a blueprint needs (`struct:<id>` → n). */
export function bpCost(bp: Blueprint): Map<string, number> {
  const c = new Map<string, number>();
  for (const e of bp.ents) c.set(`struct:${e.s}`, (c.get(`struct:${e.s}`) ?? 0) + 1);
  return c;
}

const kindOf = (p: BasePart, v: number): BaseKind => (p === 'f' ? 'floor' : p === 'r' ? 'roof' : p === 'l' ? 'light' : EDGE_KIND[v] ?? 'wall');

/** Paste at anchor (x, y) on storey f, turned r: floors, then blocks bottom-up (repeated passes so bridges find support),
 * then the other base parts. Missing items, occupied and unsupported cells are skipped and reported. */
export function pasteBp(s: GameState, gen: WorldGen, bp0: Blueprint, xIn: number, y: number, f: number, r: number): ActResult {
  if (f < 0 || f > FLOORS) return { ok: false, msg: 'Paste at the surface or above' };
  const bp = rotateBp(bp0, r), ents: Record<string, Ent | null> = {}, base: Record<string, number | null> = {};
  const parts = (want: (p: BasePart) => boolean) => {
    for (const [dx, dy, ff, p, v] of bp.base) {
      if (!want(p) || f + ff > FLOORS) continue;
      const res = addBase(s, gen, kindOf(p, v), xIn + dx, y + dy, f + ff, p === 'n' || p === 'w' ? p : undefined);
      Object.assign(base, res.base ?? {});
    }
  };
  parts((p) => p === 'f');
  let left = [...bp.ents].sort((a, b) => a.b - b.b), placed = 0;
  const miss = new Map<string, number>(), why = new Map<string, number>();
  for (let pass = 0; pass < 8 && left.length; pass++) {
    const next: BpEnt[] = [];
    why.clear();
    for (const e of left) {
      const x = gen.wrapX(xIn + e.x), yy = y + e.y, b = f * STOREY + e.b, k = `${x},${yy},${b}`, item = `struct:${e.s}`;
      if (s.ents[k]) { why.set('occupied', (why.get('occupied') ?? 0) + 1); continue; }
      if (!count(s, item)) { miss.set(item, (miss.get(item) ?? 0) + 1); continue; }
      const res = placeAt(s, gen, item, x, yy, b, e.r, e.ch);
      if (!res.ok) { next.push(e); why.set(res.msg ?? 'blocked', (why.get(res.msg ?? 'blocked') ?? 0) + 1); continue; }
      const n = s.ents[k] as Ent;
      if (e.cut) n.cut = e.cut;
      const m = s.mach[k];
      if (m) { if (e.rec) m.rec = e.rec; if (e.faces?.some(Boolean)) m.faces = [...e.faces]; if (e.up) m.up = true; }
      ents[k] = n; placed++;
    }
    if (next.length === left.length) { left = next; break; }
    left = next;
  }
  parts((p) => p !== 'f');
  if (placed) s.flags.bp_paste = (s.flags.bp_paste ?? 0) + 1;
  const name = (id: string) => STRUCT.get(id.replace('struct:', ''))?.name ?? id;
  const notes = [...[...miss].map(([id, n]) => `${n}× ${name(id)}`), ...[...why].filter(([w]) => w !== 'occupied' || !placed).map(([w, n]) => `${n}× ${w}`)];
  const total = bp.ents.length;
  return {
    ok: placed > 0 || Object.keys(base).length > 0 || !total,
    msg: `${bp.name}: placed ${placed}/${total}${notes.length ? ` · skipped ${notes.join(', ')}` : ''}`,
    ents, base,
  };
}

/** Keep a blueprint in the save (same name replaces it). */
export function saveBp(s: GameState, bp: Blueprint): ActResult {
  if (!bp.ents.length && !bp.base.length) return { ok: false, msg: 'Empty blueprint' };
  if (bp.ents.some((e) => !STRUCT.has(e.s))) return { ok: false, msg: 'Unknown structure in blueprint' };
  const list = (s.bps ??= []), i = list.findIndex((b) => b.name === bp.name);
  if (i < 0 && list.length >= BP_SLOTS) return { ok: false, msg: `At most ${BP_SLOTS} blueprints — delete one first` };
  if (i >= 0) list[i] = bp; else list.push(bp);
  return { ok: true, msg: `Saved blueprint “${bp.name}” (${bp.ents.length} blocks)`, bps: list };
}

export type BpCmd =
  | { k: 'bpcopy'; x0: number; y0: number; x1: number; y1: number; f: number; name: string }
  | { k: 'bpsave'; bp: Blueprint }
  | { k: 'bppaste'; i: number; x: number; y: number; f: number; r: number }
  | { k: 'bpdel'; i: number };

export function bpCmd(s: GameState, gen: WorldGen, c: BpCmd): ActResult {
  switch (c.k) {
    case 'bpcopy': {
      const bp = copyArea(s, gen, c.x0, c.y0, c.x1, c.y1, c.f, c.name);
      if (typeof bp === 'string') return { ok: false, msg: bp };
      const r = saveBp(s, bp);
      if (r.ok) s.flags.bp_copy = (s.flags.bp_copy ?? 0) + 1;
      return r;
    }
    case 'bpsave': {
      const r = saveBp(s, c.bp);
      if (r.ok) s.flags.bp_sketch = (s.flags.bp_sketch ?? 0) + 1;
      return r;
    }
    case 'bppaste': {
      const bp = s.bps?.[c.i];
      return bp ? pasteBp(s, gen, bp, c.x, c.y, c.f, c.r) : { ok: false, msg: 'No such blueprint' };
    }
    case 'bpdel': {
      if (!s.bps?.[c.i]) return { ok: false, msg: 'No such blueprint' };
      const [bp] = s.bps.splice(c.i, 1);
      return { ok: true, msg: `Deleted “${bp.name}”`, bps: s.bps };
    }
  }
}
