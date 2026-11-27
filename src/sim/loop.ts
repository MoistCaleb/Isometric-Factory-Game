// Fixed-step accumulator. Pure (time is passed in) so it is testable.
export interface Loop { acc: number; last: number; ticks: number }
export const MAX_CATCHUP = 5;

export function createLoop(now: number): Loop {
  return { acc: 0, last: now, ticks: 0 };
}

/** Returns number of ticks to run for elapsed time; drops backlog beyond MAX_CATCHUP (no fast-forward). */
export function advance(loop: Loop, now: number, tickMs: number): number {
  loop.acc += Math.max(0, now - loop.last);
  loop.last = now;
  let n = Math.floor(loop.acc / tickMs);
  loop.acc -= n * tickMs;
  if (n > MAX_CATCHUP) { n = MAX_CATCHUP; loop.acc = 0; }
  loop.ticks += n;
  return n;
}
