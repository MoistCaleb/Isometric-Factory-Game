/// <reference lib="webworker" />
import { advance, createLoop } from './loop';
import type { FromSim, ToSim } from './protocol';
import { TPS, type GameState } from './state';
import { step } from './step';

const TICK_MS = 1000 / TPS;
const post = (m: FromSim) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let state: GameState | null = null;
let paused = true;
let loop = createLoop(performance.now());
let tpsWindow: number[] = [];
let msptAvg = 0;
let lastStats = 0;

function frame() {
  const now = performance.now();
  if (state && !paused) {
    const n = advance(loop, now, TICK_MS);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { step(state); tpsWindow.push(now); }
    if (n) msptAvg = msptAvg * 0.9 + ((performance.now() - t0) / n) * 0.1;
  } else {
    loop.last = now;
  }
  if (now - lastStats > 250 && state) {
    lastStats = now;
    tpsWindow = tpsWindow.filter((t) => now - t < 1000);
    post({ t: 'stats', tick: state.tick, tps: paused ? 0 : tpsWindow.length, paused, mspt: msptAvg });
  }
}

self.onmessage = (e: MessageEvent<ToSim>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'load': state = m.state; loop = createLoop(performance.now()); break;
      case 'pause': paused = true; break;
      case 'resume': paused = false; loop = createLoop(performance.now()); break;
      case 'snapshot': if (state) post({ t: 'snapshot', id: m.id, state: structuredClone(state) }); break;
    }
  } catch (err) {
    post({ t: 'error', message: String(err) });
  }
};

setInterval(frame, 5);
post({ t: 'ready' });
