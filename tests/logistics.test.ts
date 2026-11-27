import { describe, expect, it } from 'vitest';
import { registry } from '../src/content/registry';
import { FACE } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { networks } from '../src/sim/pipes';
import { apply, give } from '../src/sim/player';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const wet = (x: number, y: number) => gen.surface(gen.wrapX(x), y).water !== Water.None;
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
/** Dry 6×2 block whose west neighbour (row y) is water. */
function shore(): { x: number; y: number } {
  for (let r = 0; r < 400; r++) for (let dx = -r; dx <= r; dx++) {
    const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + r;
    if (wet(x - 1, y) && [0, 1, 2, 3, 4, 5].every((i) => dry(x + i, y) && dry(x + i, y + 1))) return { x, y };
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
const E = 0;

describe('logistics', () => {
  const at = shore();

  it('chest (out side) → item pipe → furnace (input + fuel) → item pipe → chest', () => {
    const s = structuredClone(s0);
    const a = put(s, 'chest', at.x, at.y + 1);
    put(s, 'tin_item_pipe', at.x + 1, at.y + 1);
    const f = put(s, 'clay_furnace', at.x + 2, at.y + 1);
    put(s, 'tin_item_pipe', at.x + 3, at.y + 1);
    const b = put(s, 'chest', at.x + 4, at.y + 1);
    const rec = registry().machineRecipes('clay_furnace').find((x) => x.inputs.length === 1 && x.inputs[0].id === 'dust:copper' && x.inputs[0].n === 1)!;
    expect(apply(s, gen, { k: 'mrec', key: f, recipe: rec.id }).ok).toBe(true);
    give(s, 'dust:copper', 3); give(s, 'lump:charcoal', 4);
    expect(apply(s, gen, { k: 'cput', key: a, id: 'dust:copper', n: 64 }).ok).toBe(true);
    expect(apply(s, gen, { k: 'cput', key: a, id: 'lump:charcoal', n: 64 }).ok).toBe(true);
    run(s, 40);
    expect(s.mach[a].out['dust:copper']).toBe(3); // auto side: a chest doesn't push
    expect(apply(s, gen, { k: 'mface', key: a, face: E, mode: FACE.out }).ok).toBe(true);
    run(s, 40);
    expect(s.mach[a].out).toEqual({});
    expect(s.mach[f].fuel['lump:charcoal'] ?? 0).toBeGreaterThan(0);
    run(s, 6000);
    expect(s.mach[b].out[rec.outputs[0].id]).toBe(3 * rec.outputs[0].n);
  });

  it('Off sides ignore pipes; items go to the nearest chest first', () => {
    const s = structuredClone(s0);
    const a = put(s, 'chest', at.x, at.y + 1);
    for (let i = 1; i <= 4; i++) put(s, 'tin_item_pipe', at.x + i, at.y + 1);
    const near = put(s, 'chest', at.x + 1, at.y), far = put(s, 'chest', at.x + 5, at.y + 1);
    give(s, 'plank:wood', 8);
    apply(s, gen, { k: 'cput', key: a, id: 'plank:wood', n: 8 });
    apply(s, gen, { k: 'mface', key: a, face: E, mode: FACE.out });
    run(s, 11);
    expect(s.mach[near].out['plank:wood']).toBe(4);
    expect(s.mach[far].out['plank:wood']).toBeUndefined();
    apply(s, gen, { k: 'mface', key: near, face: 2, mode: FACE.off }); // its south side faces the pipe
    run(s, 10);
    expect(s.mach[near].out['plank:wood']).toBe(4);
    expect(s.mach[far].out['plank:wood']).toBe(4);
  });

  it('barrel buffers water; wooden barrels refuse steam; pipe kinds never join', () => {
    const s = structuredClone(s0);
    put(s, 'water_pump', at.x, at.y);
    put(s, 'lead_pipe', at.x + 1, at.y);
    const bar = put(s, 'barrel', at.x + 2, at.y);
    put(s, 'bronze_pipe', at.x + 1, at.y + 1);
    run(s, 100);
    expect(s.mach[bar].tank?.id).toBe('water');
    expect(s.mach[bar].tank!.n).toBeGreaterThan(500);
    expect(networks(s.ents, gen.w).length).toBe(2);
    const s2 = structuredClone(s0);
    const boil = put(s2, 'small_boiler', at.x, at.y + 1);
    put(s2, 'bronze_pipe', at.x + 1, at.y + 1);
    const b2 = put(s2, 'barrel', at.x + 2, at.y + 1);
    s2.mach[boil].tank = { id: 'steam', n: 1000 };
    run(s2, 5);
    expect(s2.mach[b2].tank).toBeUndefined();
  });
});
