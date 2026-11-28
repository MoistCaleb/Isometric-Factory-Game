// Electricity (DESIGN §6, P4a). Cable blocks join any cable on all 6 sides into a network; electric machines and generators
// touching it link on every side not set Off. Each tick: consumers ask to top up their buffer, every request grows by the
// cable loss to the nearest generator, generators share the total pro rata. Too much current burns the weakest block (a fuse
// first); a cable or machine rated below the network voltage burns / explodes.
import { AMP_IN, BUF_S, FACE, MACHINE, XFMR_W, battOf, hatchW, xfFront, type MachineDef } from '../data/machines';
import { CABLES, STRUCTURES, conduitsJoin, sideOpen } from '../data/structures';
import { TIER_VOLTAGE } from '../data/tiers';
import type { WorldGen } from '../world/gen';
import { battN, controllerAt, genW, hatchOf, newMach, simEvents, type Mach } from './machines';
import { ignite } from './hazards';
import { around, sideIndex, topoChanged, topoVersion } from './pipes';
import { TPS, type GameState } from './state';

/** `hatch`: the energy hatch block a multiblock takes power through (P4e). */
interface PLink { ctl: string; via: string; face: number; hatch?: string }
export interface PNet { id: string; keys: string[]; links: PLink[] }
/** Last tick's numbers for a network, by member controller key (machine panel). */
export interface PowerInfo { v: number; w: number; a: number; maxA: number; loss: number; cap: number; cables: number }
export const powerInfo = new Map<string, PowerInfo>();
/** Last tick's load per network id (current ÷ weakest block's amps; −1 = no source) for the power overlay (P4c). */
export const netLoad: Record<string, number> = {};

const SM = new Map(STRUCTURES.map((st) => [st.id, st.machine ?? '']));
const HATCH_T = new Map(STRUCTURES.filter((st) => st.hatch === 'energy').map((st) => [st.id, st.tier ?? 'LV']));
const HATCHED = new Set(STRUCTURES.filter((st) => st.multi?.hatches).map((st) => st.id));
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const cache = new WeakMap<object, { v: number; w: number; nets: PNet[] }>();
const defOf = (s: GameState, ctl: string): MachineDef | undefined => MACHINE.get(SM.get(s.ents[ctl]?.s ?? '') ?? '');
const electric = (d?: MachineDef) => d?.run === 'elec' || d?.run === 'gen' || d?.run === 'batt' || d?.run === 'xfmr' || !!d?.elec;

/** Machine input (W) and buffer (J); a multiblock with energy hatches (P4e) takes 2 A at each hatch's tier (P5b). */
export const inputW = (d: MachineDef, m?: Mach) => (d.ehatch ? m?.ehw ?? 0 : TIER_VOLTAGE[d.tier] * AMP_IN);
export const bufJ = (d: MachineDef, m?: Mach) => inputW(d, m) * BUF_S;

/** A live cable block (a tripped / switched-off breaker conducts nothing). */
const live = (e?: { s: string; trip?: number }) => !!e && CABLES.has(e.s) && !e.trip;

/** Find cable networks (uncached; the client uses it for the power overlay). `id` = smallest member key. */
export function findNets(ents: GameState['ents'], w: number): PNet[] {
  const seen = new Set<string>(), nets: PNet[] = [];
  for (const [k, e] of Object.entries(ents)) {
    if (!live(e) || seen.has(k)) continue;
    const keys: string[] = [], links = new Map<string, PLink>(), todo = [k];
    seen.add(k);
    while (todo.length) {
      const cur = todo.pop()!, [x, y, b] = cur.split(',').map(Number);
      keys.push(cur);
      DIRS.forEach(([dx, dy, db], i) => {
        if (b + db < 0) return;
        const nk = `${mod(x + dx, w)},${y + dy},${b + db}`, ne = ents[nk];
        if (!ne || !sideOpen(ents[cur], i)) return;
        if (CABLES.has(ne.s)) { if (live(ne) && conduitsJoin(ents[cur], ne, i) && !seen.has(nk)) { seen.add(nk); todo.push(nk); } return; }
        const [nx, ny, nb] = nk.split(',').map(Number), ctl = controllerAt(ents, w, nx, ny, nb);
        if (!ctl) return;
        if (HATCHED.has(ents[ctl].s)) { // hatch multiblocks: power only through energy hatches, each its own link
          if (hatchOf(ne.s) === 'energy' && !links.has(`${ctl}|${nk}`)) links.set(`${ctl}|${nk}`, { ctl, via: cur, face: i ^ 1, hatch: nk });
          return;
        }
        if (links.has(`${ctl}|${i ^ 1}`)) return;
        links.set(`${ctl}|${i ^ 1}`, { ctl, via: cur, face: i ^ 1 });
      });
    }
    nets.push({ id: keys.reduce((a, b) => (b < a ? b : a)), keys, links: [...links.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, l]) => l) });
  }
  return nets;
}

export function powerNets(ents: GameState['ents'], w: number): PNet[] {
  const c = cache.get(ents);
  if (c && c.v === topoVersion() && c.w === w) return c.nets;
  const nets = findNets(ents, w);
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

function burn(s: GameState, w: number, key: string, msg: string) {
  delete s.ents[key];
  topoChanged();
  simEvents.push({ ok: false, sim: true, msg, ents: { [key]: null } });
  ignite(s, w, key);
}

/** Generators whose first output sets a quest flag (P4d). */
const GEN_FLAGS = new Set(['combustion_generator', 'solar_panel', 'wind_turbine', 'water_turbine', 'steam_turbine_mv', 'combustion_generator_mv', 'geothermal_generator']);

const HV = TIER_VOLTAGE.MV, LV = TIER_VOLTAGE.LV;

interface Node { ctl: string; m: Mach; d: MachineDef; via: string; v: number; g?: number; /** Energy hatch block (P4e). */ hatch?: string }

export function stepPower(s: GameState, gen: WorldGen) {
  powerInfo.clear();
  const reset = new Set<Mach>(), zero = (m: Mach) => { if (!reset.has(m)) { reset.add(m); m.pw = 0; } };
  for (const k of Object.keys(netLoad)) delete netLoad[k];
  for (const net of powerNets(s.ents, gen.w)) {
    // Sort links into roles. A transformer's front face is its high (MV) side; step-up takes in on the low faces.
    const gens: Node[] = [], users: Node[] = [], bats: Node[] = [], xin = new Map<string, Node>(), xout = new Map<string, Node>(), done = new Set<string>();
    for (const l of net.links) {
      const d = defOf(s, l.ctl);
      if (!electric(d)) continue;
      const m = (s.mach[l.ctl] ??= newMach());
      if (!l.hatch && (m.faces?.[l.face] ?? FACE.auto) === FACE.off) continue;
      if (d!.run === 'xfmr') {
        const high = l.face === xfFront(s.ents[l.ctl].r), side = (m.up ? !high : high) ? xin : xout;
        if (!side.has(l.ctl)) side.set(l.ctl, { ctl: l.ctl, m, d: d!, via: l.via, v: high ? HV : LV });
        continue;
      }
      if (l.hatch) { if (!done.has(l.hatch)) { done.add(l.hatch); users.push({ ctl: l.ctl, m, d: d!, via: l.via, v: TIER_VOLTAGE[HATCH_T.get(s.ents[l.hatch].s) ?? 'LV'], hatch: l.hatch }); } continue; }
      if (done.has(l.ctl)) continue;
      done.add(l.ctl);
      const n: Node = { ctl: l.ctl, m, d: d!, via: l.via, v: TIER_VOLTAGE[d!.tier] };
      (d!.run === 'gen' ? gens : d!.run === 'batt' ? bats : users).push(n);
    }
    for (const k of xin.keys()) xout.delete(k); // both sides on one network: no loop
    const ins = [...xin.values()], outs = [...xout.values()], charged = bats.filter((b) => battN(b.m, b.d) > 0);
    for (const x of [...gens, ...users, ...bats, ...outs]) zero(x.m);
    const srcs = [...gens, ...outs, ...charged];
    if (!srcs.length) { netLoad[net.id] = -1; continue; }
    const v = Math.max(...srcs.map((g) => g.v));
    // Overvoltage: cables melt, machines explode (a transformer side is rated for its own voltage).
    const weak = net.keys.find((k) => CABLES.get(s.ents[k].s)!.v < v);
    if (weak) { burn(s, gen.w, weak, `🔥 ${STRUCTURES.find((x) => x.id === s.ents[weak].s)?.name} melted — ${v} V is over its rating`); continue; }
    const hot = [...users, ...gens, ...bats, ...ins].find((u) => u.v < v);
    if (hot) {
      const k = hot.hatch ?? hot.ctl; // an energy hatch blows, not its multiblock
      delete s.ents[k]; if (!hot.hatch) delete s.mach[k]; topoChanged();
      s.flags.overvolt = (s.flags.overvolt ?? 0) + 1;
      simEvents.push({ ok: false, sim: true, msg: `💥 ${hot.hatch ? 'An energy hatch' : hot.d.name} exploded — ${v} V is over its ${hot.v} V rating!`, ents: { [k]: null } });
      ignite(s, gen.w, k);
      continue;
    }
    const dist = distFrom(net.keys, srcs.map((g) => g.via), gen.w, s.ents);
    const drop = net.keys.reduce((a, k) => a + CABLES.get(s.ents[k].s)!.drop, 0) / net.keys.length;
    const lossF = (via: string) => 1 + (drop * (dist.get(via) ?? 1)) / v;
    const xAvail = (x: Node) => Math.min(x.m.e ?? 0, XFMR_W / TPS);
    const bW = (b: Node) => battN(b.m, b.d) * TIER_VOLTAGE[b.d.tier]; // 1 A per battery
    const bAvail = (b: Node) => Math.min(b.m.e ?? 0, bW(b) / TPS);
    for (const g of gens) g.g = genW(s, gen, g.ctl, g.m, g.d) / TPS;
    const G = gens.reduce((a, g) => a + g.g!, 0) + outs.reduce((a, x) => a + xAvail(x), 0);
    const B = charged.reduce((a, b) => a + bAvail(b), 0);
    // An energy hatch draws at most 2 A at its tier from its line, losses included (LV: 64 W, a tin cable), sharing its multiblock's buffer.
    const want = (u: Node) => u.hatch ? Math.max(0, Math.min(hatchW(HATCH_T.get(s.ents[u.hatch].s) ?? 'LV') / TPS / lossF(u.via), (bufJ(u.d, u.m) - (u.m.e ?? 0)) / Math.max(1, u.m.eh ?? 1)))
      : Math.max(0, Math.min(inputW(u.d) / TPS, bufJ(u.d) - (u.m.e ?? 0)));
    const reqs = [...users.map((u) => ({ u, want: want(u) })),
      ...ins.map((u) => ({ u, want: Math.max(0, Math.min(XFMR_W / TPS, XFMR_W * BUF_S - (u.m.e ?? 0))) }))]
      .map((r) => ({ ...r, cost: r.want * lossF(r.u.via) }));
    const D = reqs.reduce((a, r) => a + r.cost, 0);
    // Batteries: charge from surplus generation, discharge to cover a shortfall (never battery → battery).
    const charge = charged.map((b) => { const want = Math.max(0, Math.min(bW(b) / TPS, battN(b.m, b.d) * battOf(b.d).j - (b.m.e ?? 0))); return { b, want, cost: want * lossF(b.via) }; });
    const C = charge.reduce((a, r) => a + r.cost, 0);
    let ratio: number, cr = 0, fromB = 0;
    if (G >= D) { ratio = 1; cr = C > 0 ? Math.min(1, (G - D) / C) : 0; } else { fromB = Math.min(B, D - G); ratio = D > 0 ? (G + fromB) / D : 0; }
    let got = 0;
    for (const r of reqs) {
      const j = r.want * ratio;
      r.u.m.e = (r.u.m.e ?? 0) + j; got += j;
      if (r.u.d.run !== 'xfmr') r.u.m.pw = (r.u.hatch ? r.u.m.pw ?? 0 : 0) + j * TPS;
    }
    for (const r of charge) { const j = r.want * cr; r.b.m.e = (r.b.m.e ?? 0) + j; r.b.m.pw = j * TPS; got += j; }
    if (fromB > 0) {
      for (const b of charged) { const j = bAvail(b) * (fromB / B); b.m.e = Math.max(0, (b.m.e ?? 0) - j); b.m.pw = -j * TPS; }
      s.flags.discharge = (s.flags.discharge ?? 0) + 1;
    }
    const fromG = D * ratio + C * cr - fromB, share = G > 0 ? Math.min(1, fromG / G) : 0;
    for (const g of gens) {
      const j = g.g! * share;
      g.m.pw = j * TPS;
      if (g.d.steam && g.d.gen) g.m.steam = Math.max(0, (g.m.steam ?? 0) - (j * TPS / g.d.gen) * g.d.steam);
      const tk = g.m.tank;
      if (g.d.burns && tk && j > 0) { tk.n -= j / g.d.burns[tk.id]; if (tk.n <= 1e-9) g.m.tank = undefined; }
      if (j > 0 && GEN_FLAGS.has(g.d.id)) s.flags[g.d.id] = (s.flags[g.d.id] ?? 0) + 1;
    }
    for (const x of outs) {
      const j = xAvail(x) * share;
      x.m.e = Math.max(0, (x.m.e ?? 0) - j); x.m.pw = j * TPS;
      if (j > 0 && x.v !== LV) s.flags.xfmr_up = (s.flags.xfmr_up ?? 0) + 1;
      if (j > 0) s.flags.xfmr = (s.flags.xfmr ?? 0) + 1;
    }
    const used = D * ratio + C * cr, a = (used * TPS) / v;
    // Overcurrent: the weakest block goes (fuses / breakers before cables, then the lowest rating).
    const rank = (k: string) => { const c = CABLES.get(s.ents[k].s)!; return c.a - (c.fuse || c.breaker ? 0.5 : 0); };
    const weakest = net.keys.reduce((b, k) => (rank(k) < rank(b) ? k : b), net.keys[0]), maxA = CABLES.get(s.ents[weakest].s)!.a;
    const info: PowerInfo = { v, w: got * TPS, a, maxA, loss: (used - got) * TPS, cap: (G + B) * TPS, cables: net.keys.length };
    for (const x of [...gens, ...users, ...bats, ...ins, ...outs]) powerInfo.set(x.ctl, info);
    netLoad[net.id] = Math.round((a / maxA) * 100) / 100;
    if (a > maxA + 1e-9) {
      const c = CABLES.get(s.ents[weakest].s)!;
      if (c.breaker) {
        const n = { ...s.ents[weakest], trip: 1 };
        s.ents[weakest] = n; topoChanged();
        s.flags.trip = (s.flags.trip ?? 0) + 1;
        simEvents.push({ ok: false, sim: true, msg: `⚡ A breaker tripped — ${a.toFixed(1)} A through ${c.a} A. Reset it in its panel once the load is lighter.`, ents: { [weakest]: n } });
      } else burn(s, gen.w, weakest, c.fuse ? `⚡ A fuse blew — ${a.toFixed(1)} A through a ${c.a} A fuse. Place a new one (fewer machines per line, or a thicker cable).`
        : `🔥 ${STRUCTURES.find((x) => x.id === s.ents[weakest].s)?.name} burned out — ${a.toFixed(1)} A over its ${c.a} A rating`);
    }
  }
}
