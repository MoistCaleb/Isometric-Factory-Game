import { describe, expect, it } from 'vitest';
import { planet } from '../src/data/planets';
import { controllerAt, multiCheck } from '../src/sim/machines';
import { networks } from '../src/sim/pipes';
import { apply, give } from '../src/sim/player';
import { DAY_TICKS, newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
const place = (s: GameState, id: string, x: number, y: number, r = 0) => {
  give(s, `struct:${id}`, 1);
  const res = apply(s, gen, { k: 'place', id: `struct:${id}`, x, y, f: 0, r });
  expect(res.ok, res.msg).toBe(true);
  return Object.keys(res.ents!)[0];
};
/** Dry spot with a free 5×5 around it. */
function spot() {
  for (let i = 0; ; i++) {
    const x = s0.spawn.x + i, y = s0.spawn.y;
    let ok = true;
    for (let dx = -2; dx <= 3 && ok; dx++) for (let dy = -2; dy <= 2 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x, y };
  }
}

describe('P3d', () => {
  it('Large Boiler: rotated pattern, hatches, pipes only through hatches, makes steam', () => {
    const s = structuredClone(s0), { x, y } = spot(), X = (dx: number) => gen.wrapX(x + dx);
    // Rotation 1 faces west: the structure lies east of the controller (x..x+2, y..y+1; 2 wide × 3 deep × 3 high, P5g).
    const ctl = place(s, 'large_boiler', x, y, 1);
    const mc = multiCheck(s.ents, gen.w, ctl);
    expect(mc.miss.length).toBe(17);
    expect(mc.miss.every(([k]) => { const [kx, ky] = k.split(',').map(Number); return [X(0), X(1), X(2)].includes(kx) && (ky === y || ky === y + 1); })).toBe(true);
    expect(mc.need).toEqual(['input_hatch', 'output_hatch']);
    for (const [id, n] of [['bronze_casing', 8], ['steel_firebox', 5], ['bronze_pipe_casing', 4]] as const) give(s, `struct:${id}`, n);
    expect(apply(s, gen, { k: 'mfill', key: ctl }).ok).toBe(true);
    expect(multiCheck(s.ents, gen.w, ctl).miss).toEqual([]);
    expect(controllerAt(s.ents, gen.w, X(2), y, 2)).toBe(ctl);
    // Swap two top outer casings for hatches.
    for (const [dy, id] of [[0, 'input_hatch'], [1, 'output_hatch']] as const) {
      expect(apply(s, gen, { k: 'demolish', x: X(2), y: y + dy, f: 0 }).ok).toBe(true);
      place(s, id, X(2), y + dy);
    }
    expect(multiCheck(s.ents, gen.w, ctl).need).toEqual([]);
    expect(controllerAt(s.ents, gen.w, X(2), y, 2)).toBe(ctl);
    // Pipe column touching the input hatch at the top and a plain casing below: only the hatch links, as an input.
    for (let i = 0; i < 3; i++) place(s, 'bronze_pipe', X(3), y);
    const net = networks(s.ents, gen.w).find((n) => n.keys.includes(`${X(3)},${y},2`))!;
    expect(net.links).toEqual([expect.objectContaining({ ctl, hatch: 'in' })]);
    // Fuel + water → steam.
    const m = s.mach[ctl];
    m.water = 32000; m.fuel['lump:coke'] = 64;
    for (let i = 0; i < 1500; i++) step(s, gen);
    expect(m.tank?.id).toBe('steam');
    expect(s.flags.lboiler).toBeGreaterThan(0);
  });

  it('solar boiler: steam by day only, takes no fuel', () => {
    const s = structuredClone(s0), { x, y } = spot(), k = place(s, 'solar_boiler', x, y);
    give(s, 'lump:coal', 4);
    expect(apply(s, gen, { k: 'mfuel', key: k, id: 'lump:coal', n: 4 }).ok).toBe(false);
    s.mach[k].water = 8000;
    // Night: stays cold.
    s.tick = Math.floor(DAY_TICKS * 0.7);
    for (let i = 0; i < 2000; i++) step(s, gen);
    expect(s.mach[k].tank).toBeUndefined();
    // Noon: boils.
    s.tick = Math.floor(DAY_TICKS * 0.2); s.weather.rain = s.weather.tRain = 0;
    for (let i = 0; i < 3000; i++) step(s, gen);
    expect(s.mach[k].tank?.n ?? 0).toBeGreaterThan(0);
  });

  it('high-pressure boiler out-steams the small one', () => {
    const s = structuredClone(s0), { x, y } = spot(), a = place(s, 'small_boiler', x, y), b = place(s, 'hp_boiler', x + 2, y);
    for (const k of [a, b]) { s.mach[k].water = 8000; s.mach[k].fuel['lump:coke'] = 64; }
    // Drain both each tick (stands in for consumers) and compare total steam made once hot.
    const made = { [a]: 0, [b]: 0 };
    for (let i = 0; i < 4000; i++) {
      step(s, gen);
      for (const k of [a, b]) { if (i > 2500) made[k] += s.mach[k].tank?.n ?? 0; s.mach[k].tank = undefined; s.mach[k].water = 8000; }
    }
    expect(made[b]).toBeGreaterThan(2.2 * made[a]);
  });
});
