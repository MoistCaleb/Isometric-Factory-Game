// Main-thread handle to the sim worker.
import type { PowerInfo } from './power';
import type { FromSim, ToSim } from './protocol';
import type { ActResult, Cmd } from './player';
import type { Mach } from './machines';
import type { GameState, Slot } from './state';

export interface SimStats { tick: number; tps: number; paused: boolean; mspt: number; wind: number; rain: number; ms?: Record<string, number>; pl?: Record<string, number>; q?: Record<string, number>; fl?: Record<string, number>; pn?: Record<string, number> }
export interface MachView { key: string; m: Mach | null; miss: [string, string][]; blocked: string[]; need: string[]; pw?: PowerInfo }

export class SimClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<number, (s: GameState) => void>();
  private nextId = 1;
  stats: SimStats = { tick: 0, tps: 0, paused: true, mspt: 0, wind: 0, rain: 0 };
  /** performance.now() when stats last arrived (for tick interpolation). */
  statsAt = 0;
  onStats?: (s: SimStats) => void;
  onError?: (msg: string) => void;
  inv: (Slot | null)[] = [];
  tools: (Slot | null)[] = [];
  /** Result of a player command, with the updated inventory already stored. */
  onAct?: (r: ActResult) => void;
  onMach?: (v: MachView) => void;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<FromSim>) => {
      const m = e.data;
      if (m.t === 'stats') { this.stats = m; this.statsAt = performance.now(); this.onStats?.(m); }
      else if (m.t === 'snapshot') { this.pending.get(m.id)?.(m.state); this.pending.delete(m.id); }
      else if (m.t === 'act') { this.inv = m.inv; this.tools = m.tools; this.onAct?.(m.res); }
      else if (m.t === 'mach') this.onMach?.(m);
      else if (m.t === 'error') this.onError?.(m.message);
    };
  }
  private send(m: ToSim) { this.worker.postMessage(m); }
  load(state: GameState) { this.inv = state.inv; this.tools = state.tools; this.send({ t: 'load', state }); }
  cmd(c: Cmd) { this.send({ t: 'cmd', c }); }
  /** Stream a machine's state (null = stop). */
  watch(key: string | null) { this.send({ t: 'watch', key }); }
  pause() { this.send({ t: 'pause' }); }
  resume() { this.send({ t: 'resume' }); }
  snapshot(): Promise<GameState> {
    const id = this.nextId++;
    return new Promise((res) => { this.pending.set(id, res); this.send({ t: 'snapshot', id }); });
  }
}
