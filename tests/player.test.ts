import { describe, expect, it } from 'vitest';
import { planet } from '../src/data/planets';
import { registry } from '../src/content/registry';
import { bestTool, count, craft, give, mine, missing, move } from '../src/sim/player';
import { newGame } from '../src/sim/state';
import { B } from '../src/world/blocks';
import { Tree, Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const fresh = () => structuredClone(s0);
/** A dry, treeless land tile near spawn with ordinary dirt-ish soil below. */
function landTile(pred: (x: number, y: number) => boolean = () => true) {
  for (let r = 0; r < 200; r++) for (let dx = -r; dx <= r; dx++) {
    const x = s0.spawn.x + dx, y = s0.spawn.y + r;
    const sf = gen.surface(x, y);
    if (sf.water === Water.None && !sf.ice && !gen.tree(x, y) && pred(x, y)) return { x: gen.wrapX(x), y };
  }
  throw new Error('no tile');
}
const dig = (s: ReturnType<typeof fresh>, x: number, y: number, z: number, max = 30) => {
  for (let i = 0; i < max; i++) { const r = mine(s, gen, x, y, z); if (!r.progress) return r; }
  throw new Error('never broke');
};

describe('inventory', () => {
  it('stacks to 64 and fills slots', () => {
    const s = fresh();
    expect(give(s, 'dirt', 100)).toBe(0);
    expect(s.inv[0]).toEqual({ id: 'dirt', n: 64 });
    expect(s.inv[1]).toEqual({ id: 'dirt', n: 36 });
    expect(count(s, 'dirt')).toBe(100);
  });
  it('tools go to tool slots with durability', () => {
    const s = fresh();
    give(s, 'tool:pickaxe:flint', 1);
    expect(s.tools[0]?.dur).toBe(40);
    expect(bestTool(s, 'pickaxe')?.level).toBe(0);
  });
  it('tool slots reject non-tools; merging works', () => {
    const s = fresh();
    give(s, 'dirt', 10);
    expect(move(s, { box: 'inv', i: 0 }, { box: 'tools', i: 0 }).ok).toBe(false);
    s.inv[5] = { id: 'dirt', n: 60 };
    move(s, { box: 'inv', i: 0 }, { box: 'inv', i: 5 });
    expect(s.inv[5]?.n).toBe(64);
    expect(s.inv[0]?.n).toBe(6);
  });
});

describe('mining', () => {
  it('hand-digs surface soil slowly, then the layer below', () => {
    const s = fresh();
    const t = landTile((x, y) => gen.terrain(x, y, 0) === B.grass && gen.block(x, y, 1) === B.dirt);
    const r = dig(s, t.x, t.y, 0);
    expect(r.ok).toBe(true);
    expect(s.diffs[`${t.x},${t.y},0`]).toBe(B.air);
    expect(count(s, 'dirt')).toBe(1);
    // Tapping the open hole from the surface view digs the next layer down.
    dig(s, t.x, t.y, 0);
    expect(s.diffs[`${t.x},${t.y},1`]).toBe(B.air);
  });
  it('buried blocks need an open face', () => {
    const s = fresh();
    const t = landTile();
    expect(mine(s, gen, t.x, t.y, 2).ok).toBe(false);
  });
  it('stone needs a pickaxe and wears it', () => {
    const s = fresh();
    const t = landTile((x, y) => gen.block(x, y, 3) === B.stone);
    for (const z of [0, 1, 2]) s.diffs[`${t.x},${t.y},${z}`] = B.air;
    expect(mine(s, gen, t.x, t.y, 3).msg).toMatch(/pickaxe/);
    give(s, 'tool:pickaxe:flint', 1);
    dig(s, t.x, t.y, 3);
    expect(count(s, 'cobble:stone')).toBe(1);
    expect(s.tools[0]?.dur).toBe(39);
  });
  it('trees: hands give sticks, an axe fells for logs', () => {
    const s = fresh();
    let t = { x: 0, y: 0 };
    outer: for (let r = 0; r < 300; r++) for (let dx = -r; dx <= r; dx++) {
      const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + r;
      const tr = gen.tree(x, y);
      if (tr === Tree.Broadleaf || tr === Tree.Conifer) { t = { x, y }; break outer; }
    }
    for (let i = 0; i < 20; i++) mine(s, gen, t.x, t.y, 0);
    expect(count(s, 'stick:wood')).toBeGreaterThan(0);
    give(s, 'tool:axe:flint', 1);
    dig(s, t.x, t.y, 0);
    expect(count(s, 'log:wood')).toBe(3);
    expect(s.diffs[`${t.x},${t.y},t`]).toBe(0);
  });
});

describe('crafting', () => {
  const reg = registry();
  const r = (out: string, tools: string[] = []) => reg.recipesFor(out).find((x) => x.machine === 'hand' && (x.tools ?? []).join() === tools.join())!;
  it('crafts the flint pickaxe chain and wears tools', () => {
    const s = fresh();
    give(s, 'shard:flint', 3); give(s, 'stick:wood', 1); give(s, 'fiber', 1);
    expect(craft(s, r('head_pickaxe:flint').id, 1).ok).toBe(true);
    expect(craft(s, r('tool:pickaxe:flint').id, 1).ok).toBe(true);
    expect(bestTool(s, 'pickaxe')).not.toBeNull();
    expect(count(s, 'shard:flint') + count(s, 'stick:wood') + count(s, 'fiber')).toBe(0);
  });
  it('refuses with missing inputs, stops early on batch', () => {
    const s = fresh();
    expect(craft(s, r('plank:wood').id, 1).msg).toMatch(/Missing/);
    give(s, 'log:wood', 2);
    const res = craft(s, r('plank:wood').id, 5);
    expect(res.gained).toEqual([{ id: 'plank:wood', n: 4 }]);
    expect(missing(s, r('plank:wood', ['saw']))).toContain('saw');
  });
});
