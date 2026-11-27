import { describe, expect, it } from 'vitest';
import { migrate } from '../src/save/migrations';
import { apply, count, give } from '../src/sim/player';
import { checkQuests, QCLAIMED, QDONE } from '../src/sim/quests';
import { newGame } from '../src/sim/state';
import { step } from '../src/sim/step';
import { worldGen } from '../src/world/gen';
import { planet } from '../src/data/planets';

const gen = worldGen(7, planet('earth'));
const run = (s: ReturnType<typeof newGame>, n: number) => { for (let i = 0; i < n; i++) step(s, gen); };

describe('quests', () => {
  it('completes when unlocked + tasks met, claims a crate once, crate opens into loot', () => {
    const s = newGame(7);
    give(s, 'shard:flint', 3); give(s, 'stick:wood', 4); give(s, 'fiber', 4);
    s.flags.mine = 1;
    run(s, 40);
    expect(s.quests.gather).toBeUndefined(); // locked behind 'welcome'
    expect(apply(s, gen, { k: 'qclaim', id: 'gather' }).msg).toBe('Not complete yet');
    apply(s, gen, { k: 'flag', id: 'pan' });
    apply(s, gen, { k: 'flag', id: 'zoom' });
    apply(s, gen, { k: 'flag', id: 'bogus' as never });
    expect(s.flags.bogus).toBeUndefined();
    run(s, 20);
    expect(s.quests.welcome).toBe(QDONE);
    expect(s.quests.gather).toBe(QDONE); // chain resolves in one pass
    expect(apply(s, gen, { k: 'qclaim', id: 'gather' }).ok).toBe(true);
    expect(s.quests.gather).toBe(QCLAIMED);
    expect(s.flags.qclaim).toBe(1);
    expect(apply(s, gen, { k: 'qclaim', id: 'gather' }).ok).toBe(false);
    expect(count(s, 'crate:p')).toBe(1);
    const r = apply(s, gen, { k: 'open', id: 'crate:p' });
    expect(r.ok).toBe(true);
    expect(r.gained!.length).toBe(3);
    expect(count(s, 'crate:p')).toBe(0);
    expect(s.flags.open).toBe(1);
  });

  it('tool slots count for have-tasks', () => {
    const s = newGame(7);
    s.quests = { welcome: QCLAIMED, gather: QCLAIMED, recipes: QCLAIMED, inventory: QCLAIMED };
    give(s, 'tool:pickaxe:flint', 1); give(s, 'tool:axe:flint', 1);
    expect(checkQuests(s)).not.toContain('flint_tools');
    give(s, 'tool:knife:flint', 1);
    expect(s.tools.filter(Boolean)).toHaveLength(3);
    expect(checkQuests(s)).toContain('flint_tools');
  });

  it('crate rolls are deterministic from the save rng', () => {
    const roll = () => { const s = newGame(9); give(s, 'crate:p', 1); return apply(s, gen, { k: 'open', id: 'crate:p' }).gained; };
    expect(roll()).toEqual(roll());
  });

  it('build tasks count placed structures', () => {
    const s = newGame(7);
    s.quests = { welcome: QCLAIMED, gather: QCLAIMED, clay: QCLAIMED, flint_tools: QCLAIMED, timber: QCLAIMED };
    expect(checkQuests(s)).not.toContain('pit_kiln');
    s.ents['1,2,0'] = { s: 'pit_kiln', r: 0 };
    expect(checkQuests(s)).toContain('pit_kiln');
  });

  it('claim needs inventory room', () => {
    const s = newGame(7);
    s.quests.gather = QDONE;
    for (let i = 0; i < s.inv.length; i++) s.inv[i] = { id: 'dirt', n: 64 };
    s.tools.fill({ id: 'tool:axe:flint', n: 1 });
    expect(apply(s, gen, { k: 'qclaim', id: 'gather' }).msg).toBe('Make room in your inventory');
  });

  it('migrates v8 saves', () => {
    const { quests: _, flags: __, ...old } = newGame(7);
    const m = migrate({ ...old, version: 8 } as never);
    expect(m.quests).toEqual({});
    expect(m.flags).toEqual({});
  });
});
