import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { MACHINE, MAINT } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { STRUCTURES, multiCells } from '../src/data/structures';
import { MS, heatDiscount, multiCheck, newMach } from '../src/sim/machines';
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
const powered = (s: GameState, k: string, n: number) => { for (let i = 0; i < n; i++) { s.mach[k].e = 1e4; step(s, gen); } };

/** An EBF with 2 LV energy hatches + maintenance, coils auto-filled from `coils` (id → count). */
function ebf(coils: Record<string, number>) {
  const s = structuredClone(s0), { x, y } = spot();
  const k = place(s, 'ebf', x, y);
  place(s, 'energy_hatch', x - 1, y); place(s, 'energy_hatch', x + 1, y);
  place(s, 'maintenance_hatch', x - 1, y - 2);
  const cells = multiCells(STRUCTURES.find((x) => x.id === 'ebf')!, 0);
  give(s, 'struct:heat_casing', cells.filter((c) => c.id === 'heat_casing').length);
  for (const [id, n] of Object.entries(coils)) give(s, `struct:${id}`, n);
  expect(apply(s, gen, { k: 'mfill', key: k }).ok).toBe(true);
  return { s, k };
}
function run(s: GameState, k: string, out: string, inputs: [string, number][]) {
  const r = recipe('ebf', out);
  apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
  for (const [id, n] of inputs) { give(s, id, n); apply(s, gen, { k: 'mload', key: k, n }); }
  powered(s, k, 1);
  for (const [t] of MAINT) give(s, tool(t), 1);
  for (let i = 0; i < MAINT.length; i++) apply(s, gen, { k: 'mfix', key: k, i });
  return r;
}

describe('P5d chromium + Kanthal coils', () => {
  it('soda ash, chromium, Kanthal and its coil are reachable', () => {
    const have = reachable(registry());
    for (const id of ['dust:soda_ash', 'dust:sodium_chromate', 'dust:sodium_dichromate', 'dust:chromium_oxide', 'dust:chromium', 'dust:kanthal',
      'ingot:kanthal', 'wire:kanthal', 'struct:kanthal_coil', 'ingot:chromium']) expect(have.has(id), id).toBe(true);
  });

  it('auto-fill takes the hottest coils; the coolest coil sets the heat', () => {
    const all = ebf({ kanthal_coil: 16, cupronickel_coil: 16 });
    expect(multiCheck(all.s.ents, gen.w, all.k).heat).toBe(2600);
    expect(all.s.inv.some((x) => x?.id === 'struct:cupronickel_coil' && x.n === 16)).toBe(true);
    const mixed = ebf({ kanthal_coil: 10, cupronickel_coil: 16 });
    expect(multiCheck(mixed.s.ents, gen.w, mixed.k)).toMatchObject({ miss: [], heat: 2000 });
  });

  it('chromium ingot (2180 K) needs Kanthal coils, and sets ebf_hot', () => {
    const cu = ebf({ cupronickel_coil: 16 });
    run(cu.s, cu.k, 'ingot:chromium', [['dust:chromium', 1]]);
    powered(cu.s, cu.k, 2);
    expect(cu.s.mach[cu.k].st).toBe(MS.coils);
    const ka = ebf({ kanthal_coil: 16 });
    const r = run(ka.s, ka.k, 'ingot:chromium', [['dust:chromium', 1]]);
    powered(ka.s, ka.k, r.ticks + 2);
    expect(ka.s.mach[ka.k].out['ingot:chromium']).toBe(1);
    expect(ka.s.flags.ebf_hot).toBeGreaterThan(0);
  });

  it('aluminothermic reduction gives chromium + alumina; spare heat cuts power 5 % per 900 K', () => {
    const { s, k } = ebf({ kanthal_coil: 16 });
    const r = run(s, k, 'dust:chromium', [['dust:chromium_oxide', 1], ['dust:aluminium', 2]]);
    const def = MACHINE.get('ebf')!;
    expect(heatDiscount(def, s.mach[k], r)).toBeCloseTo(0.95); // 2600 − 1300 = 1300 K → 1 step
    expect(heatDiscount(def, { ...newMach(), ck: 2900 }, { ...r, minHeatK: 1000 })).toBeCloseTo(0.9025);
    powered(s, k, r.ticks + 2);
    expect(s.mach[k].out).toMatchObject({ 'dust:chromium': 2, 'dust:alumina': 1 });
  });

  it('quests: Kanthal coils follow the discrete circuit and chromium', async () => {
    const { QUEST } = await import('../src/data/quests');
    const { unlocked } = await import('../src/sim/quests');
    expect(QUEST.get('m_chromium')!.chapter).toBe('chem');
    expect(unlocked(QUEST.get('m_kanthal')!, { m_discrete: 2 })).toBe(false);
    expect(unlocked(QUEST.get('m_kanthal')!, { m_discrete: 2, m_chromium: 2 })).toBe(true);
  });
});
