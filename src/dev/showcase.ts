// Dev only (`?showcase` with `?seed=N`, P5g art pass): a fresh game with every structure placed in rows beside spawn,
// multiblocks complete. The renderer shows every machine as working.
import { multiCells, STRUCTURES } from '../data/structures';
import type { GameState } from '../sim/state';
import { worldGen } from '../world/gen';
import { planet } from '../data/planets';

export function showcase(s: GameState): GameState {
  const gen = worldGen(s.seed, planet(s.planet)), w = gen.w;
  const skip = (id: string) => STRUCTURES.some((st) => st.multi && (st.multi.casing === id || st.multi.parts?.includes(id)));
  const list = STRUCTURES.filter((st) => !skip(st.id) && !/(_pipe|_wire|_cable|^fuse)$/.test(st.id) && st.id !== 'fuse');
  const x0 = s.spawn.x + 2, y0 = s.spawn.y - 8;
  let x = 0, y = 0, rowH = 2;
  for (const st of list) {
    const cells = st.multi ? multiCells(st, 0) : [];
    const xs = cells.map((c) => c.c[0]), ys = cells.map((c) => c.c[1]);
    const lo = Math.min(0, ...xs), hi = Math.max(0, ...xs), back = -Math.min(0, ...ys);
    if (x + hi - lo + 1 > 28) { x = 0; y += rowH; rowH = 2; }
    const cx = x - lo, cy = y + back;
    const put = (dx: number, dy: number, b: number, id: string) => {
      const X = (x0 + cx + dx + w) % w, Y = y0 + cy + dy;
      s.ents[`${X},${Y},${b}`] = { s: id, r: 0 };
    };
    put(0, 0, 0, st.id);
    for (const c of cells) put(c.c[0], c.c[1], c.c[2], c.id);
    x += hi - lo + 2; rowH = Math.max(rowH, back + 2);
  }
  // Farming (P5h): planters at every stage, sticks, a resource crop on its block, planted trees growing.
  y += rowH + 1;
  const crops = ['wheat', 'flax', 'reed', 'berry', 'stonecrop', 'coalcap', 'ironleaf', 'goldenrod'];
  crops.forEach((c, i) => [0, 0.3, 0.6, 1].forEach((g, j) => { s.ents[`${(x0 + i * 2 + w) % w},${y0 + y + j},0`] = { s: 'planter', r: 0, pl: c, g }; }));
  s.ents[`${(x0 + 17 + w) % w},${y0 + y},0`] = { s: 'planter', r: 0, pl: 'sticks' };
  s.ents[`${(x0 + 17 + w) % w},${y0 + y + 1},0`] = { s: 'block_iron', r: 0 };
  s.ents[`${(x0 + 17 + w) % w},${y0 + y + 1},1`] = { s: 'planter', r: 0, pl: 'ironleaf', g: 1 };
  ['broadleaf', 'conifer', 'rubber'].forEach((t, i) => [0, 0.3, 0.6, 1].forEach((g, j) => { s.ents[`${(x0 + 20 + j * 2 + w) % w},${y0 + y + i * 2},0`] = { s: 'tree', r: 0, pl: t, g }; }));
  rowH = 6;
  // Clear trees and lay a foundation under the whole showcase.
  for (let j = -2; j < y + rowH + 2; j++) for (let i = -2; i < 32; i++) {
    const X = (x0 + i + w) % w, Y = y0 + j;
    s.diffs[`${X},${Y},t`] = 0; s.base[`${X},${Y},0,f`] = 1;
  }
  return s;
}
