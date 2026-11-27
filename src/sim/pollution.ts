// Pollution v1 (DESIGN §4): one value per 32×32 chunk. Burning machines emit `smoke` per second; every second each chunk
// leaks SPREAD to each of its 4 neighbours (x wraps) and loses DECAY. HAZE tints the sky; at SMOG machines in the chunk
// lose a quarter of their speed. Plants dying, acid rain and scrubbers come later (P5).
import type { MachineDef } from '../data/machines';
import { machineAt, type Mach } from './machines';
import { TPS, type GameState } from './state';

export const POLL_CH = 32;
export const HAZE = 300, SMOG = 1500;
const SPREAD = 0.03, DECAY = 0.01, MIN = 0.5;
const mod = (a: number, n: number) => ((a % n) + n) % n;

export const pollKey = (x: number, y: number) => `${Math.floor(x / POLL_CH)},${Math.floor(y / POLL_CH)}`;
/** Pollution at a tile or ent key. */
export const pollAt = (s: GameState, x: number, y: number) => s.poll[pollKey(x, y)] ?? 0;
export const smoggy = (s: GameState, key: string) => { const [x, y] = key.split(',').map(Number); return pollAt(s, x, y) >= SMOG; };

/** Smoke per second while this machine burns (0 = clean). */
export function smokeOf(def: MachineDef, m: Mach): number {
  if (!def.smoke) return 0;
  if (def.run === 'self') return m.st === 1 ? def.smoke : 0; // MS.working
  return m.burn > 0 ? def.smoke : 0;
}

export function stepPollution(s: GameState, w: number, h: number) {
  if (s.tick % TPS) return;
  const p = s.poll;
  for (const [key, m] of Object.entries(s.mach)) {
    const ma = machineAt(s.ents, key), sm = ma ? smokeOf(ma.def, m) : 0;
    if (!sm) continue;
    const [x, y] = key.split(',').map(Number), k = pollKey(x, y);
    p[k] = (p[k] ?? 0) + sm;
  }
  const ncx = Math.ceil(w / POLL_CH), ncy = Math.ceil(h / POLL_CH), next: Record<string, number> = {};
  const add = (k: string, v: number) => { next[k] = (next[k] ?? 0) + v; };
  for (const [k, v] of Object.entries(p)) {
    const [cx, cy] = k.split(',').map(Number);
    let keep = v * (1 - DECAY);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ny = cy + dy;
      if (ny < 0 || ny >= ncy) continue;
      add(`${mod(cx + dx, ncx)},${ny}`, v * SPREAD); keep -= v * SPREAD;
    }
    add(k, keep);
  }
  s.poll = {};
  for (const [k, v] of Object.entries(next)) if (v >= MIN) s.poll[k] = Math.round(v * 10) / 10;
}
