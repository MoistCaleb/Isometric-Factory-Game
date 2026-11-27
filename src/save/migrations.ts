// Versioned save migrations: MIGRATIONS[v] upgrades a v-state to v+1.
import { planet } from '../data/planets';
import { emptyInv, newWeather, STATE_VERSION, type GameState } from '../sim/state';
import { worldGen } from '../world/gen';

type Raw = Record<string, unknown> & { version: number };
export const MIGRATIONS: Record<number, (s: Raw) => Raw> = {
  // P1: world spawn, weather, diffs.
  1: (s) => ({ ...s, version: 2, spawn: worldGen(s.seed as number, planet(s.planet as string)).findSpawn(), weather: newWeather(), diffs: {} }),
  // Surface now sampled on the sphere: same seed, new terrain → re-pick spawn, drop diffs (pre-release, no builds yet).
  2: (s) => ({ ...s, version: 3, spawn: worldGen(s.seed as number, planet(s.planet as string)).findSpawn(), diffs: {} }),
  // P2: inventory + tool slots.
  3: (s) => ({ ...s, version: 4, ...emptyInv() }),
  // P2c: placed structures + base parts.
  4: (s) => ({ ...s, version: 5, ents: {}, base: {} }),
};

export function migrate(raw: Raw): GameState {
  let s = raw;
  if (typeof s.version !== 'number') throw new Error('save has no version');
  if (s.version > STATE_VERSION) throw new Error(`save version ${s.version} is newer than game (${STATE_VERSION})`);
  while (s.version < STATE_VERSION) {
    const m = MIGRATIONS[s.version];
    if (!m) throw new Error(`no migration from version ${s.version}`);
    s = m(s);
  }
  return s as unknown as GameState;
}
