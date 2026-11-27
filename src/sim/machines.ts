// Primitive machines + multiblocks (DESIGN §5, CONTENT §11c, P2d). Each placed structure with a `machine` gets a
// `Mach` (keyed like its ent, `x,y,f`): a chosen recipe, input/fuel/output bags, an optional fluid tank, heat and progress.
// Run modes: fuel (burn items for heat, recipe needs minHeatK) · self (burns its own charge) · crank (player-driven).
import { registry } from '../content/registry';
import type { Recipe } from '../content/types';
import { AMBIENT_K, BOIL_K, BOILER_RATE, CRANK_TICKS, FUELS, MACHINE, STEAM_PER_POWER, STEAM_PER_WATER, type MachineDef } from '../data/machines';
import { PATTERNS, STRUCTURES, type Cell, type StructDef } from '../data/structures';
import { Water, type WorldGen } from '../world/gen';
import { placeAt } from './build';
import { topoChanged } from './pipes';
import type { ActResult } from './player';
import { STACK, bestTool, count, give, take, wear } from './player';
import { next } from './rng';
import { STOREY, type GameState } from './state';

export interface Mach {
  /** Selected recipe id. */
  rec?: string;
  inp: Record<string, number>;
  out: Record<string, number>;
  fuel: Record<string, number>;
  tank?: { id: string; n: number };
  heat: number;
  /** Fuel ticks left and the flame temperature of what's burning. */
  burn: number; burnK: number;
  prog: number;
  /** Status (MS). */
  st: number;
  /** Boiler water (L) · steam machine steam buffer (L) · boiler ran dry while hot (P3a). */
  water?: number; steam?: number; dry?: boolean;
}

/** Machine status (DESIGN §5 status icons). */
export const MS = { idle: 0, working: 1, noInput: 2, full: 3, cold: 4, incomplete: 5, noWater: 6, crank: 7, noFuel: 8, noSteam: 9, dry: 10, noWaterIn: 11 } as const;
export const MS_TEXT = ['Idle — pick a recipe', 'Working', 'Missing input', 'Output full', 'Heating up', 'Incomplete multiblock',
  'Needs water next to it', 'Ready — crank it', 'Needs fuel', 'No steam', 'DRY! Let it cool before water returns', 'No water — pipe it in'];

/** Things the sim did on its own (explosions): the worker forwards them like command results. */
export const simEvents: ActResult[] = [];

/** Boiler explosion (DESIGN §6): the machine and everything in it is lost. */
export function explode(s: GameState, key: string) {
  delete s.ents[key]; delete s.mach[key];
  topoChanged();
  simEvents.push({ ok: false, msg: '💥 A boiler exploded — water hit it while dry and hot!', ents: { [key]: null } });
}
/** Input bag cap per item. */
export const BAG = 256; // 4 stacks (literal: player.ts ↔ machines.ts import cycle)
const HEAT_RATE = 0.01;
const OUT_KINDS = 6;

const STRUCT = new Map(STRUCTURES.map((s) => [s.id, s]));
const mod = (a: number, n: number) => ((a % n) + n) % n;
const parse = (k: string) => k.split(',').map(Number) as [number, number, number];

export const newMach = (): Mach => ({ inp: {}, out: {}, fuel: {}, heat: AMBIENT_K, burn: 0, burnK: 0, prog: 0, st: MS.idle });

/** Machine def for a placed structure key, if it is a machine. */
export function machineAt(ents: GameState['ents'], key: string): { st: StructDef; def: MachineDef } | null {
  const e = ents[key], st = e && STRUCT.get(e.s), def = st?.machine ? MACHINE.get(st.machine) : undefined;
  return st && def ? { st, def } : null;
}

const PATTERN_LIST = Object.values(PATTERNS);
const cellKey = (w: number, x: number, y: number, f: number, [dx, dy, df]: Cell) => `${mod(x + dx, w)},${y + dy},${f + df}`;

/** Controller for what's at a tile on storey f (top block first). */
export function controllerInStorey(ents: GameState['ents'], w: number, x: number, y: number, f: number): string | null {
  const xx = mod(x, w);
  for (let b = f * STOREY + STOREY - 1; b >= f * STOREY; b--) if (ents[`${xx},${y},${b}`]) return controllerAt(ents, w, xx, y, b);
  return null;
}

/** Controller key for a block: the machine itself, or the multiblock controller whose pattern includes this casing. */
export function controllerAt(ents: GameState['ents'], w: number, x: number, y: number, f: number): string | null {
  const key = `${mod(x, w)},${y},${f}`;
  if (machineAt(ents, key)) return key;
  const e = ents[key];
  if (!e) return null;
  for (const p of PATTERN_LIST) for (const [dx, dy, df] of p.cells) {
    if (f - df < 0) continue;
    const k = `${mod(x - dx, w)},${y - dy},${f - df}`, st = STRUCT.get(ents[k]?.s ?? '');
    if (st?.multi?.casing === e.s && PATTERNS[st.multi.pattern] === p) return k;
  }
  return null;
}

/** Multiblock check: pattern tiles lacking their casing, and chamber tiles that must be empty. */
export function multiCheck(ents: GameState['ents'], w: number, key: string): { miss: string[]; blocked: string[] } {
  const st = STRUCT.get(ents[key]?.s ?? ''), m = st?.multi;
  if (!m) return { miss: [], blocked: [] };
  const [x, y, f] = parse(key), p = PATTERNS[m.pattern];
  return {
    // Bottom-up, outer before centre, so auto-fill always has support.
    miss: [...p.cells].sort((a, b) => a[2] - b[2] || Math.abs(b[0]) + Math.abs(b[1]) - Math.abs(a[0]) - Math.abs(a[1]))
      .map((c) => cellKey(w, x, y, f, c)).filter((k) => ents[k]?.s !== m.casing),
    blocked: p.hollow.map((c) => cellKey(w, x, y, f, c)).filter((k) => ents[k]),
  };
}
export const missingCasings = (ents: GameState['ents'], w: number, key: string) => multiCheck(ents, w, key).miss;

const waterCache = new Map<string, boolean>();
function nearWater(gen: WorldGen, key: string): boolean {
  let v = waterCache.get(key);
  if (v === undefined) {
    const [x, y] = parse(key);
    v = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => gen.inBounds(y + dy) && gen.surface(gen.wrapX(x + dx), y + dy).water !== Water.None);
    waterCache.set(key, v);
  }
  return v;
}

const recipeOf = (id?: string): Recipe | undefined => (id ? registry().recipe(id) : undefined);
const isGas = (id: string) => registry().fluid(id)?.phase === 'gas';

function hasInputs(m: Mach, r: Recipe): boolean {
  return r.inputs.every((i) => (m.inp[i.id] ?? 0) >= i.n) && (r.keep ?? []).every((k) => (m.inp[k] ?? 0) >= 1)
    && (r.fluidsIn ?? []).every((f) => m.tank?.id === f.id && m.tank.n >= f.n);
}

function hasRoom(m: Mach, r: Recipe, def: MachineDef): boolean {
  const kinds = new Set(Object.keys(m.out));
  for (const o of r.outputs) { if ((m.out[o.id] ?? 0) + o.n > STACK) return false; kinds.add(o.id); }
  if (kinds.size > OUT_KINDS) return false;
  for (const f of r.fluidsOut ?? []) {
    if (isGas(f.id)) continue;
    const after = (r.fluidsIn ?? []).reduce((a, x) => a - (x.id === m.tank?.id ? x.n : 0), m.tank?.n ?? 0);
    if ((m.tank && after > 0 && m.tank.id !== f.id) || after + f.n > (def.tank ?? 0)) return false;
  }
  return true;
}

/** Why the machine can't progress right now (null = ready). Doesn't touch fuel/heat. */
function blocker(s: GameState, gen: WorldGen, key: string, m: Mach, def: MachineDef, r?: Recipe): number | null {
  if (!r) return MS.idle;
  const mc = multiCheck(s.ents, gen.w, key);
  if (mc.miss.length || mc.blocked.length) return MS.incomplete;
  if (def.water && !nearWater(gen, key)) return MS.noWater;
  if (!hasInputs(m, r)) return MS.noInput;
  if (!hasRoom(m, r, def)) return MS.full;
  return null;
}

function finish(s: GameState, m: Mach, r: Recipe) {
  for (const i of r.inputs) { m.inp[i.id] -= i.n; if (!m.inp[i.id]) delete m.inp[i.id]; }
  for (const f of r.fluidsIn ?? []) { m.tank!.n -= f.n; if (m.tank!.n <= 0) m.tank = undefined; }
  for (const o of r.outputs) if (o.chance === undefined || next(s) < o.chance) m.out[o.id] = (m.out[o.id] ?? 0) + o.n;
  for (const f of r.fluidsOut ?? []) {
    if (isGas(f.id)) continue; // vents (pollution later)
    m.tank = { id: f.id, n: (m.tank?.n ?? 0) + f.n };
  }
  m.prog = 0;
}

/** Tick every machine (no chunk loading yet: all machines run). */
export function stepMachines(s: GameState, gen: WorldGen) {
  for (const [key, m] of Object.entries(s.mach)) {
    const ma = machineAt(s.ents, key);
    if (!ma) { delete s.mach[key]; continue; }
    const { def } = ma, r = recipeOf(m.rec);
    if (def.run === 'boiler') { stepBoiler(m, def); continue; }
    if (def.run === 'pump') {
      const room = (def.tank ?? 0) - (m.tank?.n ?? 0);
      m.st = !nearWater(gen, key) ? MS.noWater : room <= 0 ? MS.full : MS.working;
      if (m.st === MS.working) m.tank = { id: 'water', n: (m.tank?.n ?? 0) + Math.min(room, def.rate ?? 0) };
      continue;
    }
    const b = blocker(s, gen, key, m, def, r);
    if (def.run === 'fuel') {
      if (b === null && m.burn <= 0) {
        const fuel = Object.keys(m.fuel).sort((a, c) => FUELS[c][0] - FUELS[a][0])[0];
        if (fuel) {
          [m.burnK, m.burn] = FUELS[fuel];
          if (!--m.fuel[fuel]) delete m.fuel[fuel];
        }
      }
      const target = m.burn > 0 ? Math.min(m.burnK, def.maxHeatK ?? AMBIENT_K) : AMBIENT_K;
      m.heat += (target - m.heat) * HEAT_RATE;
      if (m.burn > 0) m.burn--;
    }
    if (b !== null) { m.st = b; continue; }
    if (def.run === 'crank') { m.st = MS.crank; continue; }
    if (def.run === 'fuel' && m.heat < (r!.minHeatK ?? def.heatK ?? 0)) { m.st = m.burn > 0 ? MS.cold : MS.noFuel; continue; }
    if (def.run === 'steam') {
      const need = r!.power * STEAM_PER_POWER;
      if ((m.steam ?? 0) < need) { m.st = MS.noSteam; continue; }
      m.steam! -= need;
    }
    m.st = MS.working;
    if (++m.prog >= r!.ticks) finish(s, m, r!);
  }
}

/** Boiler (DESIGN §6): fuel heats it (slowly) toward the flame, capped; above boiling it turns water into steam in its tank. */
function stepBoiler(m: Mach, def: MachineDef) {
  const cap = def.tank ?? 0, max = def.maxHeatK ?? BOIL_K + 1, steam = m.tank?.n ?? 0;
  if (m.burn <= 0 && steam < cap) {
    const fuel = Object.keys(m.fuel).sort((a, c) => FUELS[c][0] - FUELS[a][0])[0];
    if (fuel) { [m.burnK, m.burn] = FUELS[fuel]; if (!--m.fuel[fuel]) delete m.fuel[fuel]; }
  }
  const target = m.burn > 0 ? Math.min(m.burnK, max) : AMBIENT_K;
  m.heat += (target - m.heat) * BOILER_RATE;
  if (m.burn > 0) m.burn--;
  if (m.heat < BOIL_K) { m.dry = false; m.st = m.burn > 0 ? MS.cold : MS.noFuel; return; }
  if (m.dry) { m.st = MS.dry; return; }
  if ((m.water ?? 0) <= 1e-6) { m.water = 0; m.dry = true; m.st = MS.dry; return; }
  const n = Math.min((def.rate ?? 0) * (m.heat - BOIL_K) / (max - BOIL_K), cap - steam, m.water! * STEAM_PER_WATER);
  m.st = steam >= cap ? MS.full : MS.working;
  if (n <= 0) return;
  m.water! -= n / STEAM_PER_WATER;
  m.tank = { id: 'steam', n: steam + n };
}

// ---------- player commands ----------
export type MachCmd =
  | { k: 'mrec'; key: string; recipe: string }
  | { k: 'mload'; key: string; n: number }
  | { k: 'mfuel'; key: string; id: string; n: number }
  | { k: 'mtake'; key: string }
  | { k: 'munload'; key: string }
  | { k: 'mdump'; key: string }
  | { k: 'crank'; key: string }
  | { k: 'mfill'; key: string };

/** Get (creating if needed) the machine state for a placed machine structure. */
export function getMach(s: GameState, key: string): Mach | null {
  if (!machineAt(s.ents, key)) return null;
  return (s.mach[key] ??= newMach());
}

const name = (id: string) => registry().item(id)?.name ?? id;

/** Give back a bag; returns what didn't fit (left in the bag). */
function drain(s: GameState, bag: Record<string, number>): { id: string; n: number }[] {
  const got: { id: string; n: number }[] = [];
  for (const [id, n] of Object.entries(bag)) {
    const left = give(s, id, n);
    if (left < n) got.push({ id, n: n - left });
    if (left) bag[id] = left; else delete bag[id];
  }
  return got;
}

/** Empty a machine into the inventory before demolition. Returns false if anything didn't fit. */
export function refund(s: GameState, key: string): { ok: boolean; gained: { id: string; n: number }[] } {
  const m = s.mach[key];
  if (!m) return { ok: true, gained: [] };
  const gained = [...drain(s, m.out), ...drain(s, m.inp), ...drain(s, m.fuel)];
  const ok = !Object.keys(m.out).length && !Object.keys(m.inp).length && !Object.keys(m.fuel).length;
  if (ok) delete s.mach[key];
  return { ok, gained };
}

export function machCmd(s: GameState, gen: WorldGen, c: MachCmd): ActResult {
  const ma = machineAt(s.ents, c.key), m = getMach(s, c.key);
  if (!ma || !m) return { ok: false, msg: 'Not a machine' };
  const { def, st } = ma;
  const r = recipeOf(m.rec);
  switch (c.k) {
    case 'mrec': {
      const nr = recipeOf(c.recipe);
      if (!nr || nr.machine !== def.id) return { ok: false, msg: 'Wrong machine for that recipe' };
      if (m.rec !== c.recipe) { m.rec = c.recipe; m.prog = 0; }
      return { ok: true };
    }
    case 'mload': {
      if (!r) return { ok: false, msg: 'Pick a recipe first' };
      let done = 0;
      for (const k of r.keep ?? []) if (!m.inp[k]) {
        if (!count(s, k)) return { ok: false, msg: `Missing: ${name(k)}` };
        take(s, k, 1); m.inp[k] = 1;
      }
      for (; done < Math.min(c.n, 64); done++) {
        if (!r.inputs.every((i) => count(s, i.id) >= i.n && (m.inp[i.id] ?? 0) + i.n <= BAG)) break;
        for (const i of r.inputs) { take(s, i.id, i.n); m.inp[i.id] = (m.inp[i.id] ?? 0) + i.n; }
      }
      if (!done && r.inputs.length) {
        const miss = r.inputs.filter((i) => count(s, i.id) < i.n).map((i) => name(i.id));
        return { ok: false, msg: miss.length ? `Missing: ${miss.join(', ')}` : 'Input bag full' };
      }
      return { ok: true, msg: r.inputs.length ? `Loaded ×${done}` : undefined };
    }
    case 'mfuel': {
      if (def.run !== 'fuel' && def.run !== 'boiler') return { ok: false, msg: 'Burns no fuel' };
      if (!FUELS[c.id]) return { ok: false, msg: 'Not a fuel' };
      const n = Math.min(c.n, count(s, c.id), BAG - (m.fuel[c.id] ?? 0));
      if (n <= 0) return { ok: false, msg: count(s, c.id) ? 'Fuel bag full' : `No ${name(c.id)}` };
      take(s, c.id, n); m.fuel[c.id] = (m.fuel[c.id] ?? 0) + n;
      return { ok: true };
    }
    case 'mtake': {
      const gained = drain(s, m.out);
      return { ok: true, gained, msg: Object.keys(m.out).length ? 'Inventory full' : undefined };
    }
    case 'munload': {
      const gained = [...drain(s, m.inp), ...drain(s, m.fuel)];
      return { ok: true, gained, msg: Object.keys(m.inp).length + Object.keys(m.fuel).length ? 'Inventory full' : undefined };
    }
    case 'mdump': m.tank = undefined; return { ok: true, msg: 'Tank emptied' };
    case 'crank': {
      if (def.run !== 'crank') return { ok: false };
      const b = blocker(s, gen, c.key, m, def, r);
      if (b !== null) return { ok: false, msg: MS_TEXT[b] };
      const tools = (r!.tools ?? []).map((t) => bestTool(s, t));
      if (tools.some((t) => !t)) return { ok: false, msg: `Needs a ${r!.tools!.join(', ')}` };
      m.prog += CRANK_TICKS;
      if (m.prog < r!.ticks) return { ok: true, progress: [m.prog, r!.ticks], target: st.name };
      const before = { ...m.out };
      finish(s, m, r!);
      const msg = tools.map((t) => wear(s, t!.i)).find(Boolean);
      const made = Object.entries(m.out).filter(([id, n]) => n > (before[id] ?? 0)).map(([id, n]) => `${name(id)} ×${n - (before[id] ?? 0)}`);
      return { ok: true, msg: msg ?? (made.length ? `Made ${made.join(', ')}` : undefined) };
    }
    case 'mfill': {
      const miss = missingCasings(s.ents, gen.w, c.key), casing = st.multi?.casing;
      if (!casing || !miss.length) return { ok: true };
      const ents: NonNullable<ActResult['ents']> = {};
      let why: string | undefined;
      for (const k of miss) {
        const [x, y, f] = parse(k);
        if (s.ents[k]) { why = 'Something else is in the way'; continue; }
        const res = placeAt(s, gen, `struct:${casing}`, x, y, f, 0);
        if (!res.ok && res.msg?.startsWith('No ')) { why = res.msg; break; }
        if (res.ok) Object.assign(ents, res.ents); else why = res.msg;
      }
      return { ok: !why, ents, msg: why };
    }
  }
}

/** Machine statuses for the renderer (status icons). */
export const statuses = (s: GameState): Record<string, number> => Object.fromEntries(Object.entries(s.mach).map(([k, m]) => [k, m.st]));
