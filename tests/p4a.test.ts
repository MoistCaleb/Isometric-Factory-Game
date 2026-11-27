import { describe, expect, it } from 'vitest';
import { generate } from '../src/content/generate';
import { reachable } from '../src/content/validate';
import { planet } from '../src/data/planets';
import { MS, simEvents } from '../src/sim/machines';
import { apply, give } from '../src/sim/player';
import { powerInfo, powerNets } from '../src/sim/power';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/step';
import { Water, worldGen } from '../src/world/gen';
import { registry } from '../src/content/registry';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
const place = (s: GameState, id: string, x: number, y: number) => {
  give(s, `struct:${id}`, 1);
  const res = apply(s, gen, { k: 'place', id: `struct:${id}`, x: gen.wrapX(x), y, f: 0, r: 0 });
  expect(res.ok, res.msg).toBe(true);
  return Object.keys(res.ents!)[0];
};
/** Dry row of 12 tiles. */
function spot() {
  for (let i = 0; ; i++) {
    const x = s0.spawn.x + i, y = s0.spawn.y;
    let ok = true;
    for (let dx = 0; dx < 12 && ok; dx++) ok = dry(x + dx, y) && dry(x + dx, y + 1);
    if (ok) return { x, y };
  }
}
const recipe = (machine: string, out: string) => registry().recipes.find((r) => r.machine === machine && r.outputs[0]?.id === out)!;

describe('P4a power', () => {
  it('LV machines, parts and circuits are reachable', () => {
    const have = reachable(registry());
    for (const id of ['circuit:basic', 'hull:lv', 'motor:lv', 'robot_arm:lv', 'struct:steam_turbine', 'struct:assembler', 'struct:thermal_centrifuge', 'struct:fuse'])
      expect(have.has(id), id).toBe(true);
    expect(generate().recipes.some((r) => r.machine === 'polarizer')).toBe(true);
  });

  it('turbine → tin cable → macerator: runs, loses a little, throttles steam', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const tk = place(s, 'steam_turbine', x, y);
    for (let i = 1; i <= 4; i++) place(s, 'tin_cable', x + i, y);
    const mk = place(s, 'macerator', x + 5, y);
    expect(powerNets(s.ents, gen.w)[0].links.map((l) => l.ctl).sort()).toEqual([mk, tk].sort());
    const t = s.mach[tk] ??= { inp: {}, out: {}, fuel: {}, heat: 290, burn: 0, burnK: 0, prog: 0, st: 0 };
    const r = recipe('macerator', 'pulp:wood');
    apply(s, gen, { k: 'mrec', key: mk, recipe: r.id });
    give(s, 'log:wood', 4);
    apply(s, gen, { k: 'mload', key: mk, n: 4 });
    step(s, gen);
    expect(s.mach[mk].st).toBe(MS.noPower);
    t.steam = 2000;
    for (let i = 0; i < 60; i++) step(s, gen);
    const info = powerInfo.get(mk)!;
    expect(info.v).toBe(32);
    expect(info.loss).toBeGreaterThan(0);
    expect(info.a).toBeLessThan(2);
    expect(s.mach[mk].st).toBe(MS.working);
    expect(s.mach[tk].st).toBe(MS.working);
    // Steady state: machine draws its 16 W recipe, turbine uses well under its 16 L/tick.
    expect(2000 - t.steam!).toBeLessThan(60 * 16);
    for (let i = 0; i < 400; i++) { t.steam = 2000; step(s, gen); }
    expect(s.mach[mk].out['pulp:wood']).toBeGreaterThan(0);
  });

  it('overcurrent blows the fuse first; no generator = no power', () => {
    const s = structuredClone(s0), { x, y } = spot();
    // Three turbines (96 W = 3 A at 32 V) feed a tin line (2 A) through a fuse.
    const tks = [place(s, 'steam_turbine', x, y), place(s, 'steam_turbine', x, y + 1), place(s, 'steam_turbine', x + 2, y + 1)];
    place(s, 'tin_cable', x + 1, y); place(s, 'tin_cable', x + 1, y + 1);
    const fk = place(s, 'fuse', x + 2, y);
    for (let i = 3; i <= 6; i++) place(s, 'tin_cable', x + i, y);
    // Four machines along the line, each wanting 32 W to fill its buffer: 128 W = 4 A > 2 A.
    for (let i = 3; i <= 6; i++) place(s, 'polarizer', x + i, y + 1);
    for (const k of tks) s.mach[k] = { inp: {}, out: {}, fuel: {}, heat: 290, burn: 0, burnK: 0, prog: 0, st: 0, steam: 2000 };
    simEvents.length = 0;
    step(s, gen);
    expect(s.ents[fk]).toBeUndefined();
    expect(simEvents.some((e) => e.msg?.includes('fuse'))).toBe(true);
    // Line is cut: machines past the fuse get nothing.
    step(s, gen); step(s, gen);
    const pk = `${gen.wrapX(x + 4)},${y + 1},0`;
    expect(s.mach[pk].pw).toBe(0);
  });
});
