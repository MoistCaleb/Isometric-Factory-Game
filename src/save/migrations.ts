// Versioned save migrations: MIGRATIONS[v] upgrades a v-state to v+1.
import { STATE_VERSION, type GameState } from '../sim/state';

type Raw = Record<string, unknown> & { version: number };
export const MIGRATIONS: Record<number, (s: Raw) => Raw> = {
  // 1: (s) => ({ ...s, version: 2, newField: default }),
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
