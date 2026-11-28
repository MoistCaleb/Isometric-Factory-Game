import type { Mach } from './machines';
import type { PowerInfo } from './power';
import type { ActResult, Cmd } from './player';
import type { GameState, Slot } from './state';
import type { Hist } from './stats';

export type ToSim =
  | { t: 'load'; state: GameState }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'snapshot'; id: number }
  | { t: 'watch'; key: string | null }
  | { t: 'cmd'; c: Cmd }
  | { t: 'hist' };

export type FromSim =
  | { t: 'ready' }
  | { t: 'stats'; tick: number; tps: number; paused: boolean; mspt: number; wind: number; rain: number; ms: Record<string, number>; pl: Record<string, number>; q: Record<string, number>; fl: Record<string, number>; pn: Record<string, number>; hz: Record<string, number> }
  /** Watched machine (null = gone) + multiblock check (missing casings [key, id], blocked chamber, missing hatches). */
  | { t: 'mach'; key: string; m: Mach | null; miss: [string, string][]; blocked: string[]; need: string[]; heat?: number; pw?: PowerInfo }
  | { t: 'snapshot'; id: number; state: GameState }
  | { t: 'act'; res: ActResult; inv: (Slot | null)[]; tools: (Slot | null)[] }
  | { t: 'hist'; h: Hist }
  | { t: 'error'; message: string };
