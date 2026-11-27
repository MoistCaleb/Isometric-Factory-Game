// Electricity (DESIGN §6, P4a). Cable blocks join any cable on all 6 sides into a network; electric machines and generators
// touching it link on every side not set Off. Each tick: consumers ask to top up their buffer, every request grows by the
// cable loss to the nearest generator, generators share the total pro rata. Too much current burns the weakest block (a fuse
// first); a cable or machine rated below the network voltage burns / explodes.
import { AMP_IN, BUF_S, FACE, MACHINE, type MachineDef } from '../data/machines';
import { CABLES, STRUCTURES, conduitsJoin, sideOpen } from '../data/structures';
import { TIER_VOLTAGE } from '../data/tiers';
import type { WorldGen } from '../world/gen';
import { controllerAt, newMach, simEvents, type Mach } from './machines';
import { around, sideIndex, topoChanged, topoVersion } from './pipes';
import { TPS, type GameState } from './state';

interface PLink { ctl: string; via: string; face: number }
export interface PNet { keys: string[]; links: PLink[] }
/** Last tick's numbers for a network, by member controller key (machine panel). */
export interface PowerInfo { v: number; w: number; a: number; maxA: number; loss: number; cap: number; cables: number }
export const powerInfo = new Map<string, PowerInfo>();

const SM = new Map(STRUCTURES.map((st) => [st.id, st.machine ?? '']));
const HATCHED = new Set(STRUCTURES.filter((st) => st.multi?.hatches).map((st) => st.id));
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const cache = new WeakMap<object, { v: number; w: number; nets: PNet[] }>();
const defOf = (s: GameState, ctl: string): MachineDef | undefined => MACHINE.get(SM.get(s.ents[ctl]?.s ?? '') ?? '');
const electric = (d?: MachineDef) => d?.run === 'elec' || d?.run === 'gen' || !!d?.elec;

/** Machine input (W) and buffer (J). */
export const inputW = (d: MachineDef) => TIER_VOLTAGE[d.tier] * AMP_IN;
export const bufJ = (d: MachineDef) => inputW(d) * BUF_S;

export function powerNets(ents: GameState['ents'], w: number): PNet[] {
  const c = cache.get(ents);
  if (c && c.v === topoVersion() && c.w === w) return c.nets;
  const seen = new Set<string>(), nets: PNet[] = [];
  for (const [k, e] of Object.entries(ents)) {
    if (!CABLES.has(e.s) || seen.has(k)) continue;
    const keys: string[] = [], links = new Map<string, PLink>(), todo = [k];
    seen.add(k);
    while (todo.length) {
      const cur = todo.pop()!, [x, y, b] = cur.split(',').map(Number);
      keys.push(cur);
      DIRS.forEach(([dx, dy, db], i) => {
        if (b + db < 0) return;
        const nk = `${mod(x + dx, w)},${y + dy},${b + db}`, ne = ents[nk];
        if (!ne || !sideOpen(ents[cur], i)) return;
        if (CABLES.has(ne.s)) { if (conduitsJoin(ents[cur], ne, i) && !seen.has(nk)) { seen.add(nk); todo.push(nk); } return; }
        const [nx, ny, nb] = nk.split(',').map(Number), ctl = controllerAt(ents, w, nx, ny, nb);
        if (!ctl || HATCHED.has(ents[ctl].s) || links.has(`${ctl}|${i ^ 1}`)) return;
        links.set(`${ctl}|${i ^ 1}`, { ctl, via: cur, face: i ^ 1 });
      });
    }
    nets.push({ keys, links: [...links.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, l]) => l) });
  }
  cache.set(ents, { v: topoVersion(), w, nets });
  return nets;
}

/** BFS distances (cable blocks) from a set of start blocks. */
function distFrom(keys: string[], starts: string[], w: number, ents: GameState['ents']): Map<string, number> {
  const inNet = new Set(keys), d = new Map(starts.map((k) => [k, 1]));
  for (let q = [...new Set(starts)]; q.length;) {
    const nq: string[] = [];
    for (const k of q) for (const nk of around(k, w)) if (inNet.has(nk) && !d.has(nk) && conduitsJoin(ents[k], ents[nk], sideIndex(k, nk, w))) { d.set(nk, d.get(k)! + 1); nq.push(nk); }
    q = nq;
  }
  return d;
}

function burn(s: GameState, key: string, msg: string) {
  delete s.ents[key];
  topoChanged();
  simEvents.push({ ok: false, sim: true, msg, ents: { [key]: null } });
}

/** Generator output available this tick (J): turbines throttle down when short of steam. */
function genAvail(m: Mach, d: MachineDef): number {
  const frac = d.steam ? Math.min(1, (m.steam ?? 0) / d.steam) : 1;
  return ((d.gen ?? 0) * frac) / TPS;
}

export function stepPower(s: GameState, gen: WorldGen) {
  powerInfo.clear();
  for (const net of powerNets(s.ents, gen.w)) {
    const gens: { ctl: string; m: Mach; d: MachineDef; via: string }[] = [], users: typeof gens = [], done = new Set<string>();
    for (const l of net.links) {
      const d = defOf(s, l.ctl);
      if (!electric(d)) continue;
      const m = (s.mach[l.ctl] ??= newMach());
      if ((m.faces?.[l.face] ?? FACE.auto) === FACE.off || done.has(l.ctl)) continue;
      done.add(l.ctl);
      (d!.run === 'gen' ? gens : users).push({ ctl: l.ctl, m, d: d!, via: l.via });
    }
    for (const g of gens) g.m.pw = 0;
    for (const u of users) u.m.pw = 0;
    if (!gens.length) continue;
    const v = Math.max(...gens.map((g) => TIER_VOLTAGE[g.d.tier]));
    // Overvoltage: cables melt, machines explode.
    const weak = net.keys.find((k) => CABLES.get(s.ents[k].s)!.v < v);
    if (weak) { burn(s, weak, `🔥 ${STRUCTURES.find((x) => x.id === s.ents[weak].s)?.name} melted — ${v} V is over its rating`); continue; }
    const hot = users.find((u) => TIER_VOLTAGE[u.d.tier] < v);
    if (hot) {
      delete s.ents[hot.ctl]; delete s.mach[hot.ctl]; topoChanged();
      simEvents.push({ ok: false, sim: true, msg: `💥 ${hot.d.name} exploded — ${v} V is over its ${TIER_VOLTAGE[hot.d.tier]} V rating!`, ents: { [hot.ctl]: null } });
      continue;
    }
    const dist = distFrom(net.keys, gens.map((g) => g.via), gen.w, s.ents);
    // Average drop per tile over the network (mixed cables).
    const drop = net.keys.reduce((a, k) => a + CABLES.get(s.ents[k].s)!.drop, 0) / net.keys.length;
    const supply = gens.reduce((a, g) => a + genAvail(g.m, g.d), 0);
    const reqs = users.map((u) => {
      const want = Math.max(0, Math.min(inputW(u.d) / TPS, bufJ(u.d) - (u.m.e ?? 0)));
      return { u, want, cost: want * (1 + (drop * (dist.get(u.via) ?? 1)) / v) };
    });
    const total = reqs.reduce((a, r) => a + r.cost, 0), ratio = total > 0 ? Math.min(1, supply / total) : 0;
    let got = 0;
    for (const r of reqs) { const j = r.want * ratio; r.u.m.e = (r.u.m.e ?? 0) + j; r.u.m.pw = j * TPS; got += j; }
    const used = total * ratio, share = supply > 0 ? used / supply : 0;
    for (const g of gens) {
      const j = genAvail(g.m, g.d) * share;
      g.m.pw = j * TPS;
      if (g.d.steam && g.d.gen) g.m.steam = Math.max(0, (g.m.steam ?? 0) - (j * TPS / g.d.gen) * g.d.steam);
    }
    const a = (used * TPS) / v;
    // Overcurrent: the weakest block burns (fuses before cables, then the lowest rating).
    const rank = (k: string) => { const c = CABLES.get(s.ents[k].s)!; return c.a - (c.fuse ? 0.5 : 0); };
    const weakest = net.keys.reduce((b, k) => (rank(k) < rank(b) ? k : b), net.keys[0]), maxA = CABLES.get(s.ents[weakest].s)!.a;
    const info: PowerInfo = { v, w: got * TPS, a, maxA, loss: (used - got) * TPS, cap: supply * TPS, cables: net.keys.length };
    for (const x of [...gens, ...users]) powerInfo.set(x.ctl, info);
    if (a > maxA + 1e-9) {
      const c = CABLES.get(s.ents[weakest].s)!;
      burn(s, weakest, c.fuse ? `⚡ A fuse blew — ${a.toFixed(1)} A through a ${c.a} A fuse. Place a new one (fewer machines per line, or a thicker cable).`
        : `🔥 ${STRUCTURES.find((x) => x.id === s.ents[weakest].s)?.name} burned out — ${a.toFixed(1)} A over its ${c.a} A rating`);
    }
  }
}
