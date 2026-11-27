import { describe, expect, it } from 'vitest';
import { reachable } from '../src/content/validate';
import { registry } from '../src/content/registry';
import { BATT, BATT_FULL, BATT_J } from '../src/data/machines';
import { planet } from '../src/data/planets';
import { MS, newMach, simEvents } from '../src/sim/machines';
import { apply, count, give } from '../src/sim/player';
import { findNets, netLoad, powerInfo, powerNets } from '../src/sim/power';
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
/** Dry 8 × 5 area. */
function spot() {
  for (let i = 0; ; i++) {
    const x = s0.spawn.x + i, y = s0.spawn.y;
    let ok = true;
    for (let dx = 0; dx < 8 && ok; dx++) for (let dy = 0; dy < 5 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x, y };
  }
}
const turbine = (s: GameState, k: string, steam = 2000) => { s.mach[k] = { ...newMach(), steam }; return s.mach[k]; };
const polar = (s: GameState, k: string) => {
  const r = registry().recipes.find((x) => x.machine === 'polarizer')!;
  apply(s, gen, { k: 'mrec', key: k, recipe: r.id });
  give(s, 'rod:iron', 64); apply(s, gen, { k: 'mload', key: k, n: 64 });
};

describe('P4c grid', () => {
  it('battery, buffer, transformer and breaker are reachable', () => {
    const have = reachable(registry());
    for (const id of ['ingot:lead_antimony', 'battery_case:lead_acid', BATT, 'struct:battery_buffer', 'struct:transformer', 'struct:breaker'])
      expect(have.has(id), id).toBe(true);
  });

  it('battery buffer charges on surplus, carries the load when the turbine stops, gives back charged batteries', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const tk = place(s, 'steam_turbine', x, y);
    place(s, 'tin_cable', x + 1, y);
    const bk = place(s, 'battery_buffer', x + 2, y);
    place(s, 'tin_cable', x + 1, y + 1);
    const pk = place(s, 'polarizer', x + 1, y + 2);
    give(s, BATT, 2);
    expect(apply(s, gen, { k: 'mbat', key: bk, put: BATT }).ok).toBe(true);
    expect(apply(s, gen, { k: 'mbat', key: bk, put: BATT }).ok).toBe(true);
    const t = turbine(s, tk);
    for (let i = 0; i < 100; i++) { t.steam = 2000; step(s, gen); }
    expect(s.mach[bk].e).toBeGreaterThan(0);
    expect(s.mach[bk].pw).toBeGreaterThan(0); // charging
    expect(s.mach[bk].st).toBe(MS.working);
    // Turbine out of steam: the buffer runs the polarizer.
    polar(s, pk);
    t.steam = 0; s.mach[bk].e = BATT_J * 1.5;
    for (let i = 0; i < 40; i++) step(s, gen);
    expect(s.mach[pk].st).toBe(MS.working);
    expect(s.mach[bk].pw).toBeLessThan(0);
    expect(s.flags.discharge).toBeGreaterThan(0);
    // Take out: first charged (≥ 1 battery's worth), then empty.
    expect(apply(s, gen, { k: 'mbat', key: bk }).ok).toBe(true);
    expect(count(s, BATT_FULL)).toBe(1);
    expect(apply(s, gen, { k: 'mbat', key: bk }).ok).toBe(true);
    expect(count(s, BATT)).toBe(1);
    expect(s.mach[bk].e).toBe(0);
    step(s, gen);
    expect(s.mach[bk].st).toBe(MS.noBatt);
  });

  it('a breaker trips instead of burning, splits the line, and resets', () => {
    const s = structuredClone(s0), { x, y } = spot();
    // Five turbines (160 W) → breaker (4 A) → copper line with 5 polarizers (160 W wanted = 5 A → trips).
    const tks = [0, 1, 2, 3, 4].map((i) => place(s, 'steam_turbine', x, y + i));
    for (let i = 0; i < 5; i++) place(s, 'copper_cable', x + 1, y + i);
    const bk = place(s, 'breaker', x + 2, y);
    for (let i = 3; i <= 7; i++) place(s, 'copper_cable', x + i, y);
    for (let i = 3; i <= 7; i++) place(s, 'polarizer', x + i, y + 1);
    for (const k of tks) turbine(s, k);
    simEvents.length = 0;
    step(s, gen);
    expect(s.ents[bk]?.trip).toBe(1);
    expect(simEvents.some((e) => e.msg?.includes('breaker tripped'))).toBe(true);
    expect(s.flags.trip).toBe(1);
    expect(powerNets(s.ents, gen.w)).toHaveLength(2);
    // The overlay sees both networks: the turbine side has a source but no load, the far side none.
    step(s, gen);
    const ids = findNets(s.ents, gen.w).map((n) => n.id);
    expect(ids.map((id) => netLoad[id]).sort()).toEqual([-1, 0]);
    expect(apply(s, gen, { k: 'conduit', key: bk, trip: 0 }).ok).toBe(true);
    expect(s.ents[bk].trip).toBeUndefined();
    expect(s.flags.breaker).toBe(1);
    expect(powerNets(s.ents, gen.w)).toHaveLength(1);
  });

  it('transformers: step up over copper, step down to LV; 128 V explodes LV machines', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const tk = place(s, 'steam_turbine', x, y);
    place(s, 'tin_cable', x + 1, y);
    const up = place(s, 'transformer', x + 2, y, 0); // front = south
    place(s, 'copper_cable', x + 2, y + 1); place(s, 'copper_cable', x + 2, y + 2);
    const down = place(s, 'transformer', x + 2, y + 3, 2); // front = north
    place(s, 'tin_cable', x + 3, y + 3);
    const pk = place(s, 'polarizer', x + 4, y + 3);
    apply(s, gen, { k: 'mxf', key: up });
    expect(s.mach[up].up).toBe(true);
    polar(s, pk);
    const t = turbine(s, tk);
    for (let i = 0; i < 60; i++) { t.steam = 2000; step(s, gen); }
    expect(s.mach[pk].st).toBe(MS.working);
    expect(s.flags.xfmr).toBeGreaterThan(0);
    expect(powerInfo.get(down)).toBeDefined();
    const hv = findNets(s.ents, gen.w).find((n) => n.keys.includes(`${gen.wrapX(x + 2)},${y + 1},0`))!;
    expect(hv.keys).toHaveLength(2);
    // An LV macerator on the 128 V line explodes.
    const mk = place(s, 'macerator', x + 3, y + 1);
    simEvents.length = 0;
    t.steam = 2000; step(s, gen);
    expect(s.ents[mk]).toBeUndefined();
    expect(s.flags.overvolt).toBe(1);
    expect(simEvents.some((e) => e.msg?.includes('exploded'))).toBe(true);
  });
});
