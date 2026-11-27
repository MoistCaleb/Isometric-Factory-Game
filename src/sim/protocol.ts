import type { GameState } from './state';

export type ToSim =
  | { t: 'load'; state: GameState }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'snapshot'; id: number };

export type FromSim =
  | { t: 'ready' }
  | { t: 'stats'; tick: number; tps: number; paused: boolean; mspt: number }
  | { t: 'snapshot'; id: number; state: GameState }
  | { t: 'error'; message: string };
