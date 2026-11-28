// Statistics (DESIGN §8, P5f): items/fluids made and used by machine recipes, power generated/used, total pollution.
// Sampled every 10 s (last 10 min) and every minute (last hour). Not saved: reset on load.
import { TPS, type GameState } from './state';

/** One sample: totals over its interval (items/L, J) and the pollution sum at its end. */
export interface Sample { made: Record<string, number>; used: Record<string, number>; gen: number; use: number; poll: number }
export interface Hist { short: Sample[]; long: Sample[]; /** Seconds per sample. */ every: [number, number] }

export const SHORT_S = 10, LONG_S = 60, KEEP = 60;
const blank = (): Sample => ({ made: {}, used: {}, gen: 0, use: 0, poll: 0 });
let cur = blank(), min = blank();
export const hist: Hist = { short: [], long: [], every: [SHORT_S, LONG_S] };

export function resetStats() { cur = blank(); min = blank(); hist.short = []; hist.long = []; }
export function countMade(id: string, n: number) { cur.made[id] = (cur.made[id] ?? 0) + n; }
export function countUsed(id: string, n: number) { cur.used[id] = (cur.used[id] ?? 0) + n; }
/** Joules generated / delivered this tick. */
export function countPower(gen: number, use: number) { cur.gen += gen; cur.use += use; }

const add = (a: Record<string, number>, b: Record<string, number>) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v; };
const push = (l: Sample[], x: Sample) => { l.push(x); if (l.length > KEEP) l.shift(); };

/** Called every tick after the systems ran. */
export function stepStats(s: GameState) {
  if (s.tick % (SHORT_S * TPS)) return;
  cur.poll = Object.values(s.poll).reduce((a, v) => a + v, 0);
  push(hist.short, cur);
  add(min.made, cur.made); add(min.used, cur.used); min.gen += cur.gen; min.use += cur.use; min.poll = cur.poll;
  cur = blank();
  if (s.tick % (LONG_S * TPS)) return;
  push(hist.long, min);
  min = blank();
}
