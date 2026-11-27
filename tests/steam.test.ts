import { describe, expect, it } from 'vitest';
import { registry } from '../src/content/registry';
import { planet } from '../src/data/planets';
import { MS, simEvents } from '../src/sim/machines';
import { apply, count, give } from '../src/sim/player';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { migrate } from '../src/save/migrations';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const wet = (x: number, y: number) => gen.surface(gen.wrapX(x), y).water !== Water.None;
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
/** A dry row x..x+5 whose west neighbour is water (pump at x). */
function shore(): { x: number; y: number } {
  for (let r = 0; r < 400; r++) for (let dx = -r; dx <= r; dx++) {
    const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + r;
    if (wet(x - 1, y) && [0, 1, 2, 3, 4, 5].every((i) => dry(x + i, y))) return { x, y };
  }
  throw new Error('no shore');
}
const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) step(s, gen); };
const put = (s: GameState, id: string, x: number, y: number) => {
  give(s, `struct:${id}`, 1);
  const r = apply(s, gen, { k: 'place', id: `struct:${id}`, x, y, f: 0, r: 0 });
  expect(r.ok, r.msg).toBe(true);
  return `${gen.wrapX(x)},${y},0`;
};

describe('steam', () => {
  const at = shore();

  it('pump → water pipe → boiler → steam pipe → steam furnace smelts', () => {
    const s = structuredClone(s0);
    const pump = put(s, 'water_pump', at.x, at.y);
    put(s, 'bronze_pipe', at.x + 1, at.y);
    const boil = put(s, 'small_boiler', at.x + 2, at.y);
    put(s, 'bronze_pipe', at.x + 3, at.y);
    const fur = put(s, 'steam_furnace', at.x + 4, at.y);
    run(s, 40);
    expect(s.mach[pump].st).toBe(MS.working);
    expect(s.mach[boil].water).toBeGreaterThan(0);
    give(s, 'log:wood', 4); give(s, 'dust:copper', 2);
    expect(apply(s, gen, { k: 'mfuel', key: boil, id: 'log:wood', n: 4 }).ok).toBe(true);
    const id = registry().machineRecipes('steam_furnace').find((x) => x.inputs[0]?.id === 'dust:copper')!.id;
    expect(apply(s, gen, { k: 'mrec', key: fur, recipe: id }).ok).toBe(true);
    apply(s, gen, { k: 'mload', key: fur, n: 2 });
    run(s, 100);
    expect(s.mach[fur].st).toBe(MS.noSteam);
    run(s, 3000);
    expect(s.mach[boil].heat).toBeGreaterThan(450);
    expect(s.mach[boil].dry).toBeFalsy();
    expect(s.mach[fur].out['ingot:copper']).toBe(2);
    expect(s.pipes[`${gen.wrapX(at.x + 1)},${at.y},0`].id).toBe('water');
    expect(s.pipes[`${gen.wrapX(at.x + 3)},${at.y},0`].id).toBe('steam');
  });

  it('a dry hot boiler explodes when water reaches it', () => {
    const s = structuredClone(s0);
    const boil = put(s, 'small_boiler', at.x + 2, at.y);
    give(s, 'log:wood', 2);
    apply(s, gen, { k: 'mfuel', key: boil, id: 'log:wood', n: 2 });
    run(s, 1000);
    expect(s.mach[boil].st).toBe(MS.dry);
    expect(s.mach[boil].heat).toBeGreaterThan(400);
    simEvents.length = 0;
    put(s, 'water_pump', at.x, at.y);
    put(s, 'bronze_pipe', at.x + 1, at.y);
    run(s, 3);
    expect(s.ents[boil]).toBeUndefined();
    expect(s.mach[boil]).toBeUndefined();
    expect(simEvents[0].msg).toMatch(/exploded/);
    expect(count(s, 'log:wood')).toBe(0);
  });

  it('migrates v9 saves', () => {
    const { pipes: _, ...old } = structuredClone(s0);
    expect(migrate({ ...old, version: 9 } as never).pipes).toEqual({});
  });
});
