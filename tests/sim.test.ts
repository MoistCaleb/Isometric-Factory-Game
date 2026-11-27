import { describe, expect, it } from 'vitest';
import { advance, createLoop, MAX_CATCHUP } from '../src/sim/loop';
import { next } from '../src/sim/rng';
import { newGame } from '../src/sim/state';
import { step } from '../src/sim/step';

describe('sim', () => {
  it('fixed step: 1 s → 20 ticks', () => {
    const l = createLoop(0);
    let n = 0;
    for (let t = 5; t <= 1000; t += 5) n += advance(l, t, 50);
    expect(n).toBe(20);
  });
  it('drops backlog beyond catch-up (no fast-forward)', () => {
    const l = createLoop(0);
    expect(advance(l, 10_000, 50)).toBe(MAX_CATCHUP);
    expect(l.acc).toBe(0);
  });
  it('rng is deterministic', () => {
    const a = { rng: 42 }, b = { rng: 42 };
    expect([next(a), next(a), next(a)]).toEqual([next(b), next(b), next(b)]);
  });
  it('step advances tick', () => {
    const s = newGame(1);
    for (let i = 0; i < 40; i++) step(s);
    expect(s.tick).toBe(40);
    expect(s.playSeconds).toBe(2);
  });
});
