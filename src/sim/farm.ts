// Farming (P5h, DESIGN §3 Trees & farming): plants are blocks — `tree` ents on the ground (sapling → grown tree) and
// `planter` ents holding crop sticks or a crop (`Ent.pl`, growth `Ent.g` 0–1, compost seconds `Ent.cp`). Growth, breeding and
// planted-tree pollution absorption tick once per second; stage changes go to the client as sim events.
// player.ts ↔ farm.ts import each other: no top-level use of imports.
import { COMPOST_S, CROP, crossOf, NO_BLOCK_CAP, SAPLING, SPROUT, CROSS_P, stage, WATER_R } from '../data/crops';
import { B } from '../world/blocks';
import { Water, type WorldGen } from '../world/gen';
import { topInStorey } from './build';
import { MS, simEvents, type Mach } from './machines';
import { blockAt, count, give, take, type ActResult } from './player';
import { BLIGHT, pollAt, pollKey, TREE_ABSORB } from './pollution';
import { next } from './rng';
import { TPS, type Ent, type GameState } from './state';
import type { Stack } from '../content/types';
import type { MachineDef } from '../data/machines';
import { contaminated } from './hazards';

/** Reach of the harvester / crop manager (tiles) and block levels above/below its own. */
export const FARM_R = 4, FARM_DB = 1, FARM_EVERY = 2 * TPS;
const isCrop = (e?: Ent) => !!e && e.s === 'planter' && !!e.pl && e.pl !== 'sticks';

/** Natural water near a tile (cached per world + tile) — rain counts too (checked by the caller). */
const wet = new Map<string, boolean>();
function nearWater(gen: WorldGen, x: number, y: number): boolean {
  const k = `${gen.seed},${x},${y}`;
  let v = wet.get(k);
  if (v === undefined) {
    v = false;
    for (let dy = -WATER_R; dy <= WATER_R && !v; dy++) for (let dx = -WATER_R; dx <= WATER_R && !v; dx++)
      if (gen.inBounds(y + dy) && gen.surface(gen.wrapX(x + dx), y + dy).water !== Water.None) v = true;
    wet.set(k, v);
  }
  return v;
}
export const watered = (s: GameState, gen: WorldGen, x: number, y: number) => s.weather.rain >= 0.3 || nearWater(gen, x, y);

/** Why a crop can't grow right now (null = growing), and its rate per second. */
function cropRate(s: GameState, gen: WorldGen, key: string, e: Ent): number {
  const [x, y, b] = key.split(',').map(Number), c = CROP.get(e.pl!);
  if (!c || pollAt(s, x, y) >= BLIGHT) return 0;
  if (c.needs && (e.g ?? 0) >= NO_BLOCK_CAP && s.ents[`${x},${y},${b - 1}`]?.s !== `block_${c.needs}`) return 0;
  return (1 / c.grow) * (watered(s, gen, x, y) ? 1 : 0.5) * ((e.cp ?? 0) > 0 ? 2 : 1);
}

/** Growth status text for the hover / panel. */
export function plantInfo(s: GameState, gen: WorldGen, key: string): string | null {
  const e = s.ents[key];
  if (!e) return null;
  if (e.s === 'tree') { const sp = SAPLING.get(e.pl ?? ''); return `${sp?.name.replace(' Sapling', ' tree') ?? 'Tree'} · ${(e.g ?? 0) >= 1 ? 'grown — chop it (Mining)' : `${Math.floor((e.g ?? 0) * 100)} %`}`; }
  if (e.s !== 'planter') return null;
  if (!e.pl) return 'Planter · empty (place crop sticks)';
  if (e.pl === 'sticks') return 'Crop sticks · empty (seed, or two mature crops beside it cross into it)';
  const c = CROP.get(e.pl)!, [x, y, b] = key.split(',').map(Number), g = e.g ?? 0;
  const bits = [`${c.name} · ${g >= 1 ? 'mature — tap to harvest' : `${Math.floor(g * 100)} %`}`];
  if (c.needs && g >= NO_BLOCK_CAP && g < 1 && s.ents[`${x},${y},${b - 1}`]?.s !== `block_${c.needs}`) bits.push(`needs a block of ${c.needs} below`);
  if (!watered(s, gen, x, y)) bits.push('dry (½ speed)');
  if ((e.cp ?? 0) > 0) bits.push('composted (2×)');
  return bits.join(' · ');
}

/** Place a sapling (ground), crop sticks / a seed / compost (planter) — Machine Build with a farming item. */
export function plant(s: GameState, gen: WorldGen, id: string, xIn: number, y: number, f: number): ActResult {
  const x = gen.wrapX(xIn);
  if (!count(s, id)) return { ok: false, msg: 'None in inventory' };
  if (id.startsWith('sapling:')) {
    if (!SAPLING.has(id.slice(8))) return { ok: false, msg: 'Not plantable' };
    if (f !== 0) return { ok: false, msg: 'Saplings go in the ground (ground storey)' };
    if (!gen.inBounds(y)) return { ok: false, msg: 'Off the map' };
    const sf = gen.surface(x, y), key = `${x},${y},0`;
    if (topInStorey(s.ents, x, y, 0) || s.base[`${x},${y},0,f`]) return { ok: false, msg: 'Something is built here' };
    if (sf.ice || sf.water !== Water.None) return { ok: false, msg: 'Saplings need dry soil' };
    if (blockAt(s, gen, x, y, 0) === B.air) return { ok: false, msg: 'Fill the pit first' };
    if (gen.tree(x, y, sf) && s.diffs[`${x},${y},t`] === undefined) return { ok: false, msg: 'A tree already grows here' };
    if (contaminated(s, x, y)) return { ok: false, msg: 'Contaminated ground' };
    take(s, id, 1);
    s.ents[key] = { s: 'tree', r: 0, pl: id.slice(8), g: 0 };
    s.flags.sapling = (s.flags.sapling ?? 0) + 1;
    return { ok: true, ents: { [key]: { ...s.ents[key] } } };
  }
  const key = topInStorey(s.ents, x, y, f), e = key ? s.ents[key] : undefined;
  if (!key || !e || e.s !== 'planter') return { ok: false, msg: 'Needs a planter' };
  if (id === 'compost') {
    take(s, id, 1); e.cp = (e.cp ?? 0) + COMPOST_S;
    s.flags.compost = (s.flags.compost ?? 0) + 1;
    return { ok: true, ents: { [key]: { ...e } }, msg: `Composted: 2× growth for ${Math.round(e.cp / 60)} min` };
  }
  if (id === 'crop_sticks') {
    if (e.pl) return { ok: false, msg: 'This planter is already in use' };
    take(s, id, 1); e.pl = 'sticks';
    return { ok: true, ents: { [key]: { ...e } } };
  }
  if (id.startsWith('seed:')) {
    if (e.pl !== 'sticks') return { ok: false, msg: e.pl ? 'Something already grows here' : 'Place crop sticks first' };
    take(s, id, 1); e.pl = id.slice(5); e.g = 0;
    s.flags.plant_crop = (s.flags.plant_crop ?? 0) + 1;
    return { ok: true, ents: { [key]: { ...e } } };
  }
  return { ok: false, msg: 'Not plantable' };
}

/** What harvesting the plant at key would give (mutates it: crop back to half grown, tree removed). Null if not ripe. */
export function reap(s: GameState, key: string): { drops: Stack[]; ent: Ent | null } | null {
  const e = s.ents[key];
  if (!e || (e.g ?? 0) < 1) return null;
  const roll = (p: number, id: string, n = 1): Stack[] => (next(s) < p ? [{ id, n }] : []);
  if (isCrop(e)) {
    const c = CROP.get(e.pl!)!;
    e.g = 0.5;
    s.flags.harvest = (s.flags.harvest ?? 0) + 1;
    return { drops: [{ id: `crop:${c.id}`, n: c.wild ? 2 : 1 }, ...roll(0.25, `seed:${c.id}`)], ent: { ...e } };
  }
  if (e.s === 'tree') {
    const sp = SAPLING.get(e.pl ?? '');
    delete s.ents[key];
    s.flags.tree_farm = (s.flags.tree_farm ?? 0) + 1;
    return { drops: [{ id: 'log:wood', n: sp?.tree === 3 ? 4 : 3 }, { id: `sapling:${e.pl}`, n: 1 }, ...roll(0.5, `sapling:${e.pl}`), ...roll(0.5, 'stick:wood', 2),
      ...(sp?.tree === 3 ? roll(0.5, 'sticky_resin') : [])], ent: null };
  }
  return null;
}

/** Tap a planter in View mode: harvest a mature crop into the inventory. */
export function harvest(s: GameState, gen: WorldGen, xIn: number, y: number, f: number): ActResult {
  const x = gen.wrapX(xIn), key = topInStorey(s.ents, x, y, f);
  if (!key || s.ents[key].s !== 'planter') return { ok: false };
  const info = plantInfo(s, gen, key) ?? undefined, r = reap(s, key);
  if (!r) return { ok: false, msg: info };
  for (const d of r.drops) give(s, d.id, d.n);
  return { ok: true, ents: { [key]: r.ent }, gained: r.drops };
}

/** Once a second: grow plants, breed into empty sticks, compost runs down, grown planted trees absorb pollution. */
export function stepFarm(s: GameState, gen: WorldGen) {
  if (s.tick % TPS) return;
  const changed: Record<string, Ent | null> = {};
  for (const [key, e] of Object.entries(s.ents)) {
    if (e.s === 'tree') {
      const [x, y] = key.split(',').map(Number), g = e.g ?? 0;
      if (g >= 1) { const pk = pollKey(x, y), v = s.poll[pk] ?? 0; if (v > 0 && v < BLIGHT) s.poll[pk] = Math.max(0, v - TREE_ABSORB); continue; }
      if (pollAt(s, x, y) >= BLIGHT) continue;
      const before = stage(g);
      e.g = snap(g + 1 / (SAPLING.get(e.pl ?? '')?.grow ?? 300));
      if (stage(e.g) !== before) changed[key] = { ...e };
      continue;
    }
    if (e.s !== 'planter' || !e.pl) continue;
    if ((e.cp ?? 0) > 0) { e.cp = Math.max(0, e.cp! - 1); if (!e.cp) { delete e.cp; changed[key] = { ...e }; } }
    if (e.pl === 'sticks') { breed(s, gen, key, e, changed); continue; }
    const g = e.g ?? 0;
    if (g >= 1) continue;
    const rate = cropRate(s, gen, key, e);
    if (!rate) continue;
    const before = stage(g), c = CROP.get(e.pl)!;
    let ng = snap(g + rate);
    if (c.needs && s.ents[key.replace(/,(\d+)$/, (_, b) => `,${+b - 1}`)]?.s !== `block_${c.needs}`) ng = Math.min(ng, NO_BLOCK_CAP);
    e.g = ng;
    if (stage(ng) !== before) changed[key] = { ...e };
  }
  if (Object.keys(changed).length) simEvents.push({ ok: true, sim: true, ents: changed });
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Growth sums of 1/grow drift below 1: snap. */
const snap = (g: number) => (g > 1 - 1e-6 ? 1 : g);
function breed(s: GameState, gen: WorldGen, key: string, e: Ent, changed: Record<string, Ent | null>) {
  const [x, y, b] = key.split(',').map(Number);
  const ripe = SIDES.map(([dx, dy]) => s.ents[`${gen.wrapX(x + dx)},${y + dy},${b}`]).filter((n) => isCrop(n) && (n!.g ?? 0) >= 1).map((n) => n!.pl!);
  if (ripe.length < 2 || next(s) >= SPROUT) return;
  const i = Math.floor(next(s) * ripe.length);
  let j = Math.floor(next(s) * (ripe.length - 1)); if (j >= i) j++;
  const child = crossOf(ripe[i], ripe[j]);
  const crossed = !!child && next(s) < CROSS_P;
  e.pl = crossed ? child! : next(s) < 0.5 ? ripe[i] : ripe[j]; e.g = 0;
  if (crossed) {
    s.flags.cross = (s.flags.cross ?? 0) + 1;
    simEvents.push({ ok: true, sim: true, msg: `🌱 New crop: ${CROP.get(e.pl)!.name} sprouted between ${CROP.get(ripe[i])!.name} and ${CROP.get(ripe[j])!.name}` });
  }
  changed[key] = { ...e };
}

/** Harvester (LV) / crop manager (MV), every FARM_EVERY ticks while powered. */
export function stepFarmMachine(s: GameState, gen: WorldGen, key: string, m: Mach, def: MachineDef, usePower: () => boolean) {
  if (!usePower()) { m.st = MS.noPower; return; }
  if (++m.prog < FARM_EVERY) { if (m.st !== MS.full && m.st !== MS.noInput) m.st = MS.working; return; }
  m.prog = 0;
  const [x, y, b] = key.split(',').map(Number);
  const near: string[] = [];
  for (let dy = -FARM_R; dy <= FARM_R; dy++) for (let dx = -FARM_R; dx <= FARM_R; dx++) for (let db = -FARM_DB; db <= FARM_DB; db++) {
    if (b + db < 0) continue;
    const k = `${gen.wrapX(x + dx)},${y + dy},${b + db}`;
    if (s.ents[k]) near.push(k);
  }
  const ev: Record<string, Ent | null> = {};
  if (def.id === 'harvester') {
    const k = near.find((n) => (s.ents[n].s === 'tree' || isCrop(s.ents[n])) && (s.ents[n].g ?? 0) >= 1);
    if (!k) { m.st = MS.working; return; }
    if (Object.keys(m.out).length >= 8 || Object.values(m.out).some((n) => n >= 64 * 16)) { m.st = MS.full; return; }
    const wasTree = s.ents[k].s === 'tree', kind = s.ents[k].pl, r = reap(s, k)!;
    for (const d of r.drops) m.out[d.id] = (m.out[d.id] ?? 0) + d.n;
    ev[k] = r.ent;
    // Replant the felled spot from the input bag (or the sapling it just dropped).
    const sap = `sapling:${kind}`;
    if (wasTree && ((m.inp[sap] ?? 0) > 0 || (m.out[sap] ?? 0) > 0)) {
      if ((m.inp[sap] ?? 0) > 0) { if (!--m.inp[sap]) delete m.inp[sap]; } else if (!--m.out[sap]) delete m.out[sap];
      s.ents[k] = { s: 'tree', r: 0, pl: kind, g: 0 }; ev[k] = { ...s.ents[k] };
    }
    s.flags.harvester = (s.flags.harvester ?? 0) + 1;
  } else {
    // Crop manager: sticks on a bare planter, compost on one whose compost ran out.
    const bare = near.find((n) => s.ents[n].s === 'planter' && !s.ents[n].pl && !s.ents[`${n.replace(/,(\d+)$/, (_, bb) => `,${+bb + 1}`)}`]);
    const hungry = near.find((n) => isCrop(s.ents[n]) && !(s.ents[n].cp ?? 0));
    if (bare && (m.inp.crop_sticks ?? 0) > 0) { if (!--m.inp.crop_sticks) delete m.inp.crop_sticks; s.ents[bare].pl = 'sticks'; ev[bare] = { ...s.ents[bare] }; }
    else if (hungry && (m.inp.compost ?? 0) > 0) { if (!--m.inp.compost) delete m.inp.compost; s.ents[hungry].cp = COMPOST_S; ev[hungry] = { ...s.ents[hungry] }; }
    else { m.st = MS.noInput; return; }
    s.flags.crop_manager = (s.flags.crop_manager ?? 0) + 1;
  }
  m.st = MS.working;
  simEvents.push({ ok: true, sim: true, ents: ev });
}

/** A planted tree (ground storey) fills its tile 2 storeys up: nothing can be built above it. */
export const treeAt = (s: GameState, x: number, y: number) => s.ents[`${x},${y},0`]?.s === 'tree';
