import { describe, expect, it } from 'vitest';
import { optionsFor, plan, sketch, totals } from '../src/content/planner';
import { registry } from '../src/content/registry';
import { planet } from '../src/data/planets';
import { migrate } from '../src/save/migrations';
import { copyArea, rotateBp, type Blueprint } from '../src/sim/blueprints';
import { apply, give } from '../src/sim/player';
import { newGame, STATE_VERSION, TPS, type GameState } from '../src/sim/state';
import { countMade, countPower, hist, resetStats, stepStats } from '../src/sim/stats';
import { Water, worldGen } from '../src/world/gen';

const s0 = newGame(7);
const gen = worldGen(7, planet('earth'));
const dry = (x: number, y: number) => { const sf = gen.surface(gen.wrapX(x), y); return sf.water === Water.None && !sf.ice && !gen.tree(gen.wrapX(x), y, sf); };
function spot(from = 0) {
  for (let i = from; ; i++) {
    const x = s0.spawn.x + i, y = s0.spawn.y;
    let ok = true;
    for (let dx = -4; dx <= 4 && ok; dx++) for (let dy = -4; dy <= 4 && ok; dy++) ok = dry(x + dx, y + dy);
    if (ok) return { x: gen.wrapX(x), y };
  }
}
const place = (s: GameState, id: string, x: number, y: number, r = 0) => {
  give(s, `struct:${id}`, 1);
  const res = apply(s, gen, { k: 'place', id: `struct:${id}`, x: gen.wrapX(x), y, f: 0, r });
  expect(res.ok, res.msg).toBe(true);
  return Object.keys(res.ents!)[0];
};

describe('P5f blueprints', () => {
  it('rotating four times is the identity; edges and cut sides turn with it', () => {
    const bp: Blueprint = { name: 't', w: 2, h: 1, ents: [{ x: 1, y: 0, b: 0, s: 'tin_wire', r: 0, cut: 0b000001, faces: [1, 0, 0, 0, 0, 0] }], base: [[1, 0, 0, 'n', 1], [0, 0, 0, 'f', 1]] };
    const one = rotateBp(bp, 1);
    expect(one.ents[0]).toMatchObject({ x: 0, y: 1, r: 1, cut: 0b000100, faces: [0, 0, 1, 0, 0, 0] }); // east side → south
    expect(one.base).toContainEqual([0 + 1, 1, 0, 'w', 1]); // north edge of (1,0) → east edge of (0,1) = west edge of (1,1)
    let b = bp;
    for (let i = 0; i < 4; i++) b = rotateBp(b, 1);
    expect(b.ents).toEqual(bp.ents);
    expect(b.base.sort()).toEqual([...bp.base].sort());
  });

  it('copies an area with its config and pastes it turned, from the inventory', () => {
    const s = structuredClone(s0), { x, y } = spot();
    const mac = place(s, 'macerator', x, y), wire = place(s, 'tin_wire', x + 1, y);
    const rec = registry().recipes.find((r) => r.machine === 'macerator')!;
    apply(s, gen, { k: 'mrec', key: mac, recipe: rec.id });
    apply(s, gen, { k: 'conduit', key: wire, ch: 2, cut: 0b000001 });
    apply(s, gen, { k: 'base', kind: 'floor', x, y: y + 1, f: 0 });
    expect(apply(s, gen, { k: 'bpcopy', x0: x, y0: y, x1: x + 1, y1: y + 1, f: 0, name: 'Pair' }).ok).toBe(true);
    expect(s.flags.bp_copy).toBe(1);
    expect(s.bps[0]).toMatchObject({ name: 'Pair', w: 2, h: 2 });
    expect(s.bps[0].ents).toHaveLength(2);

    // Paste turned once at a new anchor with only the macerator in stock: the wire is reported missing.
    const { x: px, y: py } = { x: gen.wrapX(x + 6), y };
    give(s, 'struct:macerator', 1);
    const res = apply(s, gen, { k: 'bppaste', i: 0, x: px, y: py, f: 0, r: 1 });
    expect(res.ok).toBe(true);
    expect(res.msg).toMatch(/placed 1\/2.*Tin Wire/i);
    const m = s.mach[`${px},${py},0`];
    expect(s.ents[`${px},${py},0`]).toMatchObject({ s: 'macerator', r: 1 });
    expect(m.rec).toBe(rec.id);
    expect(s.base[`${px - 1},${py},0,f`]).toBe(1); // (0, 1) turned → (−1, 0)
    // Paste again on the same spot with the wire in stock: fills the gap, keeps channel and turned cut side.
    give(s, 'struct:tin_wire', 1);
    expect(apply(s, gen, { k: 'bppaste', i: 0, x: px, y: py, f: 0, r: 1 }).msg).toMatch(/placed 1\/2/);
    expect(s.ents[`${px},${py + 1},0`]).toMatchObject({ s: 'tin_wire', ch: 2, cut: 0b000100 });
    expect(s.flags.bp_paste).toBe(2);
  });

  it('copy refuses empty or oversized areas; delete removes it', () => {
    const s = structuredClone(s0), { x, y } = spot();
    expect(typeof copyArea(s, gen, x, y, x + 2, y + 2, 0, 'e')).toBe('string');
    expect(apply(s, gen, { k: 'bpcopy', x0: x, y0: y, x1: x + 40, y1: y, f: 0, name: 'big' }).msg).toMatch(/Too big/);
    place(s, 'macerator', x, y);
    apply(s, gen, { k: 'bpcopy', x0: x, y0: y, x1: x, y1: y, f: 0, name: 'one' });
    expect(apply(s, gen, { k: 'bpdel', i: 0 }).ok).toBe(true);
    expect(s.bps).toEqual([]);
  });

  it('saves migrate to v14 with no blueprints', () => {
    const old = { ...structuredClone(s0), version: 13 } as Record<string, unknown> & { version: number };
    delete old.bps;
    const m = migrate(old);
    expect(m.version).toBe(STATE_VERSION);
    expect(m.bps).toEqual([]);
  });
});

describe('P5f planner', () => {
  it('machines = rate ÷ (output × runs per minute); raw and loops stop the tree', () => {
    const target = registry().recipes.find((r) => r.machine === 'macerator' && r.outputs.length === 1 && r.inputs.length === 1)!;
    const id = target.outputs[0].id;
    const n = plan(id, 60, { [id]: target.id });
    expect(n.recipe!.id).toBe(target.id);
    expect(n.machines).toBeCloseTo(60 / target.outputs[0].n / ((60 * TPS) / target.ticks), 6);
    expect(n.w).toBeCloseTo(target.power * n.machines!, 6);
    expect(n.kids[0].rate).toBeCloseTo((60 / target.outputs[0].n) * target.inputs[0].n, 6);
    expect(plan(id, 60, { [id]: 'raw' }).raw).toBe('chosen');
    expect(plan('log:wood', 10).raw).toBe('world');
  });

  it('defaults to a machine recipe, totals add up and the sketch sets recipes', () => {
    const opts = optionsFor('plate:aluminium');
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].machine).not.toBe('hand');
    expect(plan('ingot:aluminium', 30).recipe!.machine).toBe('hall_heroult'); // furnace ← dust ← ingot would loop
    const root = plan('plate:aluminium', 30), t = totals(root);
    expect(t.steps.size).toBeGreaterThan(0);
    expect(t.raw.size).toBeGreaterThan(0);
    const bp = sketch(root, 'Plan');
    expect(bp.ents.length).toBeGreaterThan(0);
    expect(bp.ents.every((e) => e.rec && registry().recipe(e.rec))).toBe(true);
    const s = structuredClone(s0);
    expect(apply(s, gen, { k: 'bpsave', bp }).ok).toBe(true);
    expect(s.flags.bp_sketch).toBe(1);
  });
});

describe('P5f statistics', () => {
  it('samples every 10 s and every minute, keeping an hour', () => {
    resetStats();
    const s = structuredClone(s0);
    for (let t = 1; t <= 60 * TPS; t++) { s.tick = t; countMade('dust:iron', 1); countPower(5, 3); stepStats(s); }
    expect(hist.short).toHaveLength(6);
    expect(hist.short[0].made['dust:iron']).toBe(10 * TPS);
    expect(hist.short[0].gen).toBe(50 * TPS);
    expect(hist.long).toHaveLength(1);
    expect(hist.long[0].made['dust:iron']).toBe(60 * TPS);
    expect(hist.long[0].use).toBe(180 * TPS);
    resetStats();
    expect(hist.short).toHaveLength(0);
  });

  it('quests: blueprint, planner and statistics in the logistics chapter', async () => {
    const { QUEST } = await import('../src/data/quests');
    for (const id of ['m_blueprint', 'm_planner', 'm_stats']) expect(QUEST.get(id)?.chapter).toBe('logistics');
  });
});
