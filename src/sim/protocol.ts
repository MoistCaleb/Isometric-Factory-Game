import type { ActResult, Cmd } from './player';
import type { GameState, Slot } from './state';

export type ToSim =
  | { t: 'load'; state: GameState }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'snapshot'; id: number }
  | { t: 'cmd'; c: Cmd };

export type FromSim =
  | { t: 'ready' }
  | { t: 'stats'; tick: number; tps: number; paused: boolean; mspt: number; wind: number; rain: number }
  | { t: 'snapshot'; id: number; state: GameState }
  | { t: 'act'; res: ActResult; inv: (Slot | null)[]; tools: (Slot | null)[] }
  | { t: 'error'; message: string };
