// Hazards v1 (DESIGN §4, P4e). Leaks, toxic/corrosive dumps and fires contaminate the ground tile (`s.haz`, `x,y`): nothing
// can be built there until it is neutralised with quicklime (Demolition mode on the bare tile). An explosion or a burning
// cable sets fire to flammable fluid next to it — pipes holding it and machines storing it burn too, and so on.
import { registry } from '../content/registry';
import { FIRE_POLL } from '../data/machines';
import { PIPES } from '../data/structures';
import { machineAt, simEvents, type Mach } from './machines';
import { around, topoChanged } from './pipes';
import { addPoll } from './pollution';
import type { ActResult } from './player';
import { count, take } from './player';
import type { GameState } from './state';

export const CLEANER = 'dust:quicklime';
const tile = (key: string) => key.split(',').slice(0, 2).join(',');
const flammable = (id?: string) => !!id && !!registry().fluid(id)?.hazards.includes('flammable');
const holdsFire = (m?: Mach) => !!m && (flammable(m.tank && m.tank.n > 0 ? m.tank.id : undefined) || Object.entries(m.fl ?? {}).some(([id, n]) => n > 0 && flammable(id)));

/** Contaminate the ground tile under a block key (`x,y,b` or `x,y`). */
export function contaminate(s: GameState, key: string) {
  (s.haz ??= {})[tile(key)] = 1;
}
export const contaminated = (s: GameState, x: number, y: number) => !!s.haz?.[`${x},${y}`];

/** Fire spreads from a blown-up / burned-out block to flammable fluid around it (chained, capped). */
export function ignite(s: GameState, w: number, from: string) {
  const seen = new Set([from]), burned: string[] = [];
  for (let q = [from]; q.length && burned.length < 64;) {
    const nq: string[] = [];
    for (const k of q) for (const nk of around(k, w)) {
      if (seen.has(nk)) continue;
      seen.add(nk);
      const e = s.ents[nk];
      if (!e) continue;
      const pipe = PIPES.has(e.s) && s.pipes[nk]?.n > 0 && flammable(s.pipes[nk].id);
      if (!pipe && !(machineAt(s.ents, nk) && holdsFire(s.mach[nk]))) continue;
      burned.push(nk); nq.push(nk);
      delete s.ents[nk]; delete s.pipes[nk]; delete s.mach[nk];
      addPoll(s, nk, FIRE_POLL); contaminate(s, nk);
    }
    q = nq;
  }
  if (!burned.length) return;
  topoChanged();
  s.flags.fire = (s.flags.fire ?? 0) + 1;
  simEvents.push({ ok: false, sim: true, msg: `🔥 Fire! ${burned.length} block${burned.length === 1 ? '' : 's'} holding flammable fluid burned. Keep fuel lines away from boilers and cables.`,
    ents: Object.fromEntries(burned.map((k) => [k, null])) });
}

/** Neutralise a contaminated tile with one quicklime dust. */
export function clean(s: GameState, x: number, y: number): ActResult {
  if (!count(s, CLEANER)) return { ok: false, msg: 'Contaminated ground — neutralise it with 1 quicklime dust (lime kiln: calcite)' };
  take(s, CLEANER, 1);
  delete s.haz![`${x},${y}`];
  s.flags.clean = (s.flags.clean ?? 0) + 1;
  return { ok: true, msg: 'Ground neutralised (−1 quicklime dust)' };
}
