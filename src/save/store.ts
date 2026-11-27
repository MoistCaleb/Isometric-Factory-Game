// IndexedDB save store: manual slots + rolling autosave backups (DESIGN §8).
import type { GameState } from '../sim/state';
import { decodeSave, encodeSave } from './codec';

export const BACKUPS = 5;
const DB = 'ifg';
const STORE = 'saves';

export interface SaveMeta { key: string; kind: 'manual' | 'auto'; savedAt: number; tick: number; seed: number; size: number }
interface Row extends SaveMeta { data: Uint8Array }

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((res, rej) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } finally {
    db.close();
  }
}

async function put(key: string, kind: SaveMeta['kind'], state: GameState): Promise<SaveMeta> {
  const savedAt = Date.now();
  const data = await encodeSave(state, savedAt);
  const meta: SaveMeta = { key, kind, savedAt, tick: state.tick, seed: state.seed, size: data.byteLength };
  await tx('readwrite', (s) => s.put({ ...meta, data } satisfies Row));
  return meta;
}

export async function list(): Promise<SaveMeta[]> {
  const rows = await tx<Row[]>('readonly', (s) => s.getAll());
  return rows.map(({ data: _d, ...m }) => m).sort((a, b) => b.savedAt - a.savedAt);
}

export const saveManual = (state: GameState, slot = 'main') => put(`manual:${slot}`, 'manual', state);

/** Autosave into the oldest of BACKUPS rolling slots. */
export async function autosave(state: GameState): Promise<SaveMeta> {
  const autos = (await list()).filter((m) => m.kind === 'auto');
  let key = `auto:${autos.length}`;
  if (autos.length >= BACKUPS) key = autos[autos.length - 1].key;
  return put(key, 'auto', state);
}

export async function loadBytes(key: string): Promise<Uint8Array | undefined> {
  return (await tx<Row | undefined>('readonly', (s) => s.get(key)))?.data;
}

export async function load(key: string): Promise<GameState | undefined> {
  const b = await loadBytes(key);
  return b ? (await decodeSave(b)).state : undefined;
}

export async function latest(): Promise<SaveMeta | undefined> {
  return (await list())[0];
}

export const remove = (key: string) => tx('readwrite', (s) => s.delete(key));
