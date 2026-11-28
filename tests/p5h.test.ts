import { describe, expect, it } from 'vitest';
import { CROPS, CROP_METALS, crossOf, NO_BLOCK_CAP } from '../src/data/crops';
import { STRUCTURES } from '../src/data/structures';
import { planet } from '../src/data/planets';
import { registry } from '../src/content/registry';
import { FARM_EVERY, stepFarm, watered } from '../src/sim/farm';
import { MS } from '../src/sim/machines';
import { apply, count, give } from '../src/sim/player';
import { newGame, TPS, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf) && !gen.plant(gen.wrapX(x), y, sf); };
function spot(from = 0) {
  for (let i = from; ; i++) {
    const x = s0.spawn.x + i, y = s0.spawn.y;
    let ok = true;
    for (let dx = -5; dx <= 5 && ok; dx++) for (let dy = -5; dy <= 5 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x: gen.wrapX(x), y };
  }
}
const place = (s: GameState, id: string, x: number, y: number) => {
  give(s, `struct:${id}`, 1);
  const r = apply(s, gen, { k: 'place', id: `struct:${id}`, x: gen.wrapX(x), y, f: 0, r: 0 });
  expect(r.ok, r.msg).toBe(true);
  return Object.keys(r.ents!)[0];
};
const plantIt = (s: GameState, id: string, x: number, y: number) => {
  give(s, id, 1);
  const r = apply(s, gen, { k: 'place', id, x: gen.wrapX(x), y, f: 0, r: 0 });
  expect(r.ok, r.msg).toBe(true);
};
/** Run the farm for n seconds (dry, no rain). */
const seconds = (s: GameState, n: number) => { for (let i = 0; i < n; i++) { s.tick += TPS; s.weather.rain = 0; stepFarm(s, gen); } };

describe('P5h farming data', () => {
  it('every cross has known parents; resource crops have a metal block; content links up', () => {
    for (const c of CROPS) if (c.parents) { for (const p of c.parents) expect(CROPS.some((x) => x.id === p), p).toBe(true); expect(crossOf(c.parents[1], c.parents[0])).toBe(c.id); }
    for (const m of CROP_METALS) expect(STRUCTURES.some((st) => st.id === `block_${m}`)).toBe(true);
    expect(registry().recipesFor('seed:ironleaf').some((r) => r.machine === 'planter' && r.keep?.includes('seed:stonecrop'))).toBe(true);
    expect(registry().recipesFor('small_dust:iron').some((r) => r.inputs[0]?.id === 'crop:ironleaf')).toBe(true);
  });

  it('wild plants grow on land by biome', () => {
    const seen = new Set<string>();
    for (let dy = -150; dy <= 150; dy += 1) for (let dx = -150; dx <= 150; dx += 1) { const p = gen.plant(s0.spawn.x + dx, s0.spawn.y + dy); if (p) seen.add(p); }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    for (const p of seen) expect(CROPS.find((c) => c.id === p)!.wild).toBeDefined();
  });
});

describe('P5h trees', () => {
  it('a sapling grows into a tree that is felled for logs and saplings; nothing builds over it', () => {
    const s = structuredClone(s0), { x, y } = spot();
    plantIt(s, 'sapling:broadleaf', x, y);
    expect(s.ents[`${x},${y},0`]).toMatchObject({ s: 'tree', pl: 'broadleaf', g: 0 });
    expect(s.flags.sapling).toBe(1);
    give(s, 'struct:chest', 1);
    expect(apply(s, gen, { k: 'place', id: 'struct:chest', x, y, f: 0, r: 0 }).ok).toBe(false);
    expect(apply(s, gen, { k: 'mine', x, y, z: 0 }).msg).toMatch(/growing/);
    seconds(s, 300);
    expect(s.ents[`${x},${y},0`].g).toBe(1);
    give(s, 'tool:axe:flint', 1);
    let r;
    for (let i = 0; i < 10 && s.ents[`${x},${y},0`]; i++) r = apply(s, gen, { k: 'mine', x, y, z: 0 });
    expect(r!.ents).toEqual({ [`${x},${y},0`]: null });
    expect(count(s, 'log:wood')).toBe(3);
    expect(count(s, 'sapling:broadleaf')).toBeGreaterThanOrEqual(1);
    expect(s.flags.tree_farm).toBe(1);
  });
});

describe('P5h crops', () => {
  it('planter → sticks → seed → mature → harvest back to half grown', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'planter', x, y);
    give(s, 'seed:wheat', 1);
    expect(apply(s, gen, { k: 'place', id: 'seed:wheat', x, y, f: 0, r: 0 }).msg).toMatch(/crop sticks first/);
    plantIt(s, 'crop_sticks', x, y);
    plantIt(s, 'seed:wheat', x, y);
    expect(s.ents[k]).toMatchObject({ pl: 'wheat', g: 0 });
    const wet = watered(s, gen, x, y), need = 120 * (wet ? 1 : 2);
    seconds(s, need - 2);
    expect(s.ents[k].g).toBeLessThan(1);
    expect(apply(s, gen, { k: 'harvest', x, y, f: 0 }).ok).toBe(false);
    seconds(s, 3);
    expect(s.ents[k].g).toBe(1);
    const r = apply(s, gen, { k: 'harvest', x, y, f: 0 });
    expect(r.ok).toBe(true);
    expect(count(s, 'crop:wheat')).toBe(2);
    expect(s.ents[k].g).toBe(0.5);
    // Compost: 2× growth.
    plantIt(s, 'compost', x, y);
    seconds(s, Math.ceil(need / 4) + 1);
    expect(s.ents[k].g).toBe(1);
    // Demolish gives back planter, sticks and the seed.
    expect(apply(s, gen, { k: 'demolish', x, y, f: 0 }).ok).toBe(true);
    expect(count(s, 'struct:planter')).toBe(1);
    expect(count(s, 'crop_sticks')).toBe(1);
  });

  it('empty sticks between two mature crops sprout a cross', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const ks = [-1, 0, 1].map((dx) => place(s, 'planter', x + dx, y));
    for (const dx of [-1, 0, 1]) plantIt(s, 'crop_sticks', x + dx, y);
    plantIt(s, 'seed:wheat', x - 1, y); plantIt(s, 'seed:reed', x + 1, y);
    s.ents[ks[0]].g = s.ents[ks[2]].g = 1;
    let crossed = false;
    for (let i = 0; i < 40 && !crossed; i++) {
      seconds(s, 300);
      if (s.ents[ks[1]].pl === 'stonecrop') crossed = true;
      else if (s.ents[ks[1]].pl !== 'sticks') s.ents[ks[1]] = { ...s.ents[ks[1]], pl: 'sticks', g: 0 }; // copied a parent: clear and retry
    }
    expect(crossed).toBe(true);
    expect(s.flags.cross).toBeGreaterThan(0);
  });

  it('resource crops stall without their metal block, ripen on it', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'planter', x, y);
    plantIt(s, 'crop_sticks', x, y); plantIt(s, 'seed:ironleaf', x, y);
    seconds(s, 2000);
    expect(s.ents[k].g).toBe(NO_BLOCK_CAP);
    // Rebuild on a block of iron.
    const x2 = gen.wrapX(x + 3);
    place(s, 'block_iron', x2, y); const k2 = place(s, 'planter', x2, y);
    expect(k2).toBe(`${x2},${y},1`);
    plantIt(s, 'crop_sticks', x2, y); plantIt(s, 'seed:ironleaf', x2, y);
    seconds(s, 800);
    expect(s.ents[k2].g).toBe(1);
  });

  it('the harvester reaps mature crops and grown trees, replanting trees', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const h = place(s, 'harvester', x, y);
    const k = place(s, 'planter', x + 2, y);
    plantIt(s, 'crop_sticks', x + 2, y); plantIt(s, 'seed:flax', x + 2, y);
    s.ents[k].g = 1;
    plantIt(s, 'sapling:conifer', x - 2, y);
    s.ents[`${x - 2},${y},0`].g = 1;
    const m = s.mach[h];
    for (let i = 0; i < 2 * FARM_EVERY + 4; i++) { m.e = 1e4; step(s, gen); }
    expect(m.out['crop:flax']).toBe(2);
    expect(m.out['log:wood']).toBe(3);
    expect(s.ents[`${x - 2},${y},0`]).toMatchObject({ s: 'tree', pl: 'conifer', g: expect.any(Number) });
    expect(s.ents[`${x - 2},${y},0`].g).toBeLessThan(1);
    expect(s.flags.harvester).toBe(2);
    expect(m.st).toBe(MS.working);
  });

  it('quests: a farming chapter from primitive to MV', async () => {
    const { QUEST, TOPICS } = await import('../src/data/quests');
    expect(TOPICS.some(([t]) => t === 'farm')).toBe(true);
    for (const id of ['f_sapling', 'f_tree', 'f_seeds', 'f_planter', 'f_cross', 'f_compost', 'f_resource', 'f_harvester', 'f_lv_crops', 'f_manager', 'f_gold'])
      expect(QUEST.get(id)?.chapter).toBe('farm');
  });
});
