import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { MACHINE, MAINT, MV_BASE } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { STRUCTURES, multiCells } from '../src/data/structures';
import { MS, multiCheck, newMach, overclock } from '../src/sim/machines';
import { apply, give } from '../src/sim/player';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

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
const recipe = (machine: string, out: string) => registry().recipes.find((r) => r.machine === machine && r.outputs.some((o) => o.id === out))!;
/** Run n ticks with the machine's buffer kept full (power itself is tested elsewhere). */
const powered = (s: GameState, k: string, n: number) => { for (let i = 0; i < n; i++) { s.mach[k].e = 1e4; step(s, gen); } };

describe('P5b MV electric', () => {
  it('MV machines, parts, generators, hatch and the lithium battery are reachable', () => {
    const have = reachable(registry());
    const ids = [...MV_BASE.map((b) => `struct:${b}_mv`), ...['steam_turbine_mv', 'combustion_generator_mv', 'battery_buffer_mv', 'energy_hatch_mv'].map((x) => `struct:${x}`),
      'motor:mv', 'pump:mv', 'piston:mv', 'conveyor:mv', 'robot_arm:mv', 'dust:lithium', 'battery:lithium'];
    for (const id of ids) expect(have.has(id), id).toBe(true);
    for (const b of MV_BASE) expect(MACHINE.get(`${b}_mv`)).toMatchObject({ tier: 'MV', base: b });
  });

  it('an MV machine runs LV recipes overclocked: 2× speed, 4× power, only while 4× fits 128 W', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'macerator_mv', x, y), r = recipe('macerator', 'pulp:wood');
    expect(apply(s, gen, { k: 'mrec', key: k, recipe: r.id }).ok).toBe(true);
    give(s, 'log:wood', 1); apply(s, gen, { k: 'mload', key: k, n: 1 });
    const def = MACHINE.get('macerator_mv')!, m = s.mach[k];
    expect(overclock(def, m, r)).toBe(1);
    powered(s, k, r.ticks / 2 + 1);
    expect(m.out['pulp:wood']).toBe(6);
    expect(s.flags.overclock).toBeGreaterThan(0);
    expect(overclock(def, m, { ...r, power: 33 })).toBe(0);
    expect(overclock(MACHINE.get('macerator')!, m, r)).toBe(0);
  });

  it('MV energy hatches count as energy hatches and overclock the EBF', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'ebf', x, y);
    place(s, 'energy_hatch_mv', x - 1, y); place(s, 'energy_hatch_mv', x + 1, y);
    place(s, 'maintenance_hatch', x - 1, y - 2);
    const cells = multiCells(STRUCTURES.find((x) => x.id === 'ebf')!, 0);
    give(s, 'struct:heat_casing', cells.filter((c) => c.id === 'heat_casing').length);
    give(s, 'struct:cupronickel_coil', 16);
    expect(apply(s, gen, { k: 'mfill', key: k }).ok).toBe(true);
    expect(multiCheck(s.ents, gen.w, k).need).toEqual([]);
    const r = recipe('ebf', 'ingot:iron');
    apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
    give(s, 'dust:iron', 4); apply(s, gen, { k: 'mload', key: k, n: 4 });
    powered(s, k, 1);
    const m = s.mach[k];
    for (const [t] of MAINT) give(s, tool(t), 1);
    for (let i = 0; i < MAINT.length; i++) apply(s, gen, { k: 'mfix', key: k, i });
    expect([m.eh, m.ehw, m.eht]).toEqual([2, 512, 'MV']);
    expect(overclock(MACHINE.get('ebf')!, m, r)).toBe(1);
    powered(s, k, Math.ceil(r.ticks / 2) + 2);
    expect(m.out['ingot:iron']).toBe(1);
  });

  it('an MV energy hatch takes 256 W at 128 V from MV turbines over copper cable', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'ebf', x, y);
    place(s, 'energy_hatch_mv', x - 1, y);
    apply(s, gen, { k: 'mrec', key: k, recipe: recipe('ebf', 'ingot:iron').id }); // hatches are counted while it has a recipe
    place(s, 'copper_cable', x - 2, y);
    const ts = [place(s, 'steam_turbine_mv', x - 3, y), place(s, 'steam_turbine_mv', x - 2, y + 1)];
    for (let i = 0; i < 3; i++) { for (const t of ts) (s.mach[t] ??= newMach()).steam = 4000; step(s, gen); }
    expect(s.ents[`${gen.wrapX(x - 1)},${y},0`]).toBeDefined(); // not blown up
    expect(s.mach[k].pw).toBeGreaterThan(64);
    expect(s.mach[k].pw).toBeLessThanOrEqual(256 + 1e-6);
    expect(s.flags.steam_turbine_mv).toBeGreaterThan(0);
  });

  it('the MV battery buffer takes lithium batteries only, 128 W each', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'battery_buffer_mv', x, y);
    give(s, 'battery:lead_acid', 1); give(s, 'charged_battery:lithium', 1);
    expect(apply(s, gen, { k: 'mbat', key: k, put: 'battery:lead_acid' }).ok).toBe(false);
    expect(apply(s, gen, { k: 'mbat', key: k, put: 'charged_battery:lithium' }).ok).toBe(true);
    expect(s.mach[k].e).toBe(144000);
    step(s, gen);
    expect(s.mach[k].st).toBe(MS.noLoad);
    expect(apply(s, gen, { k: 'mbat', key: k }).gained).toEqual([{ id: 'charged_battery:lithium', n: 1 }]);
  });

  it('quests: overclocking needs any one MV generator', async () => {
    const { QUEST } = await import('../src/data/quests');
    const { unlocked } = await import('../src/sim/quests');
    const q = QUEST.get('m_overclock')!;
    expect(unlocked(q, { m_motor: 2 })).toBe(false);
    for (const g of ['m_turbine', 'm_combustion']) {
      expect(QUEST.get(g)!.chapter).toBe('power');
      expect(unlocked(q, { m_motor: 2, [g]: 2 })).toBe(true);
    }
    expect(unlocked(QUEST.get('m_ehatch')!, { m_overclock: 2 })).toBe(true);
  });
});
