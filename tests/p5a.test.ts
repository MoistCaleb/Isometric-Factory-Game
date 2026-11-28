import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { MAINT } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { STRUCTURES, multiCells } from '../src/data/structures';
import { MS, multiCheck, newMach } from '../src/sim/machines';
import { apply, give } from '../src/sim/player';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
const place = (s: GameState, id: string, x: number, y: number) => {
  give(s, `struct:${id}`, 1);
  const res = apply(s, gen, { k: 'place', id: `struct:${id}`, x: gen.wrapX(x), y, f: 0, r: 0 });
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
const recipe = (machine: string, out: string) => registry().recipes.find((r) => r.machine === machine && (r.outputs.some((o) => o.id === out) || r.fluidsOut?.some((o) => o.id === out)))!;

const run = (s: GameState, ts: string[], n: number) => { for (let i = 0; i < n; i++) { for (const t of ts) (s.mach[t] ??= newMach()).steam = 2000; step(s, gen); } };
/** Hall–Héroult cell facing south with a maintenance hatch, energy hatches beside the controller, 2 steam turbines each. */
function cell(s: GameState, two: boolean) {
  const { x, y } = spot();
  const k = place(s, 'hall_heroult', x, y);
  place(s, 'energy_hatch', x - 1, y);
  if (two) place(s, 'energy_hatch', x + 1, y);
  place(s, 'maintenance_hatch', x - 1, y - 2);
  const cells = multiCells(STRUCTURES.find((x) => x.id === 'hall_heroult')!, 0);
  give(s, 'struct:carbon_casing', cells.filter((c) => c.id === 'carbon_casing').length);
  give(s, 'struct:cathode_block', 2);
  expect(apply(s, gen, { k: 'mfill', key: k }).ok).toBe(true);
  const ts: string[] = [];
  for (const sx of two ? [-1, 1] : [-1]) {
    place(s, 'tin_cable', x + 2 * sx, y);
    ts.push(place(s, 'steam_turbine', x + 3 * sx, y), place(s, 'steam_turbine', x + 2 * sx, y + 1));
  }
  run(s, ts, 1); // a new multiblock gets every issue on its first tick
  for (const [t] of MAINT) give(s, tool(t), 1);
  for (let i = 0; i < MAINT.length; i++) expect(apply(s, gen, { k: 'mfix', key: k, i }).ok).toBe(true);
  return { k, ts };
}

describe('P5a aluminium', () => {
  it('the Bayer / cryolite / Hall–Héroult chain and the MV hull are reachable', () => {
    const have = reachable(registry());
    for (const id of ['dust:alumina', 'dust:cryolite', 'electrode:graphite', 'small_dust:gallium', 'ingot:aluminium', 'hull:mv',
      'struct:hall_heroult', 'struct:carbon_casing', 'struct:cathode_block']) expect(have.has(id), id).toBe(true);
    expect(recipe('chemical_reactor', 'sodium_aluminate').fluidsOut!.map((f) => f.id)).toContain('red_mud');
    expect(recipe('mixer', 'dust:aluminium_hydroxide').fluidsOut![0].id).toBe('sodium_hydroxide');
  });

  it('the pot needs energy + maintenance hatches; the cathode is never a hatch slot', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'hall_heroult', x, y);
    expect(multiCheck(s.ents, gen.w, k).need.sort()).toEqual(['energy_hatch', 'maintenance_hatch']);
    const cells = multiCells(STRUCTURES.find((x) => x.id === 'hall_heroult')!, 0);
    expect(cells.filter((c) => c.id === 'carbon_casing')).toHaveLength(9); // 3 × 4 pot line (P5g)
    expect(cells.find((c) => c.id === 'cathode_block')!.hatch).toBe(false);
  });

  it('one hatch is not enough; two smelt alumina into aluminium, eat the anode and keep the CO₂', () => {
    const s = structuredClone(s0), { k, ts } = cell(s, false);
    const m = s.mach[k], r = recipe('hall_heroult', 'ingot:aluminium');
    apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
    for (const i of r.inputs) give(s, i.id, i.n);
    apply(s, gen, { k: 'mload', key: k, n: 1 });
    run(s, ts, 3);
    expect(m.st).toBe(MS.hatchW);

    const s2 = structuredClone(s0), c2 = cell(s2, true), m2 = s2.mach[c2.k];
    apply(s2, gen, { k: 'mrec', key: c2.k, recipe: r.id });
    for (const i of r.inputs) give(s2, i.id, i.n);
    apply(s2, gen, { k: 'mload', key: c2.k, n: 1 });
    run(s2, c2.ts, r.ticks + 60);
    expect(m2.eh).toBe(2);
    expect(m2.out['ingot:aluminium']).toBe(4);
    expect(m2.inp['electrode:graphite'] ?? 0).toBe(0);
    expect(m2.fl?.carbon_dioxide).toBe(1000);
    expect(s2.flags.aluminium).toBe(1);
  });

  it('the MV chapter starts after the EBF and runs Bayer → cryolite → cell → hull', async () => {
    const { QUEST } = await import('../src/data/quests');
    const { unlocked } = await import('../src/sim/quests');
    expect(unlocked(QUEST.get('m_bayer')!, { l_ebf_mv: 2 })).toBe(false);
    expect(unlocked(QUEST.get('m_bayer')!, { l_ebf_mv: 2, l_chloralkali: 2 })).toBe(true);
    expect(QUEST.get('m_hall')!.req).toEqual(['m_cryolite']);
    expect(QUEST.get('m_red_mud')!.chapter).toBe('chem');
  });
});
