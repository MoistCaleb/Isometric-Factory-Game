import { describe, expect, it } from 'vitest';
import { planet } from '../src/data/planets';
import { migrate } from '../src/save/migrations';
import { apply, give } from '../src/sim/player';
import { pollKey, smoggy, SMOG, stepPollution, TREE_ABSORB, treesIn } from '../src/sim/pollution';
import { newGame, TPS } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('P3e pollution', () => {
  it('spreads to 4 neighbours (x wraps), decays, drops tiny values', () => {
    const s = structuredClone(s0), ncx = Math.ceil(gen.w / 32);
    s.poll = { '0,10': 1000, '5,5': 0.4 };
    s.tick = TPS;
    stepPollution(s, gen);
    expect(s.poll['0,10']).toBeCloseTo(1000 * (1 - 0.01 - 4 * 0.03), 1);
    expect(s.poll[`${ncx - 1},10`]).toBeCloseTo(30, 1);
    expect(s.poll['0,11']).toBeCloseTo(30, 1);
    expect(s.poll['5,5']).toBeUndefined();
    expect(sum(s.poll)).toBeCloseTo(990, 0);
    s.tick = TPS + 1; const before = { ...s.poll };
    stepPollution(s, gen); // only once per second
    expect(s.poll).toEqual(before);
  });

  it('burning boilers emit smoke, solar ones do not; smog check', () => {
    const s = structuredClone(s0);
    let x = s0.spawn.x;
    const dry = (x: number) => { const sf = gen.surface(gen.wrapX(x), s0.spawn.y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), s0.spawn.y, sf); };
    while (!dry(x) || !dry(x + 1)) x++;
    const put = (id: string, px: number) => { give(s, `struct:${id}`, 1); const r = apply(s, gen, { k: 'place', id: `struct:${id}`, x: px, y: s0.spawn.y, f: 0, r: 0 }); expect(r.ok, r.msg).toBe(true); return Object.keys(r.ents!)[0]; };
    const b = put('small_boiler', gen.wrapX(x)), sol = put('solar_boiler', gen.wrapX(x + 1));
    step(s, gen);
    s.mach[b].burn = 10_000; s.mach[b].burnK = 1500; s.mach[sol].burn = 1;
    s.poll = {};
    while (s.tick % TPS) step(s, gen);
    const k = pollKey(gen.wrapX(x), s0.spawn.y);
    expect(s.poll[k]).toBeCloseTo((2 - treesIn(s, gen, k) * TREE_ABSORB) * (1 - 0.01 - 4 * 0.03), 1); // only the small boiler (2/s), then spread
    expect(smoggy(s, b)).toBe(false);
    s.poll[k] = SMOG;
    expect(smoggy(s, b)).toBe(true);
  });

  it('migrates v10 saves', () => {
    const { poll: _p, ...old } = structuredClone(s0);
    expect(migrate({ ...old, version: 10 } as never).poll).toEqual({});
  });
});
