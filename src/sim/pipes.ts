// Fluid pipes (DESIGN §6–7, P3a). Pipe blocks join same-kind neighbours on all 6 sides into networks holding one fluid.
// Contents live per pipe in s.pipes (saved; the fluid stays set once a network has carried one); each tick a network pools them, attached machines push what they make and
// pull what they use (limited by the pipe rate per link), then the pool is spread back evenly.
import { MACHINE, STEAM_BUF, BOILER_WATER, BOOM_K } from '../data/machines';
import { PIPES, STRUCTURES } from '../data/structures';
import { registry } from '../content/registry';
import type { WorldGen } from '../world/gen';
import { controllerAt, explode, type Mach } from './machines';
import type { GameState } from './state';

export interface Net { keys: string[]; rate: number; cap: number; links: string[] }

/** Bumped whenever structures are placed/removed: networks are rebuilt lazily. */
let topo = 0;
export const topoChanged = () => { topo++; };
const cache = new WeakMap<object, { v: number; w: number; nets: Net[] }>();
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Neighbour block keys (6 sides) of `x,y,b`. */
export function around(key: string, w: number): string[] {
  const [x, y, b] = key.split(',').map(Number);
  return DIRS.filter(([, , db]) => b + db >= 0).map(([dx, dy, db]) => `${mod(x + dx, w)},${y + dy},${b + db}`);
}

export function networks(ents: GameState['ents'], w: number): Net[] {
  const c = cache.get(ents);
  if (c && c.v === topo && c.w === w) return c.nets;
  const seen = new Set<string>(), nets: Net[] = [];
  for (const [k, e] of Object.entries(ents)) {
    const pd = PIPES.get(e.s);
    if (!pd || seen.has(k)) continue;
    const keys: string[] = [], links = new Set<string>(), todo = [k];
    seen.add(k);
    while (todo.length) {
      const cur = todo.pop()!;
      keys.push(cur);
      for (const nk of around(cur, w)) {
        const ne = ents[nk];
        if (!ne) continue;
        if (ne.s === e.s) { if (!seen.has(nk)) { seen.add(nk); todo.push(nk); } continue; }
        if (PIPES.has(ne.s)) continue;
        const [x, y, b] = nk.split(',').map(Number), ctl = controllerAt(ents, w, x, y, b);
        if (ctl) links.add(ctl);
      }
    }
    nets.push({ keys, rate: pd.rate, cap: pd.cap * keys.length, links: [...links].sort() });
  }
  cache.set(ents, { v: topo, w, nets });
  return nets;
}

/** Fluid a machine offers to a network (and the bag holding it). */
function offer(m: Mach, run: string | undefined, rec: string | undefined): { id: string; n: number } | null {
  if (!m.tank || m.tank.n <= 0) return null;
  if (run === 'boiler' || run === 'pump') return m.tank;
  // Liquid byproducts (creosote, tar, molten metal) leave unless the recipe consumes that fluid.
  const r = rec ? registry().recipe(rec) : undefined;
  return r?.fluidsIn?.some((f) => f.id === m.tank!.id) ? null : m.tank;
}

/** Room a machine has for fluid `id` → [current, cap, setter]. */
function want(m: Mach, run: string | undefined, rec: string | undefined, tank: number | undefined, id: string): [number, number, (n: number) => void] | null {
  if (run === 'boiler') return id === 'water' ? [m.water ?? 0, BOILER_WATER, (n) => { m.water = n; }] : null;
  if (run === 'steam' && id === 'steam') return [m.steam ?? 0, STEAM_BUF, (n) => { m.steam = n; }];
  const r = rec ? registry().recipe(rec) : undefined;
  if (!r?.fluidsIn?.some((f) => f.id === id) || (m.tank && m.tank.id !== id)) return null;
  return [m.tank?.n ?? 0, tank ?? 8000, (n) => { m.tank = n > 0 ? { id, n } : undefined; }];
}

export function stepPipes(s: GameState, gen: WorldGen) {
  for (const net of networks(s.ents, gen.w)) {
    let id: string | undefined, n = 0;
    const byId: Record<string, number> = {};
    for (const k of net.keys) { const p = s.pipes[k]; if (p) byId[p.id] = (byId[p.id] ?? 0) + p.n; }
    // A network keeps its fluid even when empty (no steam backflow into a drained water line). Merged networks with
    // different fluids keep the larger one (the rest is lost).
    for (const [f, v] of Object.entries(byId)) if (!id || v > n) { id = f; n = v; }
    for (const ctl of net.links) {
      const m = s.mach[ctl], e = s.ents[ctl];
      if (!m || !e) continue;
      const def = MACHINE.get(structMachine(e.s));
      const o = offer(m, def?.run, m.rec);
      if (o && (!id || id === o.id)) {
        const amt = Math.min(o.n, net.rate, net.cap - n);
        if (amt > 0) { id = o.id; n += amt; o.n -= amt; if (o.n <= 1e-9) m.tank = undefined; }
      }
    }
    if (id) for (const ctl of net.links) {
      const m = s.mach[ctl], e = s.ents[ctl];
      if (!m || !e || n <= 0) continue;
      const def = MACHINE.get(structMachine(e.s));
      const wt = want(m, def?.run, m.rec, def?.tank, id);
      if (!wt) continue;
      const [cur, cap, set] = wt, amt = Math.min(n, net.rate, cap - cur);
      if (amt <= 0) continue;
      if (def?.run === 'boiler' && m.dry) {
        if (m.heat > BOOM_K) { explode(s, ctl); continue; }
        m.dry = false;
      }
      set(cur + amt); n -= amt;
    }
    const per = n / net.keys.length;
    for (const k of net.keys) if (id) s.pipes[k] = { id, n: per > 1e-6 ? per : 0 };
  }
}
const SM = new Map(STRUCTURES.map((st) => [st.id, st.machine ?? '']));
const structMachine = (sid: string) => SM.get(sid) ?? '';
