// Building (DESIGN §3): Machine Build places structure items on a tile + storey; Base Build adds free visual parts
// (floors/foundations, edge walls/windows/doors, roofs, lights); Demolition removes them (structures refund).
import { registry } from '../content/registry';
import { STRUCTURES } from '../data/structures';
import { B } from '../world/blocks';
import { Water, type WorldGen } from '../world/gen';
import type { ActResult } from './player';
import { count, give, take } from './player';
import { newMach, refund } from './machines';
import { EDGE, FLOORS, type BasePart, type GameState } from './state';

export const STRUCT = new Map(STRUCTURES.map((s) => [s.id, s]));
export type Side = 'n' | 'e' | 's' | 'w';
export type BaseKind = 'floor' | 'roof' | 'light' | keyof typeof EDGE;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Canonical edge: south/east edges are stored as the neighbour's north/west. */
export function edgeKey(x: number, y: number, f: number, side: Side, w: number): string {
  if (side === 's') return `${x},${y + 1},${f},n`;
  if (side === 'e') return `${mod(x + 1, w)},${y},${f},w`;
  return `${x},${y},${f},${side}`;
}

/** Nearest edge to a point inside a tile (fx, fy in 0–1). */
export function nearSide(fx: number, fy: number): Side {
  const d: [Side, number][] = [['n', fy], ['s', 1 - fy], ['w', fx], ['e', 1 - fx]];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

/** Why a tile can't take a structure / floor at storey f (null = fine). */
function groundBlock(s: GameState, gen: WorldGen, x: number, y: number, needFoundation: boolean): string | null {
  if (!gen.inBounds(y)) return 'Off the map';
  const sf = gen.surface(x, y);
  if (sf.ice) return 'Polar ice is unbuildable';
  if (s.diffs[`${x},${y},0`] === B.air) return 'Fill the pit first';
  if (gen.tree(x, y, sf) && s.diffs[`${x},${y},t`] === undefined) return 'Fell the tree first';
  if (needFoundation && sf.water !== Water.None && !s.base[`${x},${y},0,f`]) return 'Water: lay a foundation first (Base Build)';
  return null;
}

export function place(s: GameState, gen: WorldGen, id: string, xIn: number, y: number, f: number, r: number): ActResult {
  const x = gen.wrapX(xIn), st = STRUCT.get(id.replace(/^struct:/, ''));
  if (!st) return { ok: false, msg: 'Not placeable' };
  const item = `struct:${st.id}`, key = `${x},${y},${f}`;
  if (f < 0 || f > FLOORS) return { ok: false, msg: 'Build on the surface or upper floors' };
  if (!count(s, item)) return { ok: false, msg: `No ${st.name} in inventory` };
  if (s.ents[key]) return { ok: false, msg: 'Occupied' };
  const why = f === 0 ? groundBlock(s, gen, x, y, true) : !s.base[`${x},${y},${f},f`] ? 'Upper storeys need a floor (Base Build)' : null;
  if (why) return { ok: false, msg: why };
  take(s, item, 1);
  s.ents[key] = { s: st.id, r: mod(r, 4) };
  if (st.machine) s.mach[key] = newMach();
  return { ok: true, ents: { [key]: s.ents[key] } };
}

export function addBase(s: GameState, gen: WorldGen, kind: BaseKind, xIn: number, y: number, f: number, side?: Side): ActResult {
  const x = gen.wrapX(xIn);
  if (f < 0 || f > FLOORS) return { ok: false, msg: 'Build on the surface or upper floors' };
  if (!gen.inBounds(y) || gen.surface(x, y).ice) return { ok: false, msg: 'Unbuildable here' };
  let key: string, v = 1;
  if (kind === 'floor' || kind === 'roof' || kind === 'light') {
    key = `${x},${y},${f},${kind[0]}`;
    if (kind === 'floor' && f === 0) { const why = groundBlock(s, gen, x, y, false); if (why) return { ok: false, msg: why }; }
  } else {
    key = edgeKey(x, y, f, side ?? 'n', gen.w);
    v = EDGE[kind];
  }
  if (s.base[key] === v) return { ok: true };
  s.base[key] = v;
  return { ok: true, base: { [key]: v } };
}

/** Remove what's at a tile: structure first, else the base part under the pointer (edge if near one). */
export function demolish(s: GameState, gen: WorldGen, xIn: number, y: number, f: number, side?: Side): ActResult {
  const x = gen.wrapX(xIn), key = `${x},${y},${f}`, e = s.ents[key];
  if (e) {
    const st = STRUCT.get(e.s), back = refund(s, key);
    if (!back.ok || give(s, `struct:${e.s}`, 1)) return { ok: false, msg: 'Inventory full', gained: back.gained };
    delete s.ents[key];
    return { ok: true, ents: { [key]: null }, gained: [...back.gained, { id: `struct:${e.s}`, n: 1 }], msg: st ? undefined : 'Removed' };
  }
  const order: string[] = [];
  if (side) order.push(edgeKey(x, y, f, side, gen.w));
  order.push(`${key},r`, `${key},l`);
  for (const sd of ['n', 'e', 's', 'w'] as Side[]) if (sd !== side) order.push(edgeKey(x, y, f, sd, gen.w));
  order.push(`${key},f`);
  for (const k of order) {
    if (!s.base[k]) continue;
    delete s.base[k];
    return { ok: true, base: { [k]: null } };
  }
  return { ok: false, msg: 'Nothing to demolish' };
}

/** Mining can't dig out a tile with something built on it. */
export function builtOn(s: GameState, x: number, y: number): boolean {
  return !!s.ents[`${x},${y},0`] || !!s.base[`${x},${y},0,f`];
}

export const isStruct = (id: string) => registry().item(id)?.kind === 'structure';
export type { BasePart };
