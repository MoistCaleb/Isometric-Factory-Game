import { describe, expect, it } from 'vitest';
import { registry } from '../src/content/registry';
import { planet } from '../src/data/planets';
import { migrate } from '../src/save/migrations';
import { controllerAt, MS } from '../src/sim/machines';
import { apply, count, give } from '../src/sim/player';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(x, y); return sf.water === Water.None && !sf.ice && !gen.tree(x, y, sf); };
/** Centre of a dry, treeless 3×3 near spawn (so not next to water either). */
function site(): { x: number; y: number } {
  for (let r = 0; r < 300; r++) for (let dx = -r; dx <= r; dx++) {
    const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + r;
    let ok = true;
    for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) ok = dry(x + a, y + b);
    if (ok) return { x, y };
  }
  throw new Error('no site');
}
const recipe = (machine: string, out: string) => registry().recipes.find((r) => r.machine === machine && [...r.outputs, ...(r.fluidsOut ?? [])].some((o) => o.id === out))!;
const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) step(s, gen); };
function setup(struct: string, at = site()) {
  const s = structuredClone(s0);
  give(s, `struct:${struct}`, 1);
  expect(apply(s, gen, { k: 'place', id: `struct:${struct}`, x: at.x, y: at.y, f: 0, r: 0 }).ok).toBe(true);
  return { s, key: `${at.x},${at.y},0`, at };
}

describe('machines', () => {
  it('pit kiln fires bricks with wood, then collects', () => {
    const { s, key } = setup('pit_kiln');
    expect(s.mach[key]).toBeTruthy();
    give(s, 'unfired_brick:clay', 4); give(s, 'log:wood', 2);
    expect(apply(s, gen, { k: 'mrec', key, recipe: recipe('pit_kiln', 'brick:brick').id }).ok).toBe(true);
    expect(apply(s, gen, { k: 'mload', key, n: 8 }).msg).toBe('Loaded ×4');
    run(s, 5);
    expect(s.mach[key].st).toBe(MS.noFuel);
    apply(s, gen, { k: 'mfuel', key, id: 'log:wood', n: 2 });
    run(s, 2000);
    expect(s.mach[key].heat).toBeGreaterThan(900);
    expect(s.mach[key].out['brick:brick']).toBeGreaterThanOrEqual(3);
    apply(s, gen, { k: 'mtake', key });
    expect(count(s, 'brick:brick')).toBeGreaterThanOrEqual(3);
  });

  it('clay furnace stays too cold for copper on wood, smelts on charcoal', () => {
    const { s, key } = setup('clay_furnace');
    give(s, 'dust:copper', 2); give(s, 'log:wood', 4); give(s, 'lump:charcoal', 4);
    apply(s, gen, { k: 'mrec', key, recipe: registry().recipes.find((r) => r.machine === 'clay_furnace' && r.inputs[0].id === 'dust:copper')!.id });
    apply(s, gen, { k: 'mload', key, n: 2 });
    apply(s, gen, { k: 'mfuel', key, id: 'log:wood', n: 4 });
    run(s, 800);
    expect(s.mach[key].st).toBe(MS.cold);
    expect(s.mach[key].heat).toBeLessThan(1358);
    apply(s, gen, { k: 'munload', key }); // fuel back, inputs back
    apply(s, gen, { k: 'mload', key, n: 2 });
    apply(s, gen, { k: 'mfuel', key, id: 'lump:charcoal', n: 4 });
    run(s, 2000);
    expect(s.mach[key].out['ingot:copper']).toBe(2);
  });

  it('coke oven multiblock: incomplete until auto-filled, then makes coke + creosote', () => {
    const { s, key, at } = setup('coke_oven');
    give(s, 'lump:coal', 2);
    apply(s, gen, { k: 'mrec', key, recipe: recipe('coke_oven', 'lump:coke').id });
    apply(s, gen, { k: 'mload', key, n: 2 });
    run(s, 2);
    expect(s.mach[key].st).toBe(MS.incomplete);
    expect(apply(s, gen, { k: 'mfill', key }).ok).toBe(false); // no casings
    give(s, 'struct:fire_brick_wall', 10);
    expect(apply(s, gen, { k: 'mfill', key }).ok).toBe(false); // runs out partway
    give(s, 'struct:fire_brick_wall', 15);
    const r = apply(s, gen, { k: 'mfill', key });
    expect(r.ok).toBe(true);
    expect(Object.keys(s.ents).filter((k) => s.ents[k].s === 'fire_brick_wall')).toHaveLength(25); // 3×3×3 blocks = 1 storey
    expect(s.ents[`${at.x},${at.y},1`]).toBeUndefined(); // hollow chamber
    expect(controllerAt(s.ents, gen.w, at.x + 1, at.y + 1, 0)).toBe(key);
    expect(controllerAt(s.ents, gen.w, at.x, at.y, 2)).toBe(key); // roof centre
    // Open the roof, put something in the chamber: incomplete. Clear it and re-fill.
    expect(apply(s, gen, { k: 'demolish', x: at.x, y: at.y, f: 0 }).ok).toBe(true);
    give(s, 'struct:chest', 1);
    expect(apply(s, gen, { k: 'place', id: 'struct:chest', x: at.x, y: at.y, f: 0, r: 0 }).ents).toHaveProperty(`${at.x},${at.y},1`);
    run(s, 1);
    expect(s.mach[key].st).toBe(MS.incomplete);
    expect(apply(s, gen, { k: 'demolish', x: at.x, y: at.y, f: 0 }).ok).toBe(true);
    expect(apply(s, gen, { k: 'mfill', key }).ok).toBe(true);
    run(s, 1800);
    expect(s.mach[key].out['lump:coke']).toBe(2);
    expect(s.mach[key].tank).toEqual({ id: 'creosote', n: 500 });
  });

  it('stacks 3 blocks per storey; upper storeys need support; supports cannot be demolished', () => {
    const { s, at } = setup('fire_brick_wall');
    give(s, 'struct:fire_brick_wall', 5);
    const put = (dx: number, f: number) => apply(s, gen, { k: 'place', id: 'struct:fire_brick_wall', x: at.x + dx, y: at.y, f, r: 0 });
    expect(put(0, 0).ents).toHaveProperty(`${at.x},${at.y},1`);
    expect(put(0, 0).ents).toHaveProperty(`${at.x},${at.y},2`);
    expect(put(0, 0).ok).toBe(false); // storey full
    expect(put(1, 1).ok).toBe(false); // nothing under storey 1 there
    expect(put(0, 1).ents).toHaveProperty(`${at.x},${at.y},3`); // on the stack
    expect(put(1, 1).ents).toHaveProperty(`${at.x + 1},${at.y},3`); // bridged
    expect(apply(s, gen, { k: 'demolish', x: at.x, y: at.y, f: 0 }).ok).toBe(false);
  });

  it('migrates v7 ent keys to block levels', () => {
    const v7 = { ...structuredClone(s0), version: 7, ents: { '1,2,0': { s: 'chest', r: 0 }, '1,2,1': { s: 'chest', r: 0 } }, mach: { '1,2,1': {} } };
    const m = migrate(v7 as never);
    expect(Object.keys(m.ents)).toEqual(['1,2,0', '1,2,3']);
    expect(Object.keys(m.mach)).toEqual(['1,2,3']);
  });

  it('quern is cranked by hand', () => {
    const { s, key } = setup('quern');
    give(s, 'gravel:stone', 1);
    apply(s, gen, { k: 'mrec', key, recipe: recipe('quern', 'dust:sand').id });
    apply(s, gen, { k: 'mload', key, n: 1 });
    run(s, 200);
    expect(s.mach[key].prog).toBe(0);
    expect(s.mach[key].st).toBe(MS.crank);
    for (let i = 0; i < 5; i++) apply(s, gen, { k: 'crank', key });
    expect(s.mach[key].out['dust:sand']).toBe(1);
  });

  it('sluice needs water next to it', () => {
    const { s, key } = setup('sluice');
    give(s, 'crushed_ore:cassiterite', 1);
    apply(s, gen, { k: 'mrec', key, recipe: recipe('sluice', 'purified_ore:cassiterite').id });
    apply(s, gen, { k: 'mload', key, n: 1 });
    run(s, 1);
    expect(s.mach[key].st).toBe(MS.noWater);
  });

  it('anvil needs a hammer and wears it', () => {
    const { s, key } = setup('stone_anvil');
    give(s, 'iron_bloom', 1);
    apply(s, gen, { k: 'mrec', key, recipe: recipe('anvil', 'ingot:wrought_iron').id });
    apply(s, gen, { k: 'mload', key, n: 1 });
    run(s, 1);
    expect(apply(s, gen, { k: 'crank', key }).ok).toBe(false);
    give(s, 'tool:hammer:stone', 1);
    for (let i = 0; i < 10; i++) apply(s, gen, { k: 'crank', key });
    expect(s.mach[key].out['ingot:wrought_iron']).toBe(1);
    expect(s.tools.find((t) => t?.id === 'tool:hammer:stone')?.dur).toBe(29);
  });

  it('demolish refunds machine contents', () => {
    const { s, key, at } = setup('clay_furnace');
    give(s, 'lump:charcoal', 3);
    apply(s, gen, { k: 'mfuel', key, id: 'lump:charcoal', n: 3 });
    expect(count(s, 'lump:charcoal')).toBe(0);
    expect(apply(s, gen, { k: 'demolish', x: at.x, y: at.y, f: 0 }).ok).toBe(true);
    expect(count(s, 'lump:charcoal')).toBe(3);
    expect(s.mach[key]).toBeUndefined();
  });

  it('migrates v6 saves', () => {
    const { mach: _, ...old } = structuredClone(s0);
    expect(migrate({ ...old, version: 6 } as never).mach).toEqual({});
  });
});
