import { describe, expect, it } from 'vitest';
import { planet } from '../src/data/planets';
import { migrate } from '../src/save/migrations';
import { apply, give, mine } from '../src/sim/player';
import { KNOW, newGame } from '../src/sim/state';
import { isOre } from '../src/world/blocks';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(11);
const gen = worldGen(11, planet('earth'));
const fresh = () => structuredClone(s0);

/** A tile at the surface core of a nearby outcrop vein. */
function outcropTile() {
  const v = gen.veinsAround(s0.spawn.x, s0.spawn.y, 12).find((v) => v.def.outcrop)!;
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = gen.wrapX(v.x + dx), y = v.y + dy, o = gen.ore(x, y, 0);
    if (o && isOre(gen.block(x, y, 0))) return { x, y, v: o };
  }
  throw new Error('no outcrop');
}

/** Scan rows around spawn for the first tile matching pred. */
function find<T>(pred: (x: number, y: number) => T | null | undefined | false, r = 600): { x: number; y: number; v: T } {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + dy, v = pred(x, y);
    if (v) return { x, y, v };
  }
  throw new Error('not found');
}

describe('vein discovery', () => {
  it('surface samples sit over shallow veins on dry, treeless land', () => {
    let n = 0;
    for (let y = s0.spawn.y - 200; y < s0.spawn.y + 200; y += 3) for (let x = s0.spawn.x - 200; x < s0.spawn.x + 200; x += 3) {
      const smp = gen.sample(x, y);
      if (!smp) continue;
      n++;
      const sf = gen.surface(x, y);
      expect(sf.water).toBe(Water.None);
      expect(gen.tree(x, y)).toBe(0);
      expect(smp.vein.z0).toBeLessThanOrEqual(8);
      expect(gen.veinDist(smp.vein, x, y)).toBeLessThanOrEqual(1);
      expect(smp.mineral.startsWith('mat:')).toBe(false);
    }
    expect(n).toBeGreaterThan(10);
  });

  it('picking up a sample gives ore + a hint, once', () => {
    const s = fresh();
    const t = find((x, y) => gen.sample(x, y));
    const r = mine(s, gen, t.x, t.y, 0);
    expect(r.ok).toBe(true);
    expect(r.gained?.[0].id).toBe(`ore:${t.v.mineral}`);
    expect(s.veins[t.v.vein.id]).toBe(KNOW.hint);
    expect(s.diffs[`${t.x},${t.y},s`]).toBe(0);
    expect(mine(s, gen, t.x, t.y, 0).target).not.toMatch(/sample/);
    const c = gen.hintCentre(t.v.vein);
    expect(Math.hypot(gen.dx(c.x, t.v.vein.x), c.y - t.v.vein.y)).toBeLessThanOrEqual(5 * Math.SQRT2);
  });

  it('outcrop veins show ore at the surface', () => {
    const t = outcropTile();
    expect(t.v.vein.def.outcrop).toBe(true);
  });

  it('mining an ore block exposes its vein', () => {
    const s = fresh();
    give(s, 'tool:pickaxe:bronze', 1);
    const t = outcropTile();
    let r; for (let i = 0; i < 40 && (r = mine(s, gen, t.x, t.y, 0)).progress; i++);
    expect(r!.ok).toBe(true);
    expect(s.veins[t.v.vein.id]).toBe(KNOW.exposed);
    expect(r!.veins).toEqual({ [t.v.vein.id]: KNOW.exposed });
  });

  it('prospector surveys nearby veins to layer 8 and wears the tool', () => {
    const s = fresh();
    expect(apply(s, gen, { k: 'prospect', x: s.spawn.x, y: s.spawn.y }).ok).toBe(false);
    give(s, 'tool:prospector:bronze', 1);
    const v = gen.veinsAround(s.spawn.x, s.spawn.y, 3).find((v) => v.z0 <= 8)!;
    const r = apply(s, gen, { k: 'prospect', x: v.x, y: v.y });
    expect(r.ok).toBe(true);
    const ids = Object.keys(r.veins ?? {});
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) { expect(s.veins[id]).toBe(KNOW.surveyed); expect(gen.veinById(id)!.z0).toBeLessThanOrEqual(8); }
    expect(s.tools.find((t) => t?.id === 'tool:prospector:bronze')?.dur).toBeLessThan(64);
  });

  it('v5 saves migrate with no known veins', () => {
    const old = { ...fresh(), version: 5 } as Record<string, unknown>;
    delete old.veins;
    expect(migrate(old as never).veins).toEqual({});
  });
});
