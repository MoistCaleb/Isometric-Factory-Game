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
  // P2f: vein knowledge.
  5: (s) => ({ ...s, version: 6, veins: {} }),
  // P2d: machine state (created lazily for already-placed machines).
  6: (s) => ({ ...s, version: 7, mach: {} }),
  // Storeys are 3 blocks tall: ent/machine keys move from storey f to block level 3f.
  7: (s) => {
    const rekey = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => { const [x, y, f] = k.split(','); return [`${x},${y},${+f * 3}`, v]; }));
    return { ...s, version: 8, ents: rekey(s.ents as Record<string, unknown>), mach: rekey(s.mach as Record<string, unknown>) };
  },
  // P2e: quest book.
  8: (s) => ({ ...s, version: 9, quests: {}, flags: {} }),
  9: (s) => ({ ...s, version: 10, pipes: {} }),
  // P3e: pollution.
  10: (s) => ({ ...s, version: 11, poll: {} }),
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
