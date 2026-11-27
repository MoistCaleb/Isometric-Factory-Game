import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/content/registry';
import { reachable, validate } from '../src/content/validate';
import { MATERIALS } from '../src/data/materials';

const reg = buildRegistry();

describe('content', () => {
  it('has 61 materials', () => expect(MATERIALS).toHaveLength(61));
  it('validates with no errors', () => expect(validate(reg).errors).toEqual([]));
  it('hand plate is wasteful (2 ingots → 1 plate)', () => {
    const r = reg.recipesFor('plate:copper').find((x) => x.machine === 'hand')!;
    expect(r.inputs).toEqual([{ id: 'ingot:copper', n: 2 }]);
    expect(r.tools).toEqual(['hammer']);
  });
  it('high-melt metals need EBF heat; >2200 K gives hot ingots', () => {
    const ti = reg.recipesFor('hot_ingot:tungsten')[0];
    expect(ti.machine).toBe('ebf');
    expect(ti.minHeatK).toBe(3695);
    expect(reg.recipesFor('ingot:tungsten').some((r) => r.machine === 'vacuum_freezer')).toBe(true);
  });
  it('machine crushing doubles ore', () => {
    const r = reg.recipesFor('crushed_ore:galena').find((x) => x.machine === 'macerator')!;
    expect(r.outputs[0].n).toBe(2);
  });
  it('bronze pick reaches H1, steel H2', () => {
    expect(reg.item('tool:pickaxe:bronze')!.tool!.level).toBe(1);
    expect(reg.item('tool:pickaxe:steel')!.tool!.level).toBe(2);
  });
  it('flint tools reachable from the world', () => {
    const r = reachable(reg);
    for (const id of ['tool:knife:flint', 'tool:pickaxe:flint', 'tool:hammer:stone', 'crushed_ore:native_copper']) expect(r.has(id)).toBe(true);
  });
});
