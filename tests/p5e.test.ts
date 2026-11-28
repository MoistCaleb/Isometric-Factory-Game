import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { MACHINE, MAINT } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { STRUCTURES, multiCells } from '../src/data/structures';
import { genW, MS, multiCheck, newMach } from '../src/sim/machines';
import { apply, give } from '../src/sim/player';
import { ACID, BLIGHT, pollKey, roofed, smokeOf, stepPollution, treesIn } from '../src/sim/pollution';
import { newGame, TPS, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { survey } from '../src/sim/veins';
import { HOT_R, Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
const place = (s: GameState, id: string, x: number, y: number, r = 0) => {
  give(s, `struct:${id}`, 1);
  const res = apply(s, gen, { k: 'place', id: `struct:${id}`, x: gen.wrapX(x), y, f: 0, r });
  expect(res.ok, res.msg).toBe(true);
  return Object.keys(res.ents!)[0];
};
function spot() {
  for (let i = 0; ; i++) {
    const x = s0.spawn.x + i, y = s0.spawn.y;
    let ok = true;
    for (let dx = -3; dx <= 3 && ok; dx++) for (let dy = -2; dy <= 1 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x, y };
  }
}
const tool = (t: string) => registry().items.find((i) => i.id.startsWith(`tool:${t}:`))!.id;
const tick = (s: GameState) => { s.tick += TPS; stepPollution(s, gen); };

describe('P5e environment', () => {
  it('scrubber, its casing, water treatment and the geothermal generator are reachable', () => {
    const have = reachable(registry());
    for (const id of ['struct:scrubber', 'struct:scrubber_casing', 'struct:water_treatment', 'struct:geothermal_generator']) expect(have.has(id), id).toBe(true);
    expect(registry().recipes.some((r) => r.machine === 'water_treatment' && r.fluidsOut?.[0].id === 'water')).toBe(true);
  });

  it('living trees absorb pollution; blighted ones do not', () => {
    const s = structuredClone(s0), k = pollKey(s.spawn.x, s.spawn.y), n = treesIn(s, gen, k);
    expect(n).toBeGreaterThan(0);
    s.poll = { [k]: 500 }; s.tick = 0; tick(s);
    expect(s.poll[k]).toBeCloseTo((500 - n * 0.01) * 0.87, 1);
    s.poll = { [k]: BLIGHT }; tick(s);
    expect(s.poll[k]).toBeCloseTo(BLIGHT * 0.87, 1);
  });

  it('acid rain corrodes exposed machines and bare wire; a roof protects', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const open = place(s, 'macerator', x, y), under = place(s, 'macerator', x + 2, y), wire = place(s, 'tin_wire', x + 1, y + 1);
    expect(apply(s, gen, { k: 'base', kind: 'roof', x: gen.wrapX(x + 2), y, f: 0 }).ok).toBe(true);
    expect(s.flags.roof).toBe(1);
    expect([roofed(s, open), roofed(s, under)]).toEqual([false, true]);
    s.weather.rain = 1; s.tick = 0;
    for (let i = 0; i < 20000 && s.ents[open]; i++) { s.poll = { [pollKey(x, y)]: ACID * 2 }; s.weather.rain = 1; tick(s); }
    expect(s.ents[open]).toBeUndefined();
    expect(s.ents[wire]).toBeUndefined();
    expect(s.ents[under]).toBeDefined();
    expect(s.flags.acid_rain).toBeGreaterThan(0);
    expect(s.haz?.[`${gen.wrapX(x)},${y}`]).toBe(1);
  });

  it('the scrubber removes 40 pollution/s from its chunk while it runs', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'scrubber', x, y);
    place(s, 'energy_hatch_mv', x - 1, y); place(s, 'maintenance_hatch', x + 1, y);
    const cells = multiCells(STRUCTURES.find((st) => st.id === 'scrubber')!, 0);
    give(s, 'struct:scrubber_casing', cells.length);
    expect(apply(s, gen, { k: 'mfill', key: k }).ok).toBe(true);
    expect(multiCheck(s.ents, gen.w, k).miss).toEqual([]);
    const r = registry().recipes.find((r) => r.machine === 'scrubber')!;
    apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
    give(s, 'dust:quicklime', 2); apply(s, gen, { k: 'mload', key: k, n: 2 });
    const m = s.mach[k];
    for (const [t] of MAINT) give(s, tool(t), 1);
    m.e = 1e4; step(s, gen);
    for (let i = 0; i < MAINT.length; i++) apply(s, gen, { k: 'mfix', key: k, i });
    m.fl = { water: 2000 };
    const pk = pollKey(x, y), ctl = structuredClone(s);
    ctl.mach[k].fl = {};
    s.poll[pk] = ctl.poll[pk] = 1000;
    for (let i = 0; i < r.ticks + 5; i++) { m.e = 1e4; step(s, gen); ctl.mach[k].e = 1e4; step(ctl, gen); }
    expect(m.st).toBe(MS.working);
    expect(smokeOf(MACHINE.get('scrubber')!, m)).toBe(-40);
    expect(s.flags.scrub).toBe(1);
    expect(m.fl.wastewater).toBe(1000);
    expect(ctl.poll[pk] - s.poll[pk]).toBeGreaterThan(200);
  });

  it('hotspots: heat falls off to the rim, the scanner block finds them, the generator follows the heat', () => {
    const h = gen.hotspotsNear(s0.spawn.x, s0.spawn.y, 1500)[0];
    expect(h).toBeDefined();
    expect(gen.heat(h.x, h.y)).toBe(1);
    expect(gen.heat(h.x + 4, h.y)).toBeCloseTo(1 - 0.75 * 0.4, 5);
    expect(gen.heat(h.x + HOT_R + 1, h.y)).toBe(0);
    const s = structuredClone(s0);
    expect(survey(s, gen, h.x + 20, h.y, 64, 16, 'x').msg).not.toMatch(/hotspot/);
    expect(survey(s, gen, h.x + 20, h.y, 64, 25, 'x').msg).toMatch(/geothermal hotspot 20 tiles W/);
    expect(s.flags.hotspot).toBe(1);
    const d = MACHINE.get('geothermal_generator')!;
    expect(genW(s, gen, `${h.x},${h.y},0`, newMach(), d)).toBe(128);
    expect(genW(s, gen, `${gen.wrapX(h.x + 30)},${h.y},0`, newMach(), d)).toBe(0);
  });

  it('quests: geothermal counts as an MV generator; scrubber after acid rain', async () => {
    const { QUEST } = await import('../src/data/quests');
    const { unlocked } = await import('../src/sim/quests');
    expect(unlocked(QUEST.get('m_pyrolyse')!, { m_motor: 2, m_geothermal: 2 })).toBe(true);
    expect(QUEST.get('m_geothermal')!.chapter).toBe('power');
    expect(unlocked(QUEST.get('m_scrubber')!, { m_discrete: 2 })).toBe(false);
    expect(unlocked(QUEST.get('m_scrubber')!, { m_discrete: 2, m_acid_rain: 2 })).toBe(true);
  });
});
