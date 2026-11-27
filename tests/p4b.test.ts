import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { planet } from '../src/data/planets';
import { migrate } from '../src/save/migrations';
import { MS, simEvents } from '../src/sim/machines';
import { networks } from '../src/sim/pipes';
import { apply, count, give } from '../src/sim/player';
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
    for (let dx = -1; dx < 12 && ok; dx++) ok = dry(x + dx, y) && dry(x + dx, y + 1);
    if (ok) return { x, y };
  }
}
const rec = (machine: string, pred: (r: ReturnType<typeof registry>['recipes'][number]) => boolean) => registry().recipes.find((r) => r.machine === machine && pred(r))!;
/** Step with every listed machine's power buffer topped up. */
const run = (s: GameState, keys: string[], n: number) => { for (let i = 0; i < n; i++) { for (const k of keys) if (s.mach[k]) s.mach[k].e = 32; step(s, gen); } };

describe('P4b chemistry', () => {
  it('chemistry machines, cells and acids are reachable', () => {
    const have = reachable(registry());
    for (const id of ['struct:mixer', 'struct:electrolyzer', 'struct:chemical_reactor', 'struct:chemical_bath', 'struct:roaster', 'struct:canner',
      'struct:electric_pump', 'cell:empty', 'cell:sulfuric_acid', 'sulfuric_acid', 'hydrochloric_acid', 'mercury', 'ingot:zinc', 'roasted:galena'])
      expect(have.has(id), id).toBe(true);
  });

  it('electrolyser keeps three outputs; fresh pipe lines on two sides take different fluids', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const ek = place(s, 'electrolyzer', x, y);
    const a = place(s, 'bronze_pipe', x + 1, y), b = place(s, 'bronze_pipe', x - 1, y);
    apply(s, gen, { k: 'mrec', key: ek, recipe: rec('electrolyzer', (r) => r.fluidsIn?.[0].id === 'brine').id });
    s.mach[ek].fl = { brine: 4000 };
    run(s, [ek], 3);
    expect(s.mach[ek].st).toBe(MS.working);
    run(s, [ek], 800);
    expect(s.flags.chlorine).toBeGreaterThan(0);
    const ids = [a, b].map((k) => s.pipes[k]?.id);
    expect(ids[0]).toBeDefined(); expect(ids[1]).toBeDefined();
    expect(ids[0]).not.toBe(ids[1]);
    expect(s.mach[ek].fl?.brine).toBeUndefined(); // both batches used it up
    const third = ['chlorine', 'hydrogen', 'sodium_hydroxide'].find((f) => !ids.includes(f))!;
    expect(s.mach[ek].fl?.[third]).toBe(2000); // no line for it: it stays inside
  });

  it('cells pour into a mixer and fill from it', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const mk = place(s, 'mixer', x, y);
    apply(s, gen, { k: 'mrec', key: mk, recipe: rec('mixer', (r) => r.fluidsOut?.[0].id === 'brine').id });
    give(s, 'cell:water', 3); give(s, 'dust:salt', 3); give(s, 'cell:empty', 1);
    expect(apply(s, gen, { k: 'mcell', key: mk, id: 'water' }).ok).toBe(true);
    expect(s.mach[mk].fl).toEqual({ water: 3000 });
    expect(count(s, 'cell:empty')).toBe(4);
    apply(s, gen, { k: 'mload', key: mk, n: 3 });
    run(s, [mk], 320);
    expect(s.mach[mk].fl?.brine).toBe(3000);
    expect(s.flags.brine).toBe(3);
    expect(apply(s, gen, { k: 'mcell', key: mk, id: 'brine', fill: true }).ok).toBe(true);
    expect(count(s, 'cell:brine')).toBe(3);
    expect(s.flags.cell).toBe(2);
    // Dumping a toxic gas pollutes.
    s.mach[mk].fl = { chlorine: 2000 };
    apply(s, gen, { k: 'mdump', key: mk, id: 'chlorine' });
    expect(s.mach[mk].fl).toBeUndefined();
    expect(Object.values(s.poll).reduce((t, v) => t + v, 0)).toBeGreaterThan(0);
  });

  it('acid eats bronze pipes, not lead ones', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const br = [0, 1, 2, 3, 4].map((i) => place(s, 'bronze_pipe', x + i, y));
    const pb = [0, 1, 2, 3, 4].map((i) => place(s, 'lead_pipe', x + i, y + 1));
    expect(networks(s.ents, gen.w).length).toBe(2);
    for (const k of [...br, ...pb]) s.pipes[k] = { id: 'sulfuric_acid', n: 100 };
    simEvents.length = 0;
    for (let i = 0; i < 20 * 250; i++) step(s, gen);
    expect(br.some((k) => !s.ents[k])).toBe(true);
    expect(pb.every((k) => s.ents[k])).toBe(true);
    expect(s.flags.corrode).toBeGreaterThan(0);
    expect(simEvents.some((e) => e.msg?.includes('corroded'))).toBe(true);
  });

  it('roaster → calcine + SO₂, electric furnace reduces calcine', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const rk = place(s, 'roaster', x, y), fk = place(s, 'electric_furnace', x + 2, y);
    apply(s, gen, { k: 'mrec', key: rk, recipe: rec('roaster', (r) => r.inputs[0]?.id === 'mdust:galena').id });
    apply(s, gen, { k: 'mrec', key: fk, recipe: rec('electric_furnace', (r) => r.inputs[0]?.id === 'roasted:galena').id });
    give(s, 'mdust:galena', 2); give(s, 'dust:coal', 2);
    apply(s, gen, { k: 'mload', key: rk, n: 2 });
    run(s, [rk], 410);
    expect(s.mach[rk].out['roasted:galena']).toBe(2);
    expect(s.mach[rk].fl?.sulfur_dioxide).toBe(1000);
    expect(s.flags.sulfur_dioxide).toBe(2);
    apply(s, gen, { k: 'mtake', key: rk });
    apply(s, gen, { k: 'mload', key: fk, n: 2 });
    run(s, [fk], 250);
    expect(s.mach[fk].out['ingot:lead']).toBe(2);
  });

  it('electric pump needs power, then pumps 60 L/tick', () => {
    const s = structuredClone(s0);
    let at: { x: number; y: number } | null = null;
    for (let r = 0; r < 400 && !at; r++) for (let dx = -r; dx <= r && !at; dx++) {
      const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + r;
      if (dry(x, y) && gen.surface(gen.wrapX(x - 1), y).water !== Water.None) at = { x, y };
    }
    const k = place(s, 'electric_pump', at!.x, at!.y);
    step(s, gen); step(s, gen);
    expect(s.mach[k].st).toBe(MS.noPower);
    run(s, [k], 10);
    expect(s.mach[k].tank).toEqual({ id: 'water', n: 600 });
  });

  it('v11 saves move recipe-machine tanks into the fluid bag', () => {
    const raw = { ...structuredClone(s0), version: 11 } as unknown as Record<string, unknown> & { version: number };
    const m = () => ({ inp: {}, out: {}, fuel: {}, heat: 290, burn: 0, burnK: 0, prog: 0, st: 0 });
    raw.ents = { '0,0,0': { s: 'coke_oven', r: 0 }, '2,0,0': { s: 'barrel', r: 0 } };
    raw.mach = { '0,0,0': { ...m(), tank: { id: 'creosote', n: 5 } }, '2,0,0': { ...m(), tank: { id: 'water', n: 7 } } };
    const s = migrate(raw);
    expect(s.version).toBe(12);
    expect(s.mach['0,0,0'].fl).toEqual({ creosote: 5 });
    expect(s.mach['0,0,0'].tank).toBeUndefined();
    expect(s.mach['2,0,0'].tank).toEqual({ id: 'water', n: 7 });
  });
});
