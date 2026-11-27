import { describe, expect, it } from 'vitest';
import { planet } from '../src/data/planets';
import { registry } from '../src/content/registry';
import { edgeKey } from '../src/sim/build';
import { apply, count, craft, give, mine } from '../src/sim/player';
import { newGame } from '../src/sim/state';
import { migrate } from '../src/save/migrations';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const fresh = () => structuredClone(s0);
function tile(pred: (x: number, y: number) => boolean) {
  for (let r = 0; r < 400; r++) for (let dx = -r; dx <= r; dx++) {
    const x = gen.wrapX(s0.spawn.x + dx), y = s0.spawn.y + r;
    if (gen.inBounds(y) && pred(x, y)) return { x, y };
  }
  throw new Error('no tile');
}
const land = tile((x, y) => { const sf = gen.surface(x, y); return sf.water === Water.None && !sf.ice && !gen.tree(x, y); });

describe('structures', () => {
  it('every structure has an item and a hand recipe', () => {
    const reg = registry();
    const st = reg.items.filter((i) => i.kind === 'structure');
    expect(st.length).toBeGreaterThan(5);
    for (const i of st) expect(reg.recipesFor(i.id).some((r) => r.machine === 'hand')).toBe(true);
  });
  it('craft → place → demolish refunds', () => {
    const s = fresh();
    give(s, 'plank:wood', 8);
    expect(craft(s, registry().recipesFor('struct:chest')[0].id, 1).ok).toBe(true);
    const r = apply(s, gen, { k: 'place', id: 'struct:chest', x: land.x, y: land.y, f: 0, r: 1 });
    expect(r.ok).toBe(true);
    expect(s.ents[`${land.x},${land.y},0`]).toEqual({ s: 'chest', r: 1 });
    expect(count(s, 'struct:chest')).toBe(0);
    expect(apply(s, gen, { k: 'place', id: 'struct:chest', x: land.x, y: land.y, f: 0, r: 0 }).ok).toBe(false);
    expect(mine(s, gen, land.x, land.y, 0).ok).toBe(false);
    const d = apply(s, gen, { k: 'demolish', x: land.x, y: land.y, f: 0 });
    expect(d.ok && d.ents).toEqual({ [`${land.x},${land.y},0`]: null });
    expect(count(s, 'struct:chest')).toBe(1);
  });
  it('water needs a foundation; upper floors need a floor', () => {
    const s = fresh();
    const w = tile((x, y) => gen.surface(x, y).water === Water.Ocean);
    give(s, 'struct:barrel', 2);
    expect(apply(s, gen, { k: 'place', id: 'struct:barrel', x: w.x, y: w.y, f: 0, r: 0 }).ok).toBe(false);
    expect(apply(s, gen, { k: 'base', kind: 'floor', x: w.x, y: w.y, f: 0 }).ok).toBe(true);
    expect(apply(s, gen, { k: 'place', id: 'struct:barrel', x: w.x, y: w.y, f: 0, r: 0 }).ok).toBe(true);
    expect(apply(s, gen, { k: 'place', id: 'struct:barrel', x: land.x, y: land.y, f: 2, r: 0 }).ok).toBe(false);
    apply(s, gen, { k: 'base', kind: 'floor', x: land.x, y: land.y, f: 2 });
    expect(apply(s, gen, { k: 'place', id: 'struct:barrel', x: land.x, y: land.y, f: 2, r: 0 }).ok).toBe(true);
  });
  it('edge walls are canonical and demolish nearest first', () => {
    const s = fresh(), { x, y } = land;
    apply(s, gen, { k: 'base', kind: 'wall', x, y, f: 0, side: 's' });
    expect(s.base[edgeKey(x, y, 0, 's', gen.w)]).toBe(1);
    expect(s.base[`${x},${y + 1},0,n`]).toBe(1);
    apply(s, gen, { k: 'base', kind: 'door', x, y: y + 1, f: 0, side: 'n' });
    expect(s.base[`${x},${y + 1},0,n`]).toBe(3);
    apply(s, gen, { k: 'base', kind: 'roof', x, y, f: 0 });
    expect(apply(s, gen, { k: 'demolish', x, y, f: 0, side: 's' }).base).toEqual({ [`${x},${y + 1},0,n`]: null });
    expect(apply(s, gen, { k: 'demolish', x, y, f: 0 }).base).toEqual({ [`${x},${y},0,r`]: null });
    expect(apply(s, gen, { k: 'demolish', x, y, f: 0 }).ok).toBe(false);
  });
  it('migrates v4 saves', () => {
    const { ents, base, ...old } = fresh();
    void ents; void base;
    const m = migrate({ ...old, version: 4 } as never);
    expect(m.ents).toEqual({});
    expect(m.base).toEqual({});
  });
});
