// Primitive machines + multiblocks (DESIGN §5, CONTENT §11c, P2d). Each placed structure with a `machine` gets a
// `Mach` (keyed like its ent, `x,y,f`): a chosen recipe, input/fuel/output bags, an optional fluid tank, heat and progress.
// Run modes: fuel (burn items for heat, recipe needs minHeatK) · self (burns its own charge) · crank (player-driven).
import { registry } from '../content/registry';
import type { Recipe } from '../content/types';
import { AMBIENT_K, BOIL_K, BOILER_RATE, BOILER_WATER, CELL_FLUIDS, CELL_L, DUMP_POLL, CRANK_TICKS, DIG_DEPTH, DIG_H, DIG_R, DIG_SCAN, DIG_TICKS, FUELS, MACHINE, STEAM_PER_POWER, STEAM_PER_WATER,
  AMP_IN, OC_POWER, OC_SPEED, battOf, hatchW, LAKE_FLOW, WIND_FULL_B, DUMP_HAZ, MAINT, MAINT_LOSS, MAINT_P, THUMP_DEPTH, THUMP_R, THUMP_TICKS, type MachineDef } from '../data/machines';
import { MINERALS } from '../data/minerals';
import { TIER_VOLTAGE, tierIndex, type TierId } from '../data/tiers';
import { B, BLOCKS } from '../world/blocks';
import { COILS, PATTERNS, STRUCTURES, multiCells, rotCell, type Cell, type StructDef } from '../data/structures';
import { Water, type WorldGen } from '../world/gen';
import { placeAt } from './build';
import { accepts, topoChanged } from './pipes';
import type { ActResult } from './player';
import { STACK, bestTool, blockAt, count, give, take, wear } from './player';
import { next } from './rng';
import { KNOW, STOREY, TPS, type GameState } from './state';
import { know, survey } from './veins';
import { sunlight } from './weather';
import { addPoll, smoggy } from './pollution';
import { contaminate, ignite } from './hazards';

export interface Mach {
  /** Selected recipe id. */
  rec?: string;
  inp: Record<string, number>;
  out: Record<string, number>;
  fuel: Record<string, number>;
  /** Single tank: boiler steam, pump water, barrel (P3). */
  tank?: { id: string; n: number };
  /** Recipe machines (P4b): fluid bag (L by id, each ≤ the machine's tank); recipe fluids are inputs, the rest outputs. */
  fl?: Record<string, number>;
  heat: number;
  /** Fuel ticks left and the flame temperature of what's burning. */
  burn: number; burnK: number;
  prog: number;
  /** Status (MS). */
  st: number;
  /** Boiler water (L) · steam machine steam buffer (L) · boiler ran dry while hot (P3a). */
  water?: number; steam?: number; dry?: boolean;
  /** Face mode per side (FACE; index = SIDES: E W S N up down), default auto (P3b). */
  faces?: number[];
  /** Excavator: scan position (layer-major over its square) · thumper: 1 once its survey is done (P3c). */
  cur?: number;
  /** Electric (P4a): energy buffer (J) · power in (consumers) or out (generators) last tick (W). */
  e?: number; pw?: number;
  /** Transformer (P4c): step-up (low faces in → front out at MV); default step-down. */
  up?: boolean;
  /** Multiblocks with maintenance (P4e): open issues, bit i = MAINT[i] · energy hatches counted last tick, their total W and
   * lowest tier (P5b). */
  mt?: number; eh?: number; ehw?: number; eht?: TierId; /** Coil heat now (K; P5d). */ ck?: number;
}

/** Machine status (DESIGN §5 status icons). */
export const MS = { idle: 0, working: 1, noInput: 2, full: 3, cold: 4, incomplete: 5, noWater: 6, crank: 7, noFuel: 8, noSteam: 9, dry: 10, noWaterIn: 11, surveyed: 12, minedOut: 13, noSun: 14, noPower: 15, noLoad: 16, noBatt: 17, noWind: 18, noFlow: 19, coils: 20, hatchW: 21, tier: 22 } as const;
export const MS_TEXT = ['Idle — pick a recipe', 'Working', 'Missing input', 'Output full', 'Heating up', 'Incomplete multiblock',
  'Needs water next to it', 'Ready — crank it', 'Needs fuel', 'No steam', 'DRY! Let it cool before water returns', 'No water — pipe it in',
  'Survey done — move it to survey elsewhere', 'No ore left in reach — move it', 'Waiting for sunshine', 'No power — connect a cable to a generator', 'No load — nothing on its cables needs power', 'No batteries — insert some', 'No wind', 'Needs a river or lake next to it',
  'Coils not hot enough for this recipe', 'Needs more energy hatches for this recipe', 'Recipe needs a higher-tier machine'];

/** Things the sim did on its own (explosions): the worker forwards them like command results. */
export const simEvents: ActResult[] = [];

/** Boiler explosion (DESIGN §6): the machine and everything in it is lost. */
export function explode(s: GameState, w: number, key: string) {
  delete s.ents[key]; delete s.mach[key];
  topoChanged();
  simEvents.push({ ok: false, sim: true, msg: '💥 A boiler exploded — water hit it while dry and hot!', ents: { [key]: null } });
  ignite(s, w, key);
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

const MULTIS = STRUCTURES.filter((st) => st.multi);
const HATCH = new Map(STRUCTURES.filter((st) => st.hatch).map((st) => [st.id, st.hatch!]));
const cellKey = (w: number, x: number, y: number, f: number, [dx, dy, df]: number[]) => `${mod(x + dx, w)},${y + dy},${f + df}`;

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
  for (const st of MULTIS) for (let r = 0; r < 4; r++) for (const { c: [dx, dy, df], id, hatch } of multiCells(st, r)) {
    if (f - df < 0 || (id !== e.s && !(hatch && st.multi!.hatches!.includes(e.s)))) continue;
    const k = `${mod(x - dx, w)},${y - dy},${f - df}`, c = ents[k];
    if (c?.s === st.id && c.r === r) return k;
  }
  return null;
}

export interface MultiCheck {
  /** Pattern tiles lacking their casing: [key, structure id], bottom-up. */
  miss: [string, string][];
  /** Chamber tiles that must be empty. */
  blocked: string[];
  /** Required hatches not present (structure ids). */
  need: string[];
  /** Hatches in place by structure id (P4e: energy hatches). */
  has: Record<string, number>;
  /** Coolest coil in place (K; P5d), if the pattern has coils. */
  heat?: number;
}
const NO_MULTI: MultiCheck = { miss: [], blocked: [], need: [], has: {} };
/** Multiblock check (rotated with the controller); hatches count as casings on outer tiles. */
export function multiCheck(ents: GameState['ents'], w: number, key: string): MultiCheck {
  const ctl = ents[key], st = STRUCT.get(ctl?.s ?? ''), m = st?.multi;
  if (!m) return NO_MULTI;
  const [x, y, f] = parse(key), miss: [string, string][] = [], has: Record<string, number> = {};
  let heat: number | undefined;
  // Bottom-up, outer before centre, so auto-fill always has support.
  const cells = multiCells(st, ctl.r).sort((a, b) => a.c[2] - b.c[2] || Math.abs(b.c[0]) + Math.abs(b.c[1]) - Math.abs(a.c[0]) - Math.abs(a.c[1]));
  for (const { c, id, hatch } of cells) {
    const k = cellKey(w, x, y, f, c), s = ents[k]?.s;
    if (COILS.has(id) && s && COILS.has(s)) { heat = Math.min(heat ?? Infinity, COILS.get(s)!); continue; } // any coil tier (P5d)
    if (s === id) continue;
    if (hatch && s && m.hatches!.includes(s)) { has[s] = (has[s] ?? 0) + 1; continue; }
    miss.push([k, id]);
  }
  return {
    miss,
    blocked: PATTERNS_HOLLOW(st).map((c) => cellKey(w, x, y, f, rotCell(c, ctl.r))).filter((k) => ents[k]),
    need: (m.need ?? []).filter((h) => !has[h] && !Object.keys(has).some((k) => HATCH.get(k) === HATCH.get(h))), // any tier of that hatch
    has,
    heat,
  };
}
const PATTERNS_HOLLOW = (st: StructDef) => PATTERNS[st.multi!.pattern].hollow as Cell[];
const incomplete = (mc: MultiCheck) => mc.miss.length + mc.blocked.length + mc.need.length > 0;
export const missingCasings = (ents: GameState['ents'], w: number, key: string) => multiCheck(ents, w, key).miss;
/** Hatch kind of a structure id (P3d). */
export const hatchOf = (id: string) => HATCH.get(id);

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

const flowCache = new Map<string, number>();
/** Water turbine flow next to a machine (P4d): river 1, lake LAKE_FLOW, else 0. */
function flowAt(gen: WorldGen, key: string): number {
  let v = flowCache.get(key);
  if (v === undefined) {
    const [x, y] = parse(key), near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => gen.inBounds(y + dy) ? gen.surface(gen.wrapX(x + dx), y + dy).water : Water.None);
    v = near.includes(Water.River) ? 1 : near.includes(Water.Lake) ? LAKE_FLOW : 0;
    flowCache.set(key, v);
  }
  return v;
}

/** Generator output available now (W): steam turbines throttle on steam, combustion on fuel, the rest on sun / wind × height /
 * flowing water (P4d). */
export function genW(s: GameState, gen: WorldGen, key: string, m: Mach, d: MachineDef): number {
  const g = d.gen ?? 0;
  if (d.steam) return g * Math.min(1, (m.steam ?? 0) / d.steam);
  if (d.burns) return m.tank && d.burns[m.tank.id] ? Math.min(g, m.tank.n * d.burns[m.tank.id] * TPS) : 0;
  if (d.ambient === 'sun') return g * sunlight(s);
  if (d.ambient === 'wind') return g * s.weather.wind * Math.min(1, 0.3 + (0.7 * parse(key)[2]) / WIND_FULL_B);
  if (d.ambient === 'water') { const f = flowAt(gen, key); return f >= 1 ? g * Math.min(1, 0.8 + s.weather.rain * 0.5) : g * f; }
  return g;
}

const recipeOf = (id?: string): Recipe | undefined => (id ? registry().recipe(id) : undefined);
const isGas = (id: string) => registry().fluid(id)?.phase === 'gas';
/** Machines with a single tank (not a fluid bag). */
/** Batteries in a battery buffer (P4c). */
export const battN = (m: Mach, def: MachineDef) => m.inp[battOf(def).empty] ?? 0;
export const singleTank = (def: MachineDef) => def.run === 'boiler' || def.run === 'pump' || def.run === 'tank' || !!def.burns;
/** Gas outputs vent from primitive/steam machines; electric ones keep them (P4b). */
const vents = (def: MachineDef, id: string) => def.run !== 'elec' && isGas(id);
/** Fluid bag cap per fluid (L). */
export const flCap = (def: MachineDef) => def.tank ?? 8000;

function hasInputs(m: Mach, r: Recipe): boolean {
  return r.inputs.every((i) => (m.inp[i.id] ?? 0) >= i.n) && (r.keep ?? []).every((k) => (m.inp[k] ?? 0) >= 1)
    && (r.fluidsIn ?? []).every((f) => (m.fl?.[f.id] ?? 0) >= f.n - 1e-9);
}

function hasRoom(m: Mach, r: Recipe, def: MachineDef): boolean {
  const kinds = new Set(Object.keys(m.out));
  for (const o of r.outputs) { if ((m.out[o.id] ?? 0) + o.n > STACK) return false; kinds.add(o.id); }
  if (kinds.size > OUT_KINDS) return false;
  for (const f of r.fluidsOut ?? []) if (!vents(def, f.id) && (m.fl?.[f.id] ?? 0) + f.n > flCap(def)) return false;
  return true;
}

/** Why the machine can't progress right now (null = ready). Doesn't touch fuel/heat. */
function blocker(s: GameState, gen: WorldGen, key: string, m: Mach, def: MachineDef, r?: Recipe): number | null {
  if (!r) return MS.idle;
  const mc = multiCheck(s.ents, gen.w, key);
  if (def.ehatch) {
    m.eh = 0; m.ehw = 0; m.eht = undefined;
    for (const [id, n] of Object.entries(mc.has)) {
      if (HATCH.get(id) !== 'energy') continue;
      const t = STRUCT.get(id)!.tier ?? 'LV';
      m.eh += n; m.ehw += n * hatchW(t);
      if (!m.eht || tierIndex(t) < tierIndex(m.eht)) m.eht = t;
    }
  }
  if (incomplete(mc)) return MS.incomplete;
  if (def.coilK) m.ck = mc.heat ?? def.coilK;
  if (def.coilK && (r.minHeatK ?? 0) > m.ck!) return MS.coils;
  if (def.ehatch && r.power > (m.ehw ?? 0)) return MS.hatchW;
  if (!def.ehatch && tierIndex(r.tier) > tierIndex(def.tier)) return MS.tier;
  if (def.water && !nearWater(gen, key)) return MS.noWater;
  if (!hasInputs(m, r)) return MS.noInput;
  if (!hasRoom(m, r, def)) return MS.full;
  return null;
}

/** Change a fluid in the bag (drops empties). */
export function addFl(m: Mach, id: string, n: number) {
  const v = (m.fl?.[id] ?? 0) + n;
  if (v > 1e-6) (m.fl ??= {})[id] = v;
  else if (m.fl) { delete m.fl[id]; if (!Object.keys(m.fl).length) delete m.fl; }
}
/** Chemistry outputs that set a quest flag when first made (P4b). */
const CHEM_FLAGS = new Set(['brine', 'chlorine', 'hydrochloric_acid', 'sulfur_dioxide', 'sulfuric_acid', 'sodium_aluminate', 'hydrofluoric_acid',
  'methanol', 'coal_tar', 'phenol', 'formaldehyde', 'phenolic_resin', 'sulfur_trioxide']);

function finish(s: GameState, m: Mach, r: Recipe, def: MachineDef) {
  for (const i of r.inputs) { m.inp[i.id] -= i.n; if (!m.inp[i.id]) delete m.inp[i.id]; }
  for (const f of r.fluidsIn ?? []) addFl(m, f.id, -f.n);
  if (r.wear) for (const k of r.keep ?? []) if (next(s) < r.wear) delete m.inp[k]; // catalysts wear (P5c)
  for (const o of r.outputs) if (o.chance === undefined || next(s) < o.chance) m.out[o.id] = (m.out[o.id] ?? 0) + o.n;
  for (const f of r.fluidsOut ?? []) {
    if (vents(def, f.id)) continue; // vents (pollution later)
    addFl(m, f.id, f.n);
    if (CHEM_FLAGS.has(f.id)) s.flags[f.id] = (s.flags[f.id] ?? 0) + 1;
  }
  const fl = def.id === 'ebf' ? ['ebf', ...r.power > hatchW('LV') ? ['ebf_mv'] : [], ...(r.minHeatK ?? 0) > 2000 ? ['ebf_hot'] : []] : (def.base ?? def.id) === 'assembler' && r.outputs.some((o) => o.id === 'circuit:basic') ? ['acirc']
    : def.id === 'hall_heroult' ? ['aluminium'] : [];
  for (const f of fl) s.flags[f] = (s.flags[f] ?? 0) + 1;
  m.prog = 0;
}

/** Tick every machine (no chunk loading yet: all machines run). */
export function stepMachines(s: GameState, gen: WorldGen) {
  for (const [key, m] of Object.entries(s.mach)) {
    const ma = machineAt(s.ents, key);
    if (!ma) { delete s.mach[key]; continue; }
    const { def, st } = ma, r = recipeOf(m.rec);
    if (def.run === 'boiler') {
      if (st.multi && incomplete(multiCheck(s.ents, gen.w, key))) { m.heat += (AMBIENT_K - m.heat) * BOILER_RATE; m.st = MS.incomplete; continue; }
      stepBoiler(s, m, def);
      if (st.multi && m.st === MS.working) s.flags.lboiler = (s.flags.lboiler ?? 0) + 1;
      continue;
    }
    if (def.run === 'store' || def.run === 'tank') continue;
    if (def.run === 'pump') {
      const room = (def.tank ?? 0) - (m.tank?.n ?? 0);
      m.st = !nearWater(gen, key) ? MS.noWater : room <= 0 ? MS.full : !useSteam(m, def) ? MS.noSteam : !usePower(m, def) ? MS.noPower : MS.working;
      if (m.st === MS.working) m.tank = { id: 'water', n: (m.tank?.n ?? 0) + Math.min(room, def.rate ?? 0) };
      continue;
    }
    if (def.run === 'batt') { m.st = !battN(m, def) ? MS.noBatt : m.pw ? MS.working : MS.noLoad; continue; }
    if (def.run === 'xfmr') { m.st = m.pw ? MS.working : MS.noLoad; continue; }
    if (def.run === 'gen') {
      m.st = m.pw ? MS.working : genW(s, gen, key, m, def) > 1e-6 ? MS.noLoad : def.steam ? MS.noSteam : def.burns ? MS.noFuel
        : def.ambient === 'sun' ? MS.noSun : def.ambient === 'wind' ? MS.noWind : def.ambient === 'water' ? MS.noFlow : MS.noLoad;
      if (def.smoke && m.pw && s.tick % TPS === 0) addPoll(s, key, def.smoke);
      continue;
    }
    if (def.run === 'thump') { stepThumper(s, gen, key, m, def); continue; }
    if (def.run === 'dig') { stepDig(s, gen, key, m, def); continue; }
    if (def.maint && m.mt === undefined) m.mt = (1 << MAINT.length) - 1; // a new multiblock has every issue
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
    const oc = overclock(def, m, r!);
    if (def.run === 'elec') {
      const need = (r!.power * OC_POWER ** oc * heatDiscount(def, m, r!)) / TPS;
      if ((m.e ?? 0) < need - 1e-9) { m.st = MS.noPower; continue; }
      m.e! -= need;
      s.flags.powered = (s.flags.powered ?? 0) + 1;
    }
    m.st = MS.working;
    if (def.smoke && def.run === 'elec' && s.tick % TPS === 0) addPoll(s, key, def.smoke);
    if (s.tick % 4 === 0 && smoggy(s, key)) continue; // smog: −25 % speed
    if (def.maint) {
      if (s.tick % TPS === 0 && next(s) < MAINT_P) m.mt = (m.mt ?? 0) | (1 << Math.floor(next(s) * MAINT.length));
      if ((s.tick % 10) / 10 < issues(m) * MAINT_LOSS) continue; // −10 % speed per open issue
    }
    if (oc) s.flags.overclock = (s.flags.overclock ?? 0) + 1;
    if ((m.prog += OC_SPEED ** oc) >= r!.ticks) finish(s, m, r!, def);
  }
}

/** Coil heat bonus (P5d): −HEAT_DISCOUNT power per full HEAT_STEP K the coils run above the recipe's heat. */
export const HEAT_STEP = 900, HEAT_DISCOUNT = 0.05;
export function heatDiscount(def: MachineDef, m: Mach, r: Recipe): number {
  if (!def.coilK || !r.minHeatK) return 1;
  return (1 - HEAT_DISCOUNT) ** Math.max(0, Math.floor(((m.ck ?? def.coilK) - r.minHeatK) / HEAT_STEP));
}

/** Overclocks for a recipe (DESIGN §5, P5b): one per tier the machine (multiblock: its lowest energy hatch) is above the
 * recipe's, while ×OC_POWER power still fits its input. */
export function overclock(def: MachineDef, m: Mach, r: Recipe): number {
  if (def.run !== 'elec' || !r.power) return 0;
  const t = def.ehatch ? m.eht : def.tier, cap = def.ehatch ? m.ehw ?? 0 : TIER_VOLTAGE[def.tier] * AMP_IN;
  if (!t) return 0;
  let n = 0;
  while (n < tierIndex(t) - tierIndex(r.tier) && r.power * OC_POWER ** (n + 1) <= cap) n++;
  return n;
}

/** Open maintenance issues (P4e). */
export const issues = (m: Mach) => { let n = 0; for (let b = m.mt ?? 0; b; b >>= 1) n += b & 1; return n; };

/** Draw a recipe-less machine's steam for this tick (true if it had enough, or needs none). */
function useSteam(m: Mach, def: MachineDef): boolean {
  if (!def.steam) return true;
  if ((m.steam ?? 0) < def.steam) return false;
  m.steam! -= def.steam;
  return true;
}

/** Draw a recipe-less electric machine's power for this tick (P4b electric pump). */
function usePower(m: Mach, def: MachineDef): boolean {
  if (!def.elec) return true;
  const need = def.elec / TPS;
  if ((m.e ?? 0) < need - 1e-9) return false;
  m.e! -= need;
  return true;
}

/** Steam thumper (DESIGN §3 scan): thumps the ground for THUMP_TICKS, then surveys veins deeper and wider than the hammer. */
function stepThumper(s: GameState, gen: WorldGen, key: string, m: Mach, def: MachineDef) {
  if (m.cur) { m.st = MS.surveyed; return; }
  const [r, depth, ticks] = def.survey ?? [THUMP_R, THUMP_DEPTH, THUMP_TICKS];
  if (!useSteam(m, def)) { m.st = MS.noSteam; return; }
  if (!usePower(m, def)) { m.st = MS.noPower; return; }
  m.st = MS.working;
  if (++m.prog < ticks) return;
  const [x, y] = parse(key), { veins, msg } = survey(s, gen, x, y, r, depth, `${def.name} found`);
  m.prog = 0; m.cur = 1;
  const fl = def.steam ? 'thump' : 'scan';
  s.flags[fl] = (s.flags[fl] ?? 0) + 1;
  simEvents.push({ ok: true, sim: true, veins, msg });
}

const MINERAL = new Map(MINERALS.map((mn) => [mn.id, mn]));
type DigP = [r: number, depth: number, h: number, ticks: number];
const digP = (def: MachineDef): DigP => def.dig ?? [DIG_R, DIG_DEPTH, DIG_H, DIG_TICKS];
/** Digger scan position → block (layer 1 down, row by row over the square below it). */
function digAt(gen: WorldGen, key: string, t: number, [R]: DigP): [number, number, number] {
  const [x, y] = parse(key), side = 2 * R + 1, area = side * side, r = t % area;
  return [gen.wrapX(x - R + (r % side)), y - R + Math.floor(r / side), 1 + Math.floor(t / area)];
}
/** Mineable ore at a scan position (hardness ≤ the digger's, not under water). */
function digOre(s: GameState, gen: WorldGen, key: string, t: number, p: DigP) {
  const [x, y, z] = digAt(gen, key, t, p);
  if (!gen.inBounds(y)) return null;
  const mn = MINERAL.get(BLOCKS[blockAt(s, gen, x, y, z)].mineral ?? '');
  if (!mn || mn.hardness > p[2] || BLOCKS[blockAt(s, gen, x, y, z - 1)].liquid) return null;
  return mn;
}

/** Steam excavator / mining rig (DESIGN §3 excavate): mines the ore blocks (not the rock) under a square, layer by layer. */
function stepDig(s: GameState, gen: WorldGen, key: string, m: Mach, def: MachineDef) {
  const p = digP(def), end = (2 * p[0] + 1) ** 2 * p[1];
  let t = m.cur ?? 0;
  for (let n = 0; t < end && n < DIG_SCAN && !digOre(s, gen, key, t, p); n++) t++;
  if (t !== m.cur) m.prog = 0;
  m.cur = t;
  if (t >= end) { m.st = MS.minedOut; return; }
  const mn = digOre(s, gen, key, t, p);
  if (!mn) { m.st = MS.working; return; } // still scanning
  const [x, y, z] = digAt(gen, key, t, p), hit = gen.ore(x, y, z), n = hit?.richness ?? 1, id = `ore:${mn.id}`;
  if ((m.out[id] ?? 0) + n > BAG || (!m.out[id] && Object.keys(m.out).length >= OUT_KINDS)) { m.st = MS.full; return; }
  if (!useSteam(m, def)) { m.st = MS.noSteam; return; }
  if (!usePower(m, def)) { m.st = MS.noPower; return; }
  m.st = MS.working;
  if (++m.prog < p[3] * (1 + mn.hardness)) return;
  if (def.elec) s.flags.rig = (s.flags.rig ?? 0) + 1;
  const k = `${x},${y},${z}`, veins = hit && s.diffs[k] === undefined ? know(s, hit.vein.id, KNOW.exposed) : undefined;
  s.diffs[k] = B.air;
  m.out[id] = (m.out[id] ?? 0) + n;
  m.prog = 0; m.cur = t + 1;
  simEvents.push({ ok: true, sim: true, changes: { [k]: B.air }, veins, msg: veins ? `Excavator exposed: ${hit!.vein.def.name}` : undefined });
}

/** Boiler (DESIGN §6): fuel heats it (slowly) toward the flame, capped; above boiling it turns water into steam in its tank.
 * Solar boilers (P3d) heat toward their cap by daylight instead. */
function stepBoiler(s: GameState, m: Mach, def: MachineDef) {
  const cap = def.tank ?? 0, max = def.maxHeatK ?? BOIL_K + 1, steam = m.tank?.n ?? 0;
  if (def.solar) { m.burn = 0; m.burnK = AMBIENT_K + (max - AMBIENT_K) * sunlight(s); if (m.burnK > BOIL_K) m.burn = 1; }
  else if (m.burn <= 0 && steam < cap) {
    const fuel = Object.keys(m.fuel).sort((a, c) => FUELS[c][0] - FUELS[a][0])[0];
    if (fuel) { [m.burnK, m.burn] = FUELS[fuel]; if (!--m.fuel[fuel]) delete m.fuel[fuel]; }
  }
  const target = m.burn > 0 ? Math.min(m.burnK, max) : AMBIENT_K;
  m.heat += (target - m.heat) * BOILER_RATE;
  if (m.burn > 0) m.burn = def.solar ? 0 : Math.max(0, m.burn - (def.fuelUse ?? 1));
  if (m.heat < BOIL_K) { m.dry = false; m.st = steam >= cap ? MS.full : m.burn > 0 || (def.solar && target > BOIL_K) ? MS.cold : def.solar ? MS.noSun : MS.noFuel; return; }
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
  | { k: 'mdump'; key: string; id?: string }
  | { k: 'mcell'; key: string; id: string; fill?: boolean }
  /** Battery buffer: insert a battery (`put` = item id) or take one out (charged if a full battery's worth is stored). */
  | { k: 'mbat'; key: string; put?: string }
  /** Transformer: toggle step-up / step-down. */
  | { k: 'mxf'; key: string }
  /** Maintenance (P4e): fix issue i with its tool. */
  | { k: 'mfix'; key: string; i: number }
  | { k: 'crank'; key: string }
  | { k: 'mfill'; key: string }
  | { k: 'mface'; key: string; face: number; mode: number }
  | { k: 'cput'; key: string; id: string; n: number };

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
      if (!nr || nr.machine !== (def.base ?? def.id)) return { ok: false, msg: 'Wrong machine for that recipe' };
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
      if ((def.run !== 'fuel' && def.run !== 'boiler') || def.solar) return { ok: false, msg: 'Burns no fuel' };
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
    case 'mface': {
      if (c.face < 0 || c.face > 5 || c.mode < 0 || c.mode > 3) return { ok: false };
      const f = m.faces ?? [0, 0, 0, 0, 0, 0];
      f[c.face] = c.mode;
      if (f.some(Boolean)) m.faces = f; else delete m.faces;
      return { ok: true };
    }
    case 'cput': {
      if (def.run !== 'store') return { ok: false, msg: 'Not a chest' };
      const acc = accepts(m, def, c.id), n = Math.min(c.n, count(s, c.id), acc?.[0] ?? 0);
      if (n <= 0) return { ok: false, msg: count(s, c.id) ? 'Chest full' : `No ${name(c.id)}` };
      take(s, c.id, n); m.out[c.id] = (m.out[c.id] ?? 0) + n;
      return { ok: true };
    }
    case 'mdump': {
      const dumped: [string, number][] = m.tank ? [[m.tank.id, m.tank.n]] : Object.entries(m.fl ?? {}).filter(([id]) => !c.id || id === c.id);
      let poll = 0;
      for (const [id, n] of dumped) {
        const fd = registry().fluid(id);
        if (fd && (fd.phase === 'gas' || fd.hazards.includes('toxic')) && id !== 'steam' && id !== 'water') poll += n * DUMP_POLL;
        if (!m.tank) addFl(m, id, -n);
      }
      if (m.tank) m.tank = undefined;
      if (poll) addPoll(s, c.key, poll);
      if (dumped.some(([id, n]) => n >= DUMP_HAZ && registry().fluid(id)?.hazards.some((h) => h === 'toxic' || h === 'corrosive'))) {
        contaminate(s, c.key);
        return { ok: true, msg: `Dumped — pollution +${Math.round(poll)}, the ground here is contaminated` };
      }
      return { ok: true, msg: poll ? `Dumped — pollution +${Math.round(poll)}` : 'Tank emptied' };
    }
    case 'mcell': return cellCmd(s, m, def, c.id, !!c.fill);
    case 'mbat': {
      if (def.run !== 'batt') return { ok: false, msg: 'Not a battery buffer' };
      const n = battN(m, def), { empty, full: charged, j: J } = battOf(def);
      if (c.put) {
        if (c.put !== empty && c.put !== charged) return { ok: false, msg: `Takes ${name(empty).replace(/ \(empty\)$/, '')} only` };
        if (n >= (def.slots ?? 0)) return { ok: false, msg: 'All slots full' };
        if (!count(s, c.put)) return { ok: false, msg: `No ${name(c.put)}` };
        take(s, c.put, 1); m.inp[empty] = n + 1;
        if (c.put === charged) m.e = (m.e ?? 0) + J;
        return { ok: true };
      }
      if (!n) return { ok: false, msg: 'No batteries' };
      const full = (m.e ?? 0) >= J - 1e-6, id = full ? charged : empty;
      if (give(s, id, 1)) return { ok: false, msg: 'Inventory full' };
      if (full) m.e! -= J;
      if (n > 1) m.inp[empty] = n - 1; else delete m.inp[empty];
      m.e = Math.min(m.e ?? 0, (n - 1) * J);
      if (full) s.flags.battery = (s.flags.battery ?? 0) + 1;
      return { ok: true, gained: [{ id, n: 1 }] };
    }
    case 'mxf': {
      if (def.run !== 'xfmr') return { ok: false, msg: 'Not a transformer' };
      m.up = !m.up || undefined; m.e = 0;
      return { ok: true, msg: m.up ? 'Step-up: low sides in → front out at 128 V' : 'Step-down: front in at 128 V → low sides out' };
    }
    case 'mfix': {
      if (!def.maint || !((m.mt ?? 0) >> c.i & 1)) return { ok: false, msg: 'Nothing to fix' };
      if (!multiCheck(s.ents, gen.w, c.key).has.maintenance_hatch) return { ok: false, msg: 'Needs a maintenance hatch' };
      const [tool, what] = MAINT[c.i], t = bestTool(s, tool);
      if (!t) return { ok: false, msg: `${what}: needs a ${tool.replace('_', ' ')} in your tool slots` };
      m.mt! &= ~(1 << c.i);
      s.flags.maint = (s.flags.maint ?? 0) + 1;
      return { ok: true, msg: wear(s, t.i) ?? `Fixed: ${what}` };
    }
    case 'crank': {
      if (def.run !== 'crank') return { ok: false };
      const b = blocker(s, gen, c.key, m, def, r);
      if (b !== null) return { ok: false, msg: MS_TEXT[b] };
      const tools = (r!.tools ?? []).map((t) => bestTool(s, t));
      if (tools.some((t) => !t)) return { ok: false, msg: `Needs a ${r!.tools!.join(', ')}` };
      m.prog += CRANK_TICKS;
      if (m.prog < r!.ticks) return { ok: true, progress: [m.prog, r!.ticks], target: st.name };
      const before = { ...m.out };
      finish(s, m, r!, def);
      const msg = tools.map((t) => wear(s, t!.i)).find(Boolean);
      const made = Object.entries(m.out).filter(([id, n]) => n > (before[id] ?? 0)).map(([id, n]) => `${name(id)} ×${n - (before[id] ?? 0)}`);
      return { ok: true, msg: msg ?? (made.length ? `Made ${made.join(', ')}` : undefined) };
    }
    case 'mfill': {
      const miss = missingCasings(s.ents, gen.w, c.key);
      if (!st.multi || !miss.length) return { ok: true };
      const ents: NonNullable<ActResult['ents']> = {};
      let why: string | undefined;
      for (const [k, id] of miss) {
        const [x, y, f] = parse(k);
        if (s.ents[k]) { why = 'Something else is in the way'; continue; }
        // Coil cells take the hottest coil in the bag (P5d).
        const pick = COILS.has(id) ? [...COILS.keys()].find((c) => count(s, `struct:${c}`) > 0) ?? id : id;
        const res = placeAt(s, gen, `struct:${pick}`, x, y, f, 0);
        if (!res.ok && res.msg?.startsWith('No ')) { why = res.msg; continue; }
        if (res.ok) Object.assign(ents, res.ents); else why = res.msg;
      }
      return { ok: !why, ents, msg: why };
    }
  }
}

/** Pour cells of a fluid into a machine, or (fill) fill empty cells from what it holds (P4b). */
function cellCmd(s: GameState, m: Mach, def: MachineDef, id: string, fill: boolean): ActResult {
  if (!CELL_FLUIDS.includes(id)) return { ok: false, msg: 'No cell for that fluid' };
  const full = `cell:${id}`;
  if (fill) {
    const have = singleTank(def) ? (m.tank?.id === id ? m.tank.n : 0) : m.fl?.[id] ?? 0;
    const n = Math.min(count(s, 'cell:empty'), Math.floor((have + 1e-6) / CELL_L));
    if (n <= 0) return { ok: false, msg: count(s, 'cell:empty') ? `Less than ${CELL_L} L` : 'No empty cells' };
    take(s, 'cell:empty', n);
    const left = give(s, full, n);
    if (left) give(s, 'cell:empty', left);
    const used = (n - left) * CELL_L;
    if (singleTank(def)) { m.tank!.n -= used; if (m.tank!.n <= 1e-6) m.tank = undefined; } else addFl(m, id, -used);
    s.flags.cell = (s.flags.cell ?? 0) + 1;
    return { ok: true, msg: `Filled ${n - left} cell${n - left === 1 ? '' : 's'}` };
  }
  const room = fluidRoom(m, def, id);
  const n = Math.min(count(s, full), Math.floor((room + 1e-6) / CELL_L));
  if (n <= 0) return { ok: false, msg: !count(s, full) ? `No ${name(full)}` : room > 0 ? 'Not enough room' : 'It takes no ' + (registry().fluid(id)?.name ?? id) };
  take(s, full, n);
  const left = give(s, 'cell:empty', n);
  if (singleTank(def)) {
    if (def.run === 'boiler') m.water = (m.water ?? 0) + n * CELL_L; else m.tank = { id, n: (m.tank?.n ?? 0) + n * CELL_L };
  } else addFl(m, id, n * CELL_L);
  s.flags.cell = (s.flags.cell ?? 0) + 1;
  return { ok: true, msg: `Poured ${n} cell${n === 1 ? '' : 's'}${left ? ' (bag full: empty cells lost)' : ''}` };
}

/** Room for fluid `id` poured in by hand: recipe inputs, barrels, boiler water. */
function fluidRoom(m: Mach, def: MachineDef, id: string): number {
  if (def.run === 'boiler') return id === 'water' ? (def.waterTank ?? BOILER_WATER) - (m.water ?? 0) : 0;
  if (def.burns) return def.burns[id] && (!m.tank || m.tank.id === id) ? (def.tank ?? 0) - (m.tank?.n ?? 0) : 0;
  if (def.run === 'tank') return (m.tank && m.tank.id !== id) || (def.cold && id === 'steam') ? 0 : (def.tank ?? 0) - (m.tank?.n ?? 0);
  if (singleTank(def)) return 0;
  const r = recipeOf(m.rec);
  return r?.fluidsIn?.some((f) => f.id === id) ? flCap(def) - (m.fl?.[id] ?? 0) : 0;
}

/** Machine statuses for the renderer (status icons). */
export const statuses = (s: GameState): Record<string, number> => Object.fromEntries(Object.entries(s.mach).map(([k, m]) => [k, m.st]));
