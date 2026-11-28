// Serializable game state. Everything the sim needs lives here; render reads snapshots.
import { planet } from '../data/planets';
import { worldGen } from '../world/gen';
import type { Mach } from './machines';

export const STATE_VERSION = 13;
export const INV_SIZE = 27;
export const TOOL_SLOTS = 9;
export const TPS = 20;
/** Ticks per in-game day (20 min real time). Tick 0 = 06:00. */
export const DAY_TICKS = TPS * 60 * 20;
/** Day fraction, 0 = midnight, 0.5 = noon. */
export const timeOfDay = (tick: number) => ((tick % DAY_TICKS) / DAY_TICKS + 0.25) % 1;

export interface Weather {
  /** 0–1 current wind strength and rain intensity. */
  wind: number; rain: number;
  /** Targets eased toward; re-rolled at `next` tick. */
  tWind: number; tRain: number; next: number;
}

/** Inventory stack. `dur` = remaining uses (tools only). */
export interface Slot { id: string; n: number; dur?: number; /** Electric tool charge (J, P4d). */ e?: number }

/** Placed structure (DESIGN §3). `s` = structure id, `r` = rotation 0–3. */
export interface Ent { s: string; r: number; /** Pipes/cables: channel + cut sides (data/structures `conduitsJoin`). */ ch?: number; cut?: number;
  /** Breaker (P4c): 1 = tripped / switched off (conducts nothing). */ trip?: number }
/** Base part keys `x,y,f,p` (DESIGN §3, free + visual): p = f floor/foundation · r roof · l light · n/w wall on the tile's north/west edge. */
export type BasePart = 'f' | 'r' | 'l' | 'n' | 'w';
/** Edge variants for n/w parts. */
export const EDGE = { wall: 1, window: 2, door: 3 } as const;
export const FLOORS = 8;
/** Block levels per storey: a storey is 3 blocks tall; structures stack in block levels b (storey = ⌊b/3⌋). */
export const STOREY = 3;
/** Vein knowledge (DESIGN §3 discovery): 1 hint (surface sample) · 2 exposed (ore mined) · 3 surveyed (prospected). */
export const KNOW = { hint: 1, exposed: 2, surveyed: 3 } as const;

export interface GameState {
  version: number;
  seed: number;
  planet: string;
  tick: number;
  rng: number;
  /** Real seconds played (pause excluded). */
  playSeconds: number;
  spawn: { x: number; y: number };
  weather: Weather;
  /** World diffs vs generated: `x,y,z` → block id (DESIGN §3 seed + diffs). */
  diffs: Record<string, number>;
  /** Global inventory (DESIGN §8): 27 slots + 9 tool slots. */
  inv: (Slot | null)[];
  tools: (Slot | null)[];
  /** Block currently being dug (hits so far). */
  dig?: { key: string; hits: number };
  /** Structures by `x,y,b` (b = block level, storey ⌊b/3⌋; 0 = ground). */
  ents: Record<string, Ent>;
  /** Base build parts by `x,y,f,p` → variant. */
  base: Record<string, number>;
  /** Known veins by vein id (`cx.cy.slot`) → KNOW level. */
  veins: Record<string, number>;
  /** Machine state by controller ent key `x,y,b` (P2d). */
  mach: Record<string, Mach>;
  /** Quest progress (P2e): id → 1 done, reward unclaimed · 2 claimed. */
  quests: Record<string, number>;
  /** Tutorial action flags (data/quests FLAGS) → times done. */
  flags: Record<string, number>;
  /** Fluid in pipe blocks by ent key (P3a): spread evenly over each network every tick. */
  pipes: Record<string, { id: string; n: number }>;
  /** Pollution per 32×32 chunk `cx,cy` (P3e). */
  poll: Record<string, number>;
  /** Contaminated ground tiles `x,y` → 1 (P4e hazards): no building until neutralised. */
  haz: Record<string, number>;
}

export const emptyInv = () => ({ inv: Array<Slot | null>(INV_SIZE).fill(null), tools: Array<Slot | null>(TOOL_SLOTS).fill(null) });

export const newWeather = (): Weather => ({ wind: 0.3, rain: 0, tWind: 0.3, tRain: 0, next: TPS * 60 * 5 });

export function newGame(seed: number = (Math.random() * 2 ** 32) >>> 0): GameState {
  return {
    version: STATE_VERSION, seed, planet: 'earth', tick: 0, rng: seed, playSeconds: 0,
    spawn: worldGen(seed, planet('earth')).findSpawn(), weather: newWeather(), diffs: {}, ...emptyInv(), ents: {}, base: {}, veins: {}, mach: {}, quests: {}, flags: {}, pipes: {}, poll: {}, haz: {},
  };
}
