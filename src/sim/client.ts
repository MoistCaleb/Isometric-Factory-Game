// Main-thread handle to the sim worker.
import type { FromSim, ToSim } from './protocol';
import type { GameState } from './state';

export interface SimStats { tick: number; tps: number; paused: boolean; mspt: number }

export class SimClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<number, (s: GameState) => void>();
  private nextId = 1;
  stats: SimStats = { tick: 0, tps: 0, paused: true, mspt: 0 };
  onStats?: (s: SimStats) => void;
  onError?: (msg: string) => void;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<FromSim>) => {
      const m = e.data;
      if (m.t === 'stats') { this.stats = m; this.onStats?.(m); }
      else if (m.t === 'snapshot') { this.pending.get(m.id)?.(m.state); this.pending.delete(m.id); }
      else if (m.t === 'error') this.onError?.(m.message);
    };
  }
  private send(m: ToSim) { this.worker.postMessage(m); }
  load(state: GameState) { this.send({ t: 'load', state }); }
  pause() { this.send({ t: 'pause' }); }
  resume() { this.send({ t: 'resume' }); }
  snapshot(): Promise<GameState> {
    const id = this.nextId++;
    return new Promise((res) => { this.pending.set(id, res); this.send({ t: 'snapshot', id }); });
  }
}
