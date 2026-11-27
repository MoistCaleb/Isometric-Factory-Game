// Serializable game state. Everything the sim needs lives here; render reads snapshots.
export const STATE_VERSION = 1;
export const TPS = 20;
/** Ticks per in-game day (20 min real time). */
export const DAY_TICKS = TPS * 60 * 20;

export interface GameState {
  version: number;
  seed: number;
  planet: string;
  tick: number;
  rng: number;
  /** Real seconds played (pause excluded). */
  playSeconds: number;
}

export function newGame(seed: number = (Math.random() * 2 ** 32) >>> 0): GameState {
  return { version: STATE_VERSION, seed, planet: 'earth', tick: 0, rng: seed, playSeconds: 0 };
}
