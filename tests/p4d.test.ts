import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { BATT, BATT_FULL, BATT_J, ETOOL_J, MACHINE, SCAN_J } from '../src/data/machines';
import { MINERALS } from '../src/data/minerals';
import { planet } from '../src/data/planets';
import { BLOCKS } from '../src/world/blocks';
import { MS, genW, newMach } from '../src/sim/machines';
import { apply, bestTool, count, give, wear } from '../src/sim/player';
import { DAY_TICKS, KNOW, newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const H = new Map(MINERALS.map((m) => [m.id, m.hardness]));
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
    for (let dx = 0; dx < 4 && ok; dx++) for (let dy = 0; dy < 3 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x, y };
  }
}
const polar = (s: GameState, k: string) => {
  const r = registry().recipes.find((x) => x.machine === 'polarizer')!;
  apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
  give(s, 'rod:iron', 64); apply(s, gen, { k: 'mload', key: k, n: 64 });
};
/** Run a lone electric machine with its buffer kept full. */
const runFed = (s: GameState, k: string, n: number) => { for (let i = 0; i < n; i++) { s.mach[k].e = 32; step(s, gen); } };

describe('P4d generators + electric tools', () => {
  it('generators, tools, scanner and rig are reachable', () => {
    const have = reachable(registry());
    for (const id of ['combustion_generator', 'solar_panel', 'wind_turbine', 'water_turbine', 'scanner', 'mining_rig'].map((x) => `struct:${x}`)
      .concat(['tool:drill:steel', 'tool:chainsaw:steel', 'tool:scanner:steel', 'ingot:selenium', 'lens:glass']))
      expect(have.has(id), id).toBe(true);
  });

  it('combustion generator burns poured creosote for a machine, then runs dry', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const gk = place(s, 'combustion_generator', x, y);
    place(s, 'tin_cable', x + 1, y);
    const pk = place(s, 'polarizer', x + 2, y);
    polar(s, pk);
    s.mach[gk] ??= newMach();
    give(s, 'cell:creosote', 1);
    expect(apply(s, gen, { k: 'mcell', key: gk, id: 'creosote' }).ok).toBe(true);
    expect(s.mach[gk].tank).toEqual({ id: 'creosote', n: 1000 });
    for (let i = 0; i < 40; i++) step(s, gen);
    expect(s.mach[pk].st).toBe(MS.working);
    expect(s.mach[gk].st).toBe(MS.working);
    expect(s.mach[gk].tank!.n).toBeLessThan(1000);
    expect(s.flags.combustion_generator).toBeGreaterThan(0);
    s.mach[gk].tank = { id: 'creosote', n: 0.01 };
    for (let i = 0; i < 5; i++) step(s, gen);
    expect(s.mach[gk].tank).toBeUndefined();
    expect(s.mach[gk].st).toBe(MS.noFuel);
    // Wrong fluid is refused.
    give(s, 'cell:water', 1);
    expect(apply(s, gen, { k: 'mcell', key: gk, id: 'water' }).ok).toBe(false);
  });

  it('solar follows the sun, wind follows wind × height, water turbines need a river or lake', () => {
    const s = structuredClone(s0), m = newMach();
    s.weather.rain = 0;
    s.tick = DAY_TICKS / 4; // noon
    expect(genW(s, gen, '0,0,0', m, MACHINE.get('solar_panel')!)).toBeCloseTo(8, 0);
    s.tick = (DAY_TICKS * 3) / 4; // midnight
    expect(genW(s, gen, '0,0,0', m, MACHINE.get('solar_panel')!)).toBe(0);
    const wind = MACHINE.get('wind_turbine')!;
    s.weather.wind = 1;
    expect(genW(s, gen, '0,0,0', m, wind)).toBeCloseTo(32 * 0.3);
    expect(genW(s, gen, '0,0,12', m, wind)).toBeCloseTo(32);
    s.weather.wind = 0;
    expect(genW(s, gen, '0,0,12', m, wind)).toBe(0);
    const wt = MACHINE.get('water_turbine')!;
    const { x, y } = spot();
    expect(genW(s, gen, `${x},${y},0`, m, wt)).toBe(0);
    let river: string | undefined;
    for (let r = 1; r < 3000 && !river; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r % 300]]) {
      const xx = gen.wrapX(s0.spawn.x + dx), yy = s0.spawn.y + dy;
      if (gen.inBounds(yy) && gen.inBounds(yy + 1) && dry(xx, yy) && gen.surface(xx, yy + 1).water === Water.River) { river = `${xx},${yy},0`; break; }
    }
    expect(river).toBeDefined();
    expect(genW(s, gen, river!, m, wt)).toBeCloseTo(24 * 0.8);
  });

  it('electric drill swaps in charged batteries, digs faster, and is skipped when flat', () => {
    const s = structuredClone(s0);
    give(s, 'tool:drill:steel', 1);
    const i = s.tools.findIndex((t) => t?.id === 'tool:drill:steel');
    expect(bestTool(s, 'pickaxe')).toBeNull(); // flat, nothing to swap in
    give(s, BATT_FULL, 1);
    expect(bestTool(s, 'pickaxe')).toEqual({ i, level: 2, elec: true });
    expect(bestTool(s, 'shovel')?.i).toBe(i);
    expect(wear(s, i)).toMatch(/charged battery/);
    expect(s.tools[i]!.e).toBe(BATT_J - ETOOL_J);
    expect(count(s, BATT)).toBe(1);
    expect(count(s, BATT_FULL)).toBe(0);
    expect(s.flags.etool).toBe(1);
    // Dig a soil block: a drill (level 2, ×2) breaks dirt (2 hits) in one.
    const { x, y } = spot();
    const res = apply(s, gen, { k: 'mine', x, y, z: 0 });
    expect(res.ok).toBe(true);
    expect(res.changes, JSON.stringify(res)).toBeDefined();
    expect(s.tools[i]!.e).toBe(BATT_J - 2 * ETOOL_J);
  });

  it('handheld scanner surveys deeper than the hammer for 4 kJ', () => {
    const s = structuredClone(s0);
    give(s, 'tool:scanner:steel', 1); give(s, 'tool:prospector:bronze', 1); give(s, BATT_FULL, 1);
    const res = apply(s, gen, { k: 'prospect', x: s0.spawn.x, y: s0.spawn.y });
    expect(res.ok).toBe(true);
    expect(res.msg).toMatch(/Scanned|No veins within 32/);
    expect(s.flags.escan).toBe(1);
    expect(s.tools.find((t) => t?.id === 'tool:scanner:steel')!.e).toBe(BATT_J - SCAN_J);
  });

  it('scanner block surveys every depth once; mining rig digs ore on power', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const k = place(s, 'scanner', x, y);
    s.mach[k] ??= newMach();
    step(s, gen);
    expect(s.mach[k].st).toBe(MS.noPower);
    runFed(s, k, 605);
    expect(s.mach[k].st).toBe(MS.surveyed);
    expect(s.flags.scan).toBe(1);
    // Rig: a dry tile with ore (hardness ≤ 2) right under its square.
    let at: { x: number; y: number } | undefined;
    for (let r = 0; r < 900 && !at; r += 13) for (let dx = -r; dx <= r && !at; dx += 13) for (const dy of [-r, r]) {
      const xx = gen.wrapX(s0.spawn.x + dx), yy = s0.spawn.y + dy;
      if (!gen.inBounds(yy) || !dry(xx, yy)) continue;
      for (let j = -6; j <= 6 && !at; j++) for (let ii = -6; ii <= 6 && !at; ii++) {
        const mn = BLOCKS[gen.block(gen.wrapX(xx + ii), yy + j, 1)].mineral;
        if (mn && H.get(mn)! <= 2 && gen.surface(gen.wrapX(xx + ii), yy + j).water === Water.None) at = { x: xx, y: yy };
      }
      if (at) break;
    }
    expect(at).toBeDefined();
    const s2 = structuredClone(s0), rk = place(s2, 'mining_rig', at!.x, at!.y);
    s2.mach[rk] ??= newMach();
    runFed(s2, rk, 3000);
    const ores = Object.keys(s2.mach[rk].out).filter((id) => id.startsWith('ore:'));
    expect(ores.length).toBeGreaterThan(0);
    expect(s2.flags.rig).toBeGreaterThan(0);
    expect(Object.values(s2.veins)).toContain(KNOW.exposed);
  });
});
