// Vein discovery (DESIGN §3): surface samples give hints, mining ore exposes a vein, the prospector's hammer surveys.
import { MINERALS } from '../data/minerals';
import { PROSPECT_DEPTH, PROSPECT_R, type WorldGen } from '../world/gen';
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

/** Prospector's hammer: survey every vein reaching within PROSPECT_R tiles, down to PROSPECT_DEPTH. */
export function prospect(s: GameState, gen: WorldGen, xIn: number, y: number): ActResult {
  const x = gen.wrapX(xIn), tool = bestTool(s, 'prospector');
  if (!tool) return { ok: false, msg: "Need a prospector's hammer" };
  const broke = wear(s, tool.i);
  const veins: Record<string, number> = {}, found: string[] = [];
  for (const v of gen.veinsAround(x, y, 1)) {
    if (v.z0 > PROSPECT_DEPTH) continue;
    if (Math.hypot(gen.dx(x, v.x), y - v.y) - Math.max(v.a, v.b) > PROSPECT_R) continue;
    found.push(v.def.name);
    Object.assign(veins, know(s, v.id, KNOW.surveyed));
  }
  const msg = found.length ? `Prospected: ${found.join(', ')}` : `No veins within ${PROSPECT_R} tiles down to layer ${PROSPECT_DEPTH}`;
  return { ok: true, veins, msg: [msg, broke].filter(Boolean).join(' · ') };
}
