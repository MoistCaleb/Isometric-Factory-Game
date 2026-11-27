import type { Mach } from './machines';
import type { PowerInfo } from './power';
import type { ActResult, Cmd } from './player';
import type { GameState, Slot } from './state';

export type ToSim =
  | { t: 'load'; state: GameState }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'snapshot'; id: number }
  | { t: 'watch'; key: string | null }
  | { t: 'cmd'; c: Cmd };

export type FromSim =
  | { t: 'ready' }
  | { t: 'stats'; tick: number; tps: number; paused: boolean; mspt: number; wind: number; rain: number; ms: Record<string, number>; pl: Record<string, number>; q: Record<string, number>; fl: Record<string, number> }
  /** Watched machine (null = gone) + multiblock check (missing casings [key, id], blocked chamber, missing hatches). */
  | { t: 'mach'; key: string; m: Mach | null; miss: [string, string][]; blocked: string[]; need: string[]; pw?: PowerInfo }
  | { t: 'snapshot'; id: number; state: GameState }
  | { t: 'act'; res: ActResult; inv: (Slot | null)[]; tools: (Slot | null)[] }
  | { t: 'error'; message: string };
