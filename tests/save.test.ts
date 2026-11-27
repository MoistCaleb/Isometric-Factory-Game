import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../src/save/codec';
import { migrate } from '../src/save/migrations';
import * as store from '../src/save/store';
import { newGame, STATE_VERSION } from '../src/sim/state';

describe('save', () => {
  it('round-trips through gzip codec', async () => {
    const s = newGame(123);
    s.tick = 999;
    const { state } = await decodeSave(await encodeSave(s));
    expect(state).toEqual(s);
  });
  it('rejects garbage', async () => {
    await expect(decodeSave(new Uint8Array([1, 2, 3]))).rejects.toThrow('not a valid save');
  });
  it('rejects newer versions', () => {
    expect(() => migrate({ version: STATE_VERSION + 1 })).toThrow('newer');
  });
  it('autosave keeps a rolling set of backups', async () => {
    const s = newGame(7);
    for (let i = 0; i < store.BACKUPS + 3; i++) {
      s.tick = i;
      await store.autosave(s);
      await new Promise((r) => setTimeout(r, 2));
    }
    await store.saveManual(s);
    const all = await store.list();
    expect(all.filter((m) => m.kind === 'auto')).toHaveLength(store.BACKUPS);
    expect(all[0].kind).toBe('manual');
    const newestAuto = all.find((m) => m.kind === 'auto')!;
    expect(newestAuto.tick).toBe(store.BACKUPS + 2);
    expect((await store.load(newestAuto.key))!.tick).toBe(store.BACKUPS + 2);
  });
});
