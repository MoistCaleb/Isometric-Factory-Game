// Vein discovery (DESIGN §3): surface samples give hints, mining ore exposes a vein, the prospector's hammer surveys.
import { MINERALS } from '../data/minerals';
import { SCAN_DEPTH, SCAN_R } from '../data/machines';
import { HOT_DEPTH, PROSPECT_DEPTH, PROSPECT_R, type WorldGen } from '../world/gen';
import type { ActResult } from './player';
import { bestTool, give, wear } from './player';
import { KNOW, type GameState } from './state';

const MINERAL_NAME = new Map(MINERALS.map((m) => [m.id, m.name]));
export const sampleKey = (x: number, y: number) => `${x},${y},s`;

/** Raise knowledge of a vein; returns the patch if it changed. */
export function know(s: GameState, id: string, level: number): Record<string, number> | undefined {
  if ((s.veins[id] ?? 0) >= level) return undefined;
  s.veins[id] = level;
  return { [id]: level };
}

/** Pick up the loose ore sample on a surface tile, if any. */
export function pickSample(s: GameState, gen: WorldGen, x: number, y: number): ActResult | null {
  const key = sampleKey(x, y);
  if (s.diffs[key] !== undefined) return null;
  const smp = gen.sample(x, y);
  if (!smp) return null;
  if (give(s, `ore:${smp.mineral}`, 1)) return { ok: false, msg: 'Inventory full' };
  s.diffs[key] = 0;
  const veins = know(s, smp.vein.id, KNOW.hint);
  const name = MINERAL_NAME.get(smp.mineral) ?? smp.mineral;
  return {
    ok: true, target: `${name} sample`, changes: { [key]: 0 }, veins, gained: [{ id: `ore:${smp.mineral}`, n: 1 }],
    msg: veins ? `${name} sample — a vein lies nearby (marked on the vein overlay)` : undefined,
  };
}

/** Handheld scanner (P4d, charged: SCAN_R / SCAN_DEPTH, preferred) or prospector's hammer: survey every vein reaching within PROSPECT_R tiles, down to PROSPECT_DEPTH. */
export function prospect(s: GameState, gen: WorldGen, xIn: number, y: number): ActResult {
  const x = gen.wrapX(xIn), sc = bestTool(s, 'scanner'), tool = sc ?? bestTool(s, 'prospector');
  if (!tool) return { ok: false, msg: "Need a prospector's hammer or a charged scanner" };
  const broke = wear(s, tool.i);
  if (sc) s.flags.escan = (s.flags.escan ?? 0) + 1;
  const { veins, msg } = sc ? survey(s, gen, x, y, SCAN_R, SCAN_DEPTH, 'Scanned') : survey(s, gen, x, y, PROSPECT_R, PROSPECT_DEPTH, 'Prospected');
  return { ok: true, veins, msg: [msg, broke].filter(Boolean).join(' · ') };
}

const dir = (dx: number, dy: number) => (Math.hypot(dx, dy) < 1 ? 'here' : `${dy < -Math.abs(dx) / 2 ? 'N' : dy > Math.abs(dx) / 2 ? 'S' : ''}${dx > Math.abs(dy) / 2 ? 'E' : dx < -Math.abs(dy) / 2 ? 'W' : ''}`);

/** Survey every vein whose top is at most `depth` and that reaches within `r` tiles of (x, y). */
export function survey(s: GameState, gen: WorldGen, x: number, y: number, r: number, depth: number, what: string) {
  const veins: Record<string, number> = {}, found: string[] = [];
  for (const v of gen.veinsAround(x, y, Math.ceil((r + 30) / 64))) {
    if (v.z0 > depth) continue;
    if (Math.hypot(gen.dx(x, v.x), y - v.y) - Math.max(v.a, v.b) > r) continue;
    found.push(v.def.name);
    Object.assign(veins, know(s, v.id, KNOW.surveyed));
  }
  // Geothermal hotspots (P5e) lie at HOT_DEPTH: only surveys that reach that deep feel them.
  const hot = depth >= HOT_DEPTH ? gen.hotspotsNear(x, y, r).map((h) => `geothermal hotspot ${Math.round(h.d)} tiles ${dir(gen.dx(h.x, x), h.y - y)}`) : [];
  if (hot.length) s.flags.hotspot = (s.flags.hotspot ?? 0) + 1;
  const msg = [found.length ? `${what}: ${found.join(', ')}` : `No veins within ${r} tiles down to layer ${depth}`, ...hot].join(' · ');
  return { veins, msg };
}
