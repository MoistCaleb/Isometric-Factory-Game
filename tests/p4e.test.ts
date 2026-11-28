import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { MAINT } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { STRUCTURES, multiCells } from '../src/data/structures';
import { migrate } from '../src/save/migrations';
import { MS, explode, issues, multiCheck, newMach } from '../src/sim/machines';
import { apply, give } from '../src/sim/player';
import { topoChanged } from '../src/sim/pipes';
import { STATE_VERSION, newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
const K = (x: number, y: number, b = 0) => `${gen.wrapX(x)},${y},${b}`;
const place = (s: GameState, id: string, x: number, y: number, r = 0) => {
  give(s, `struct:${id}`, 1);
  const res = apply(s, gen, { k: 'place', id: `struct:${id}`, x: gen.wrapX(x), y, f: 0, r });
  expect(res.ok, res.msg).toBe(true);
  return Object.keys(res.ents!)[0];
};
/** Dry 7 × 4 area: x-3..x+3, y-2..y+1. */
function spot() {
  for (let i = 0; ; i++) {
    const x = s0.spawn.x + i, y = s0.spawn.y;
    let ok = true;
    for (let dx = -3; dx <= 3 && ok; dx++) for (let dy = -2; dy <= 1 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x, y };
  }
}
const tool = (t: string) => registry().items.find((i) => i.id.startsWith(`tool:${t}:`))!.id;
const recipe = (machine: string, out: string, fluid?: string) =>
  registry().recipes.find((r) => r.machine === machine && r.outputs.some((o) => o.id === out) && (!fluid || r.fluidsIn?.some((f) => f.id === fluid)))!;

/** EBF at (x, y) facing south, a maintenance hatch at its back-left floor, energy hatches left/right of the controller
 * (`two` = both), each fed by 2 steam turbines over a tin cable. Returns the controller key and turbine keys. */
function ebf(s: GameState, two: boolean) {
  const { x, y } = spot();
  const k = place(s, 'ebf', x, y);
  place(s, 'energy_hatch', x - 1, y);
  if (two) place(s, 'energy_hatch', x + 1, y);
  place(s, 'maintenance_hatch', x - 1, y - 2);
  const st = STRUCTURES.find((x) => x.id === 'ebf')!;
  const cells = multiCells(st, 0);
  give(s, 'struct:heat_casing', cells.filter((c) => c.id === 'heat_casing').length);
  give(s, 'struct:cupronickel_coil', 16);
  expect(apply(s, gen, { k: 'mfill', key: k }).ok).toBe(true);
  const ts: string[] = [];
  for (const sx of two ? [-1, 1] : [-1]) {
    place(s, 'tin_cable', x + 2 * sx, y);
    ts.push(place(s, 'steam_turbine', x + 3 * sx, y), place(s, 'steam_turbine', x + 2 * sx, y + 1));
  }
  return { k, ts, x, y };
}
const run = (s: GameState, ts: string[], n: number) => { for (let i = 0; i < n; i++) { for (const t of ts) (s.mach[t] ??= newMach()).steam = 2000; step(s, gen); } };
const fixAll = (s: GameState, k: string) => {
  for (const [t] of MAINT) give(s, tool(t), 1);
  for (let i = 0; i < MAINT.length; i++) expect(apply(s, gen, { k: 'mfix', key: k, i }).ok).toBe(true);
};

describe('P4e gate', () => {
  it('EBF parts, hatches and the oxygen steel route are reachable', () => {
    const have = reachable(registry());
    for (const id of ['ebf', 'heat_casing', 'cupronickel_coil', 'energy_hatch', 'maintenance_hatch', 'output_bus'].map((x) => `struct:${x}`))
      expect(have.has(id), id).toBe(true);
    expect(recipe('ebf', 'ingot:steel', 'oxygen')).toBeDefined();
    expect(recipe('assembler', 'circuit_board:basic')).toBeDefined();
  });

  it('EBF needs its hatches; hatches never replace coils', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'ebf', x, y);
    expect(multiCheck(s.ents, gen.w, k).need.sort()).toEqual(['energy_hatch', 'maintenance_hatch']);
    const st = STRUCTURES.find((x) => x.id === 'ebf')!;
    expect(multiCells(st, 0).filter((c) => c.id === 'cupronickel_coil' && c.hatch)).toHaveLength(0);
    expect(multiCells(st, 0).filter((c) => c.id === 'cupronickel_coil')).toHaveLength(16);
  });

  it('one energy hatch: 64 W — steel from iron + oxygen, but 120 W recipes need two; maintenance slows and gets fixed', () => {
    const s = structuredClone(s0), { k, ts } = ebf(s, false);
    const m = s.mach[k];
    apply(s, gen, { k: 'mrec', key: k, recipe: recipe('ebf', 'ingot:iron').id });
    give(s, 'dust:iron', 4); apply(s, gen, { k: 'mload', key: k, n: 4 });
    run(s, ts, 3);
    expect(m.eh).toBe(1);
    expect(issues(m)).toBe(MAINT.length);
    expect(m.st).toBe(MS.hatchW);
    // Maintenance: no tool → refused; with tools → fixed.
    expect(apply(s, gen, { k: 'mfix', key: k, i: 0 }).ok).toBe(false);
    fixAll(s, k);
    expect(issues(m)).toBe(0);
    expect(s.flags.maint).toBe(MAINT.length);
    // Steel: iron dust + 1000 L oxygen at 64 W.
    apply(s, gen, { k: 'mrec', key: k, recipe: recipe('ebf', 'ingot:steel', 'oxygen').id });
    m.fl = { oxygen: 2000 };
    run(s, ts, 340);
    expect(m.out['ingot:steel']).toBeGreaterThanOrEqual(1);
    expect(s.flags.ebf).toBeGreaterThan(0);
    expect(s.flags.ebf_mv).toBeUndefined();
  });

  it('two energy hatches: 128 W smelts iron at 1811 K without burning the tin lines', () => {
    const s = structuredClone(s0), { k, ts } = ebf(s, true);
    const m = s.mach[k];
    apply(s, gen, { k: 'mrec', key: k, recipe: recipe('ebf', 'ingot:iron').id });
    give(s, 'dust:iron', 4); apply(s, gen, { k: 'mload', key: k, n: 4 });
    run(s, ts, 3);
    fixAll(s, k);
    run(s, ts, 500);
    expect(m.eh).toBe(2);
    expect(m.out['ingot:iron']).toBeGreaterThanOrEqual(1);
    expect(s.flags.ebf_mv).toBeGreaterThan(0);
    expect(Object.values(s.ents).filter((e) => e.s === 'tin_cable')).toHaveLength(2);
    // Titanium (1941 K) fits the coils; vanadium (2183 K) does not.
    apply(s, gen, { k: 'mrec', key: k, recipe: recipe('ebf', 'ingot:vanadium').id });
    give(s, 'dust:vanadium', 1); apply(s, gen, { k: 'mload', key: k, n: 1 });
    run(s, ts, 2);
    expect(m.st).toBe(MS.coils);
  });

  it('contamination blocks building until neutralised with quicklime; toxic dumps contaminate', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const mk = place(s, 'mixer', x, y);
    s.mach[mk].fl = { sulfuric_acid: 1000 };
    expect(apply(s, gen, { k: 'mdump', key: mk }).msg).toMatch(/contaminated/);
    expect(s.haz[`${gen.wrapX(x)},${y}`]).toBe(1);
    apply(s, gen, { k: 'demolish', x, y, f: 0 }); // picks the mixer up
    give(s, 'struct:polarizer', 1);
    const res = apply(s, gen, { k: 'place', id: 'struct:polarizer', x: gen.wrapX(x), y, f: 0, r: 0 });
    expect(res.ok).toBe(false);
    expect(res.msg).toMatch(/Contaminated/);
    expect(apply(s, gen, { k: 'demolish', x, y, f: 0 }).ok).toBe(false); // no quicklime
    give(s, 'dust:quicklime', 1);
    expect(apply(s, gen, { k: 'demolish', x, y, f: 0 }).ok).toBe(true);
    expect(s.haz[`${gen.wrapX(x)},${y}`]).toBeUndefined();
    expect(s.flags.clean).toBe(1);
    place(s, 'polarizer', x, y);
  });

  it('an explosion sets fire to flammable fluid next to it, and the fire spreads along the line', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const bk = K(x, y);
    s.ents[bk] = { s: 'small_boiler', r: 0 }; s.mach[bk] = newMach();
    for (let i = 1; i <= 3; i++) { s.ents[K(x + i, y)] = { s: 'bronze_pipe', r: 0 }; s.pipes[K(x + i, y)] = { id: 'creosote', n: 50 }; }
    s.ents[K(x - 1, y)] = { s: 'bronze_pipe', r: 0 }; s.pipes[K(x - 1, y)] = { id: 'water', n: 50 };
    topoChanged();
    explode(s, gen.w, bk);
    for (let i = 1; i <= 3; i++) expect(s.ents[K(x + i, y)]).toBeUndefined();
    expect(s.ents[K(x - 1, y)]).toBeDefined(); // water doesn't burn
    expect(s.flags.fire).toBe(1);
    expect(s.haz[`${gen.wrapX(x + 2)},${y}`]).toBe(1);
  });

  it('the assembler makes circuits (quest flag); v12 saves gain an empty hazard map', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'assembler', x, y);
    const r = recipe('assembler', 'circuit:basic');
    apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
    for (const i of r.inputs) give(s, i.id, i.n);
    apply(s, gen, { k: 'mload', key: k, n: 1 });
    for (let i = 0; i < r.ticks + 5; i++) { s.mach[k].e = 32; step(s, gen); }
    expect(s.mach[k].out['circuit:basic']).toBe(2);
    expect(s.flags.acirc).toBe(1);
    const raw = { ...structuredClone(s0), version: 12 } as Record<string, unknown> & { version: number };
    delete raw.haz;
    const m = migrate(raw);
    expect(m.version).toBe(STATE_VERSION);
    expect(m.haz).toEqual({});
  });
});
