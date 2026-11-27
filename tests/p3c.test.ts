import { describe, expect, it } from 'vitest';
import { registry } from '../src/content/registry';
import { DIG_H, DIG_R, STEAM_BUF, THUMP_TICKS } from '../src/data/machines';
import { MINERALS } from '../src/data/minerals';
import { planet } from '../src/data/planets';
import { MS, simEvents } from '../src/sim/machines';
import { apply, give } from '../src/sim/player';
import { KNOW, newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { BLOCKS } from '../src/world/blocks';
import { Tree, Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const H = new Map(MINERALS.map((m) => [m.id, m.hardness]));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
const put = (s: GameState, id: string, x: number, y: number) => {
  give(s, `struct:${id}`, 1);
  const r = apply(s, gen, { k: 'place', id: `struct:${id}`, x, y, f: 0, r: 0 });
  expect(r.ok, r.msg).toBe(true);
  return `${gen.wrapX(x)},${y},0`;
};
/** Run with the machine's steam buffer kept full (stands in for a boiler + pipe). */
const run = (s: GameState, key: string, n: number) => {
  for (let i = 0; i < n; i++) { if (s.mach[key]) s.mach[key].steam = STEAM_BUF; step(s, gen); }
};
/** Dry tile with steam-mineable ore within the excavator's reach (first layers only, to keep the test quick). */
function oreSpot(): { x: number; y: number } {
  for (let r = 0; r < 600; r += 3) for (let dx = -r; dx <= r; dx += 3) for (const dy of [-r, r]) {
    const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + dy;
    if (!gen.inBounds(y) || !dry(x, y)) continue;
    for (let z = 1; z <= 2; z++) for (let j = -DIG_R; j <= DIG_R; j++) for (let i = -DIG_R; i <= DIG_R; i++) {
      const mn = BLOCKS[gen.block(gen.wrapX(x + i), y + j, z)].mineral;
      if (mn && H.get(mn)! <= DIG_H && gen.surface(gen.wrapX(x + i), y + j).water === Water.None) return { x, y };
    }
  }
  throw new Error('no ore spot');
}

describe('P3c', () => {
  it('steam excavator mines ore below it into its output, exposing the vein', () => {
    const s = structuredClone(s0), at = oreSpot(), k = put(s, 'steam_excavator', at.x, at.y);
    simEvents.length = 0;
    run(s, k, 1200);
    const ore = Object.entries(s.mach[k].out).filter(([id]) => id.startsWith('ore:'));
    expect(ore.length).toBeGreaterThan(0);
    expect(Object.values(s.diffs)).toContain(0);
    expect(Object.values(s.veins)).toContain(KNOW.exposed);
    expect(simEvents.some((e) => e.changes)).toBe(true);
    // No steam → stops.
    const s2 = structuredClone(s0), k2 = put(s2, 'steam_excavator', at.x, at.y);
    for (let i = 0; i < 200; i++) step(s2, gen);
    expect(Object.keys(s2.mach[k2]?.out ?? {}).length).toBe(0);
  });

  it('steam thumper surveys once, deeper than the hammer', () => {
    const s = structuredClone(s0);
    let at = { x: s0.spawn.x, y: s0.spawn.y };
    for (let i = 1; !dry(at.x, at.y); i++) at = { x: s0.spawn.x + i, y: s0.spawn.y };
    const k = put(s, 'steam_thumper', at.x, at.y);
    run(s, k, THUMP_TICKS + 5);
    expect(s.mach[k].st).toBe(MS.surveyed);
    expect(s.flags.thump).toBe(1);
    const surveyed = Object.entries(s.veins).filter(([, v]) => v === KNOW.surveyed).map(([id]) => id);
    expect(surveyed.length).toBeGreaterThan(0);
    run(s, k, THUMP_TICKS + 5);
    expect(s.flags.thump).toBe(1);
  });

  it('treetap taps rubber trees for resin and leaves them standing', () => {
    const s = structuredClone(s0);
    let t: { x: number; y: number } | null = null;
    for (let r = 0; r < 3000 && !t; r += 2) for (let dx = -r; dx <= r && !t; dx += 2) {
      const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + (r % 400) - 200;
      if (gen.inBounds(y) && gen.tree(x, y) === Tree.Jungle) t = { x, y };
    }
    expect(t).not.toBeNull();
    give(s, 'tool:treetap:wood', 1);
    for (let i = 0; i < 3; i++) apply(s, gen, { k: 'mine', x: t!.x, y: t!.y, z: 0 });
    expect(s.inv.some((sl) => sl?.id === 'sticky_resin')).toBe(true);
    expect(s.diffs[`${t!.x},${t!.y},t`]).toBeUndefined();
    expect(s.flags.tap).toBe(1);
  });

  it('steam pump needs steam, then pumps 40 L/tick', () => {
    const s = structuredClone(s0);
    let at: { x: number; y: number } | null = null;
    for (let r = 0; r < 400 && !at; r++) for (let dx = -r; dx <= r && !at; dx++) {
      const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + r;
      if (dry(x, y) && gen.surface(gen.wrapX(x - 1), y).water !== Water.None) at = { x, y };
    }
    const k = put(s, 'steam_pump', at!.x, at!.y);
    for (let i = 0; i < 5; i++) step(s, gen);
    expect(s.mach[k].st).toBe(MS.noSteam);
    run(s, k, 10);
    expect(s.mach[k].tank?.n).toBe(400);
  });

  it('steam ladder + rubber recipes exist', () => {
    const R = registry();
    const has = (m: string, inp: string, out: string) => R.recipes.some((r) => r.machine === m && r.inputs.some((i) => i.id === inp) && r.outputs.some((o) => o.id === out));
    expect(has('steam_macerator', 'purified_ore:cassiterite', 'mdust:cassiterite')).toBe(true);
    expect(has('steam_macerator', 'crushed_ore:cassiterite', 'impure_mdust:cassiterite')).toBe(true);
    expect(has('steam_ore_washer', 'impure_mdust:cassiterite', 'mdust:cassiterite')).toBe(true);
    expect(has('steam_furnace', 'purified_ore:cassiterite', 'ingot:tin')).toBe(true);
    expect(has('steam_extractor', 'sticky_resin', 'raw:rubber')).toBe(true);
    expect(has('steam_alloy_smelter', 'raw:rubber', 'sheet:rubber')).toBe(true);
    expect(has('steam_compressor', 'plate:bronze', 'double_plate:bronze')).toBe(true);
  });
});
