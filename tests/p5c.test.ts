import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { MACHINE, MAINT, MV_BASE } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { STRUCTURES, multiCells } from '../src/data/structures';
import { MS, multiCheck } from '../src/sim/machines';
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
    for (let dx = -3; dx <= 3 && ok; dx++) for (let dy = -3; dy <= 1 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x, y };
  }
}
const tool = (t: string) => registry().items.find((i) => i.id.startsWith(`tool:${t}:`))!.id;
const recipe = (machine: string, out: string) => registry().recipes.find((r) => r.machine === machine && [...r.outputs, ...r.fluidsOut ?? []].some((o) => o.id === out))!;
const powered = (s: GameState, k: string, n: number) => { for (let i = 0; i < n; i++) { s.mach[k].e = 1e4; step(s, gen); } };

describe('P5c organic chemistry + discrete circuit', () => {
  it('the whole chain is reachable and MV machines cost discrete circuits', () => {
    const have = reachable(registry());
    for (const id of ['struct:pyrolyse_oven', 'struct:distillery', 'methanol', 'coal_tar', 'phenol', 'formaldehyde', 'phenolic_resin', 'paper',
      'board:phenolic', 'circuit_board:discrete', 'case:phenolic', 'ingot:silicon', 'transistor', 'diode', 'capacitor', 'circuit:discrete',
      'catalyst:silver', 'catalyst:vanadium_pentoxide', 'sulfur_trioxide', ...MV_BASE.map((b) => `struct:${b}_mv`), 'struct:battery_buffer_mv'])
      expect(have.has(id), id).toBe(true);
    for (const b of [...MV_BASE.map((x) => `${x}_mv`), 'battery_buffer_mv']) {
      const cost = STRUCTURES.find((x) => x.id === b)!.cost;
      expect(cost).toContainEqual(['circuit:discrete', 2]);
      expect(cost.some(([id]) => id === 'circuit:basic'), b).toBe(false);
    }
  });

  it('the pyrolyse oven runs on two LV hatches: wood → charcoal + methanol', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'pyrolyse_oven', x, y);
    place(s, 'energy_hatch', x - 1, y); place(s, 'energy_hatch', x + 1, y);
    place(s, 'maintenance_hatch', x - 1, y - 2);
    const cells = multiCells(STRUCTURES.find((x) => x.id === 'pyrolyse_oven')!, 0);
    expect(cells.filter((c) => c.id === 'cupronickel_coil').length).toBe(8);
    give(s, 'struct:heat_casing', cells.filter((c) => c.id === 'heat_casing').length);
    give(s, 'struct:cupronickel_coil', 8);
    expect(apply(s, gen, { k: 'mfill', key: k }).ok).toBe(true);
    expect(multiCheck(s.ents, gen.w, k).need).toEqual([]);
    const r = recipe('pyrolyse_oven', 'methanol');
    apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
    give(s, 'log:wood', 16); apply(s, gen, { k: 'mload', key: k, n: 1 });
    powered(s, k, 1);
    for (const [t] of MAINT) give(s, tool(t), 1);
    for (let i = 0; i < MAINT.length; i++) apply(s, gen, { k: 'mfix', key: k, i });
    const m = s.mach[k];
    expect(m.ehw).toBe(128);
    powered(s, k, r.ticks + 2);
    expect(m.out['lump:charcoal']).toBe(12);
    expect(m.fl?.methanol).toBe(1000);
    expect(s.flags.methanol).toBeGreaterThan(0);
  });

  it('a catalyst is kept, wears by chance, and blocks the recipe once gone', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'chemical_reactor', x, y), r = recipe('chemical_reactor', 'formaldehyde');
    expect(r.keep).toEqual(['catalyst:silver']);
    apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
    give(s, 'catalyst:silver', 1);
    expect(apply(s, gen, { k: 'mload', key: k, n: 1 }).ok).toBe(true);
    const m = s.mach[k];
    m.fl = { methanol: 100000, oxygen: 50000 };
    let lost = 0;
    for (let i = 0; i < 200; i++) {
      m.out = {}; m.fl = { methanol: 1000, oxygen: 500 }; m.inp['catalyst:silver'] = 1;
      powered(s, k, r.ticks);
      expect(m.fl?.formaldehyde).toBe(1000);
      if (!m.inp['catalyst:silver']) lost++;
    }
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThan(15); // ~2 %
    expect(s.flags.formaldehyde).toBeGreaterThan(0);
    m.fl = { methanol: 1000, oxygen: 500 }; delete m.inp['catalyst:silver'];
    powered(s, k, 1);
    expect(m.st).toBe(MS.noInput);
  });

  it('the contact step needs an MV chemical reactor', () => {
    const r = recipe('chemical_reactor', 'sulfur_trioxide');
    expect(r.tier).toBe('MV');
    const s = structuredClone(s0), { x, y } = spot();
    const lv = place(s, 'chemical_reactor', x, y), mv = place(s, 'chemical_reactor_mv', x + 2, y);
    for (const k of [lv, mv]) {
      expect(apply(s, gen, { k: 'mrec', key: k, recipe: r.id }).ok).toBe(true);
      give(s, 'catalyst:vanadium_pentoxide', 1); apply(s, gen, { k: 'mload', key: k, n: 1 });
      s.mach[k].fl = { sulfur_dioxide: 1000, oxygen: 500 };
    }
    powered(s, lv, 1); powered(s, mv, r.ticks);
    expect(s.mach[lv].st).toBe(MS.tier);
    expect(s.mach[mv].fl?.sulfur_trioxide).toBe(1000);
    expect(MACHINE.get('distillery')!.tier).toBe('MV');
  });
});
