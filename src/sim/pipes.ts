// Pipes (DESIGN §5 faces, §7). Pipe blocks join same-kind neighbours on all 6 sides into networks; every machine side a
// pipe touches is a link, filtered by that side's face mode (auto/in/out/off).
// Fluid (P3a): contents live per pipe in s.pipes (saved; a network keeps its fluid once set). Each tick a network pools them,
// attached machines push what they make and pull what they use (limited by the pipe rate per link), then the pool is spread
// back evenly. Storage (barrels) only gives when a machine runs short and takes what's left, so it acts as a buffer.
// Items (P3b): every ITEM_EVERY ticks each source (machine outputs on auto/out sides, chests on out sides) sends up to the
// pipe rate to the nearest sinks by pipe distance (recipe inputs, fuel, chests on auto/in sides).
import { BOILER_WATER, BOOM_K, FACE, FUELS, ITEM_EVERY, MACHINE, STEAM_BUF, type MachineDef } from '../data/machines';
import { PIPES, STRUCTURES } from '../data/structures';
import { registry } from '../content/registry';
import type { WorldGen } from '../world/gen';
import { BAG as BAG_N, controllerAt, explode, newMach, type Mach } from './machines';
import type { GameState } from './state';

/** A machine side touching the network: controller key, its face index, the pipe block it touches. */
export interface Link { ctl: string; face: number; via: string }
export interface Net { keys: string[]; item: boolean; rate: number; cap: number; links: Link[]; dist: Map<string, Map<string, number>> }

/** Bumped whenever structures are placed/removed: networks are rebuilt lazily. */
let topo = 0;
export const topoChanged = () => { topo++; };
const cache = new WeakMap<object, { v: number; w: number; nets: Net[] }>();
/** Face order (data/machines SIDES): east, west, south, north, up, down. Opposite side = index ^ 1. */
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const STACK = 64;

/** Neighbour block keys of `x,y,b`, by side index (null below ground). */
function sides(key: string, w: number): (string | null)[] {
  const [x, y, b] = key.split(',').map(Number);
  return DIRS.map(([dx, dy, db]) => (b + db >= 0 ? `${mod(x + dx, w)},${y + dy},${b + db}` : null));
}
/** Neighbour block keys (6 sides) of `x,y,b`. */
export const around = (key: string, w: number): string[] => sides(key, w).filter((k): k is string => !!k);

export function networks(ents: GameState['ents'], w: number): Net[] {
  const c = cache.get(ents);
  if (c && c.v === topo && c.w === w) return c.nets;
  const seen = new Set<string>(), nets: Net[] = [];
  for (const [k, e] of Object.entries(ents)) {
    const pd = PIPES.get(e.s);
    if (!pd || seen.has(k)) continue;
    const keys: string[] = [], links = new Map<string, Link>(), todo = [k];
    seen.add(k);
    while (todo.length) {
      const cur = todo.pop()!;
      keys.push(cur);
      sides(cur, w).forEach((nk, i) => {
        const ne = nk && ents[nk];
        if (!ne) return;
        if (ne.s === e.s) { if (!seen.has(nk!)) { seen.add(nk!); todo.push(nk!); } return; }
        if (PIPES.has(ne.s)) return;
        const [x, y, b] = nk!.split(',').map(Number), ctl = controllerAt(ents, w, x, y, b), face = i ^ 1;
        if (ctl && !links.has(`${ctl}|${face}`)) links.set(`${ctl}|${face}`, { ctl, face, via: cur });
      });
    }
    nets.push({ keys, item: !!pd.item, rate: pd.rate, cap: pd.cap * keys.length, dist: new Map(),
      links: [...links.values()].sort((a, b) => (a.ctl < b.ctl ? -1 : a.ctl > b.ctl ? 1 : a.face - b.face)) });
  }
  cache.set(ents, { v: topo, w, nets });
  return nets;
}

const SM = new Map(STRUCTURES.map((st) => [st.id, st.machine ?? '']));
const defOf = (s: GameState, ctl: string): MachineDef | undefined => MACHINE.get(SM.get(s.ents[ctl]?.s ?? '') ?? '');
const mode = (m: Mach, face: number) => m.faces?.[face] ?? FACE.auto;
const canIn = (m: Mach, face: number) => { const f = mode(m, face); return f === FACE.auto || f === FACE.in; };
/** Machines push on auto/out sides; storage only on out sides (else two chests would ping-pong). */
const canOut = (m: Mach, face: number, def: MachineDef) => {
  const f = mode(m, face);
  return f === FACE.out || (f === FACE.auto && def.run !== 'store');
};
const isStore = (def?: MachineDef) => def?.run === 'store' || def?.run === 'tank';

/** Attached machines with the sides allowed by `ok`, one entry per controller. */
function attached(s: GameState, net: Net, ok: (m: Mach, face: number, def: MachineDef) => boolean) {
  const out: { ctl: string; m: Mach; def: MachineDef; via: string }[] = [], done = new Set<string>();
  for (const l of net.links) {
    const def = defOf(s, l.ctl);
    if (!def || done.has(l.ctl)) continue;
    const m = (s.mach[l.ctl] ??= newMach());
    if (!ok(m, l.face, def)) continue;
    done.add(l.ctl); out.push({ ctl: l.ctl, m, def, via: l.via });
  }
  return out;
}

// ---------- fluids ----------
/** Fluid a machine offers to a network (and the bag holding it). */
function offer(m: Mach, def: MachineDef): { id: string; n: number } | null {
  if (!m.tank || m.tank.n <= 0) return null;
  if (def.run === 'boiler' || def.run === 'pump' || def.run === 'tank') return m.tank;
  // Liquid byproducts (creosote, tar, molten metal) leave unless the recipe consumes that fluid.
  const r = m.rec ? registry().recipe(m.rec) : undefined;
  return r?.fluidsIn?.some((f) => f.id === m.tank!.id) ? null : m.tank;
}

/** Wooden storage holds no steam or molten metal. */
export const tooHot = (def: MachineDef, id: string) => !!def.cold && (id === 'steam' || id.startsWith('molten:'));

/** Room a machine has for fluid `id` → [current, cap, setter]. */
function want(m: Mach, def: MachineDef, id: string): [number, number, (n: number) => void] | null {
  if (def.run === 'boiler') return id === 'water' ? [m.water ?? 0, BOILER_WATER, (n) => { m.water = n; }] : null;
  if ((def.run === 'steam' || def.steam) && id === 'steam') return [m.steam ?? 0, STEAM_BUF, (n) => { m.steam = n; }];
  const setTank = (n: number) => { m.tank = n > 0 ? { id, n } : undefined; };
  if (def.run === 'tank') return (m.tank && m.tank.id !== id) || tooHot(def, id) ? null : [m.tank?.n ?? 0, def.tank ?? 0, setTank];
  const r = m.rec ? registry().recipe(m.rec) : undefined;
  if (!r?.fluidsIn?.some((f) => f.id === id) || (m.tank && m.tank.id !== id)) return null;
  return [m.tank?.n ?? 0, def.tank ?? 8000, setTank];
}

function stepFluid(s: GameState, net: Net) {
  let id: string | undefined, n = 0;
  const byId: Record<string, number> = {};
  for (const k of net.keys) { const p = s.pipes[k]; if (p) byId[p.id] = (byId[p.id] ?? 0) + p.n; }
  // A network keeps its fluid even when empty (no steam backflow into a drained water line). Merged networks with
  // different fluids keep the larger one (the rest is lost).
  for (const [f, v] of Object.entries(byId)) if (!id || v > n) { id = f; n = v; }
  const outs = attached(s, net, canOut), ins = attached(s, net, canIn);
  const push = (list: typeof outs) => {
    for (const { m, def } of list) {
      const o = offer(m, def);
      if (!o || (id && id !== o.id)) continue;
      const amt = Math.min(o.n, net.rate, net.cap - n);
      if (amt > 0) { id = o.id; n += amt; o.n -= amt; if (o.n <= 1e-9) m.tank = undefined; }
    }
  };
  /** Fill machines; true if one still wants more. */
  const pull = (list: typeof ins): boolean => {
    let short = false;
    if (id) for (const { ctl, m, def } of list) {
      const wt = want(m, def, id);
      if (!wt) continue;
      const [cur, cap, set] = wt, amt = Math.min(n, net.rate, cap - cur);
      if (amt < Math.min(net.rate, cap - cur)) short = true;
      if (amt <= 0) continue;
      if (def.run === 'boiler' && m.dry) {
        if (m.heat > BOOM_K) { explode(s, ctl); continue; }
        m.dry = false;
      }
      set(cur + amt); n -= amt;
    }
    return short;
  };
  // Producers → consumers; storage tops up any shortfall, then soaks up what's left.
  push(outs.filter((o) => !isStore(o.def)));
  const users = ins.filter((o) => !isStore(o.def));
  if (pull(users)) { push(outs.filter((o) => isStore(o.def))); pull(users); }
  pull(ins.filter((o) => isStore(o.def)));
  const per = n / net.keys.length;
  for (const k of net.keys) if (id) s.pipes[k] = { id, n: per > 1e-6 ? per : 0 };
}

// ---------- items ----------
/** Items a chest holds, in stacks. */
export const slotsUsed = (bag: Record<string, number>) => Object.values(bag).reduce((a, n) => a + Math.ceil(n / STACK), 0);

/** How many of `id` a machine takes from a pipe, and the bag it goes into. */
export function accepts(m: Mach, def: MachineDef, id: string): [number, Record<string, number>] | null {
  if (def.run === 'store') {
    const free = ((def.slots ?? 0) - slotsUsed(m.out)) * STACK + (m.out[id] ? (STACK - (m.out[id] % STACK)) % STACK : 0);
    return free > 0 ? [free, m.out] : null;
  }
  const r = m.rec ? registry().recipe(m.rec) : undefined;
  if (r?.inputs.some((i) => i.id === id)) return [Math.max(0, BAG_N - (m.inp[id] ?? 0)), m.inp];
  if (r?.keep?.includes(id)) return [m.inp[id] ? 0 : 1, m.inp];
  if ((def.run === 'fuel' || def.run === 'boiler') && FUELS[id]) return [Math.max(0, BAG_N - (m.fuel[id] ?? 0)), m.fuel];
  return null;
}

/** Pipe distances from one pipe block to every block of its network (BFS, cached per topology). */
function distFrom(net: Net, from: string, w: number): Map<string, number> {
  let d = net.dist.get(from);
  if (d) return d;
  const inNet = new Set(net.keys);
  d = new Map([[from, 0]]);
  for (let q = [from]; q.length;) {
    const nq: string[] = [];
    for (const k of q) for (const nk of around(k, w)) if (inNet.has(nk) && !d.has(nk)) { d.set(nk, d.get(k)! + 1); nq.push(nk); }
    q = nq;
  }
  net.dist.set(from, d);
  return d;
}

function stepItems(s: GameState, net: Net, w: number) {
  const sinks = attached(s, net, canIn);
  if (!sinks.length) return;
  for (const src of attached(s, net, canOut)) {
    let left = net.rate;
    const d = distFrom(net, src.via, w);
    const near = sinks.filter((t) => t.ctl !== src.ctl).sort((a, b) => (d.get(a.via) ?? 1e9) - (d.get(b.via) ?? 1e9));
    each: for (const id of Object.keys(src.m.out)) {
      for (const t of near) {
        if (left <= 0) break each;
        const acc = accepts(t.m, t.def, id), have = src.m.out[id] ?? 0;
        if (!acc || have <= 0) continue;
        const n = Math.min(left, have, acc[0]);
        if (n <= 0) continue;
        acc[1][id] = (acc[1][id] ?? 0) + n; left -= n;
        if (!(src.m.out[id] -= n)) delete src.m.out[id];
      }
    }
  }
}

export function stepPipes(s: GameState, gen: WorldGen) {
  const items = s.tick % ITEM_EVERY === 0;
  for (const net of networks(s.ents, gen.w)) {
    if (!net.item) stepFluid(s, net);
    else if (items) stepItems(s, net, gen.w);
  }
}
