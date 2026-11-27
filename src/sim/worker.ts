/// <reference lib="webworker" />
import { planet } from '../data/planets';
import { worldGen, type WorldGen } from '../world/gen';
import { advance, createLoop } from './loop';
import { missingCasings, newMach, statuses } from './machines';
import { apply } from './player';
import type { FromSim, ToSim } from './protocol';
import { TPS, type GameState } from './state';
import { step } from './step';

const TICK_MS = 1000 / TPS;
const post = (m: FromSim) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let state: GameState | null = null;
let gen: WorldGen | null = null;
let paused = true;
let loop = createLoop(performance.now());
let tpsWindow: number[] = [];
let msptAvg = 0;
let lastStats = 0;
/** Machine the UI panel is watching (streamed with stats). */
let watch: string | null = null;

function frame() {
  const now = performance.now();
  if (state && !paused) {
    const n = advance(loop, now, TICK_MS);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { step(state, gen!); tpsWindow.push(now); }
    if (n) msptAvg = msptAvg * 0.9 + ((performance.now() - t0) / n) * 0.1;
  } else {
    loop.last = now;
  }
  if (now - lastStats > 250 && state) {
    lastStats = now;
    tpsWindow = tpsWindow.filter((t) => now - t < 1000);
    post({ t: 'stats', tick: state.tick, tps: paused ? 0 : tpsWindow.length, paused, mspt: msptAvg, wind: state.weather.wind, rain: state.weather.rain, ms: statuses(state) });
    postWatch();
  }
}

function postWatch() {
  if (!state || !gen || !watch) return;
  post({ t: 'mach', key: watch, m: state.ents[watch] ? state.mach[watch] ?? newMach() : null, miss: missingCasings(state.ents, gen.w, watch) });
}

self.onmessage = (e: MessageEvent<ToSim>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'load': state = m.state; gen = worldGen(state.seed, planet(state.planet)); loop = createLoop(performance.now()); break;
      case 'watch': watch = m.key; postWatch(); break;
      case 'pause': paused = true; break;
      case 'resume': paused = false; loop = createLoop(performance.now()); break;
      case 'cmd': {
        if (!state || !gen) break;
        const res = paused && m.c.k === 'mine' ? { ok: false, msg: 'Paused' } : apply(state, gen, m.c);
        post({ t: 'act', res, inv: state.inv, tools: state.tools });
        postWatch();
        break;
      }
      case 'snapshot': if (state) post({ t: 'snapshot', id: m.id, state: structuredClone(state) }); break;
    }
  } catch (err) {
    post({ t: 'error', message: String(err) });
  }
};

setInterval(frame, 5);
post({ t: 'ready' });
