// Pollution (DESIGN §4): one value per 32×32 chunk. Burning machines emit `smoke` per second (scrubbers: negative); every
// second each chunk leaks SPREAD to each of its 4 neighbours (x wraps) and loses DECAY, and its living trees absorb some.
// HAZE tints the sky; at BLIGHT trees wither; at SMOG machines lose a quarter of their speed; at ACID rain corrodes exposed
// machines and bare wires (P5e).
import type { MachineDef } from '../data/machines';
import { CABLES, STRUCTURES } from '../data/structures';
import { Tree, type WorldGen } from '../world/gen';
import { contaminate } from './hazards';
import { machineAt, simEvents, type Mach } from './machines';
import { topoChanged } from './pipes';
import { next } from './rng';
import { FLOORS, STOREY, TPS, type GameState } from './state';

export const POLL_CH = 32;
export const HAZE = 300, BLIGHT = 800, SMOG = 1500, ACID = 3000;
const SPREAD = 0.03, DECAY = 0.01, MIN = 0.5;
/** Pollution absorbed per living tree per second · acid rain: rain strength it needs, corrosion chance per second for an
 * exposed machine / bare wire, pollution per corroded block (P5e). */
export const TREE_ABSORB = 0.01, ACID_RAIN = 0.3, ACID_MACH_P = 0.001, ACID_WIRE_P = 0.02, ACID_POLL = 100;
/** Uninsulated cable blocks (acid rain eats them). */
export const BARE_WIRES = new Set(['tin_wire', 'copper_wire']);
const MULTI = new Set(STRUCTURES.filter((st) => st.multi).map((st) => st.id));
const mod = (a: number, n: number) => ((a % n) + n) % n;

export const pollKey = (x: number, y: number) => `${Math.floor(x / POLL_CH)},${Math.floor(y / POLL_CH)}`;
/** Pollution at a tile or ent key. */
export const pollAt = (s: GameState, x: number, y: number) => s.poll[pollKey(x, y)] ?? 0;
export const smoggy = (s: GameState, key: string) => { const [x, y] = key.split(',').map(Number); return pollAt(s, x, y) >= SMOG; };

export const blighted = (s: GameState, x: number, y: number) => pollAt(s, x, y) >= BLIGHT;

/** Add pollution at an ent key's chunk (leaks, dumps; negative = scrubbed, floored at 0). */
export function addPoll(s: GameState, key: string, n: number) {
  const [x, y] = key.split(',').map(Number), k = pollKey(x, y);
  s.poll[k] = Math.max(0, (s.poll[k] ?? 0) + n);
}

const treeCache = new Map<string, number>(), felledCache = new Map<string, { t: number; n: number }>();
/** Living-tree count of a chunk from worldgen (cached per planet + chunk), minus trees felled since. */
export function treesIn(s: GameState, gen: WorldGen, k: string): number {
  const [cx, cy] = k.split(',').map(Number), ck = `${gen.seed}:${gen.planet.id}:${k}`;
  let n = treeCache.get(ck);
  if (n === undefined) {
    n = 0;
    for (let y = cy * POLL_CH; y < Math.min(gen.h, (cy + 1) * POLL_CH); y++)
      for (let x = cx * POLL_CH; x < Math.min(gen.w, (cx + 1) * POLL_CH); x++) { const t = gen.tree(x, y); if (t && t !== Tree.Cactus) n++; }
    treeCache.set(ck, n);
  }
  if (!n) return 0;
  // Felled trees: recounted at most once a minute per chunk.
  const fc = felledCache.get(ck);
  if (fc && s.tick >= fc.t && s.tick - fc.t < 60 * TPS) return Math.max(0, n - fc.n);
  let felled = 0;
  for (let y = cy * POLL_CH; y < (cy + 1) * POLL_CH; y++)
    for (let x = cx * POLL_CH; x < (cx + 1) * POLL_CH; x++) if (s.diffs[`${x},${y},t`] !== undefined) felled++;
  felledCache.set(ck, { t: s.tick, n: felled });
  return Math.max(0, n - felled);
}

/** Nothing over this block: no structure above it on its tile and no roof / upper floor over its storey. */
export function roofed(s: GameState, key: string): boolean {
  const [x, y, b] = key.split(',').map(Number), f = Math.floor(b / STOREY);
  for (let bb = b + 1; bb < (FLOORS + 1) * STOREY; bb++) if (s.ents[`${x},${y},${bb}`]) return true;
  if (s.base[`${x},${y},${f},r`]) return true;
  for (let ff = f + 1; ff <= FLOORS; ff++) if (s.base[`${x},${y},${ff},f`] || s.base[`${x},${y},${ff},r`]) return true;
  return false;
}

/** Acid rain (P5e): while it rains, exposed single-block machines and bare wires in ACID chunks corrode away. */
function acidRain(s: GameState) {
  if (s.weather.rain < ACID_RAIN) return;
  const lost: string[] = [];
  for (const [key, e] of Object.entries(s.ents)) {
    const [x, y] = key.split(',').map(Number);
    if (pollAt(s, x, y) < ACID) continue;
    const wire = BARE_WIRES.has(e.s) && CABLES.has(e.s), mach = !wire && !MULTI.has(e.s) && !!machineAt(s.ents, key);
    if (!wire && !mach) continue;
    if (roofed(s, key) || next(s) >= (wire ? ACID_WIRE_P : ACID_MACH_P)) continue;
    delete s.ents[key]; delete s.mach[key]; delete s.pipes[key];
    addPoll(s, key, ACID_POLL); contaminate(s, key);
    lost.push(key);
  }
  if (!lost.length) return;
  topoChanged();
  s.flags.acid_rain = (s.flags.acid_rain ?? 0) + 1;
  simEvents.push({ ok: false, sim: true, msg: `🌧 Acid rain corroded ${lost.length} exposed block${lost.length === 1 ? '' : 's'}. Roof your machines, use insulated cable, scrub the air.`,
    ents: Object.fromEntries(lost.map((k) => [k, null])) });
}

/** Smoke per second while this machine burns (0 = clean). */
export function smokeOf(def: MachineDef, m: Mach): number {
  if (!def.smoke) return 0;
  if (def.run === 'self' || def.run === 'elec') return m.st === 1 ? def.smoke : 0; // MS.working
  return m.burn > 0 ? def.smoke : 0;
}

export function stepPollution(s: GameState, gen: WorldGen) {
  if (s.tick % TPS) return;
  const p = s.poll, w = gen.w, h = gen.h;
  for (const [key, m] of Object.entries(s.mach)) {
    const ma = machineAt(s.ents, key), sm = ma ? smokeOf(ma.def, m) : 0;
    if (!sm) continue;
    const [x, y] = key.split(',').map(Number), k = pollKey(x, y);
    p[k] = Math.max(0, (p[k] ?? 0) + sm);
  }
  for (const [k, v] of Object.entries(p)) if (v > 0 && v < BLIGHT) p[k] = Math.max(0, v - treesIn(s, gen, k) * TREE_ABSORB);
  acidRain(s);
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
