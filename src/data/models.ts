// Art v2 (P5g, DESIGN §5): voxel models in 16ths built from shared kits per tier. y = up, z = toward the front (south at
// rotation 0); the hull front face is z = 15. Boxes tagged FX.hot glow while working, FX.spin / FX.spinZ turn.
// `puff` points may lie outside the tile (multiblocks: relative to the controller tile).
import type { Box } from './structures';

const HOT = 1, SPIN = 2, SPINZ = 3;
export const PAL = {
  WOOD: 0x9a7040, WOOD_L: 0xb08450, DARK: 0x5a4026, CLAY: 0xa86a48, CLAY_L: 0xc08060, BRICK: 0x9a4a32, BRICK_D: 0x7a3826, MORTAR: 0xb8a890,
  STONE: 0x8a8a88, STONE_L: 0xa4a4a0, STONE_D: 0x6a6a68, DIRT: 0x6a4a2e, GRASS: 0x5a8a3a, STRAW: 0xd8c060, SOOT: 0x2a2420,
  GLOW: 0xff8a30, FLAME: 0xffc040, MOLTEN: 0xffa040, FIRE: 0xc9b48a, FIRE_D: 0xa8946a,
  BRONZE: 0xc08a40, BRONZE_D: 0x8a5a20, BRONZE_L: 0xd8a860, BRASS: 0xd8b048,
  STEEL: 0x707478, STEEL_D: 0x50545a, STEEL_L: 0x9a9ea4, IRON: 0x3a3a3e,
  LVC: 0x8a8e94, LV_D: 0x5a5e64, LV_S: 0x6a7078, MVC: 0xb0c4d8, MV_S: 0x5a88c8,
  VOLT: 0xf0d040, CABLE: 0x3a3a40, COPPER: 0xd87a3c, COPPER_D: 0xa85a2c, TIN: 0xc8ccd0, LEAD: 0x5c5a78,
  GLASS: 0xb8d8e0, WATER: 0x3070d0, SCREEN: 0x2a3a3a, LCD: 0x40c0a0, RED: 0xd03030, GREEN: 0x40c060, WHITE: 0xe0e0e0,
  HEAT: 0x8a6a50, CUNI: 0xc49a6c, KANTHAL: 0xb8a888, CARBON: 0x3a3a40, ALU: 0xb0c4d8, LIME: 0xd8d4c8,
};
const P = PAL;
type Puff = [number, number, number, 0 | 1];

// ---- kit pieces ----
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, fx?: number): Box => (fx ? [x0, y0, z0, x1, y1, z1, c, fx] : [x0, y0, z0, x1, y1, z1, c]);
/** Four vertical posts at the corners of [x0,x1]×[z0,z1], w wide. */
const posts = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, w: number, c: number): Box[] =>
  [[x0, z0], [x1 - w, z0], [x0, z1 - w], [x1 - w, z1 - w]].map(([x, z]) => bx(x, y0, z, x + w, y1, z + w, c));
/** Horizontal slats on the front face (vent grille). */
const vent = (x0: number, y0: number, x1: number, n: number, c: number, z = 15): Box[] =>
  [...Array(n)].map((_, i) => bx(x0, y0 + i * 1.5, z, x1, y0 + i * 1.5 + 0.8, z + 0.5, c));
/** Round-ish gauge on the front face: dial + needle. */
const gauge = (x: number, y: number, z = 15): Box[] => [bx(x, y, z, x + 2.5, y + 2.5, z + 0.5, P.WHITE), bx(x + 1, y + 1, z + 0.5, x + 2, y + 2.2, z + 0.7, P.RED)];
/** Fire door: soot frame + glowing mouth (hot). */
const fireDoor = (x0: number, y0: number, x1: number, y1: number, z = 15): Box[] =>
  [bx(x0 - 1, y0 - 1, z, x1 + 1, y1 + 1, z + 0.5, P.SOOT), bx(x0, y0, z + 0.3, x1, y1, z + 0.7, P.GLOW, HOT)];
/** Small rivets on a face row. */
const rivets = (xs: number[], y: number, c: number, z = 15): Box[] => xs.map((x) => bx(x, y, z, x + 0.8, y + 0.8, z + 0.4, c));
/** Power socket on the back face. */
const socket = (y = 3): Box[] => [bx(5, y, 0.5, 11, y + 5, 1, P.CABLE), bx(6, y + 1, 0, 10, y + 4, 0.5, P.VOLT)];
/** Screen on the front face. */
const screen = (x0: number, y0: number, x1: number, y1: number, c = P.LCD): Box[] => [bx(x0, y0, 15, x1, y1, 15.4, P.SCREEN), bx(x0 + 0.7, y0 + 0.7, 15.4, x1 - 0.7, y1 - 0.7, 15.5, c, HOT)];

/** Bronze steam hull (P3): riveted plinth, body, dark corner posts, trim; steam inlet nub on the back. */
function bronze(h = 12): Box[] {
  return [bx(0.5, 0, 0.5, 15.5, 2, 15.5, P.BRONZE_D), bx(1, 2, 1, 15, h, 15, P.BRONZE), ...posts(1, 1, 15, 15, 2, h, 2, P.BRONZE_D),
    bx(0.5, h, 0.5, 15.5, h + 1, 15.5, P.BRONZE_D), ...rivets([2, 5, 10.2, 13.2], 1, P.BRASS, 15.5), bx(6, 4, 0, 10, 8, 1, P.BRONZE_D)];
}
/** LV electric hull: grey body, dark base band and cap, light corner trim, tier stripe on the front, socket on the back. */
function lv(h = 11): Box[] {
  return [bx(1, 0, 1, 15, 1, 15, P.LV_D), bx(1, 1, 1, 15, h, 15, P.LVC), ...posts(1, 1, 15, 15, 1, h, 1, P.STEEL_L),
    bx(1, h, 1, 15, h + 1, 15, P.LV_D), bx(2, h - 2, 15, 14, h - 1, 15.3, P.LV_S), ...socket()];
}
const topDome = (y: number, c: number, r = 4): Box[] => [bx(8 - r, y, 8 - r, 8 + r, y + 2, 8 + r, c), bx(8 - r + 1, y + 2, 8 - r + 1, 8 + r - 1, y + 3, 8 + r - 1, c)];
const exhaust = (x: number, z: number, y0: number, y1: number, c = P.SOOT): Box[] => [bx(x, y0, z, x + 2, y1, z + 2, c), bx(x - 0.5, y1 - 1, z - 0.5, x + 2.5, y1, z + 2.5, P.IRON)];

export interface Art { model: Box[]; puff?: Puff[] }

/** Models by structure id. MV variants are tinted from the LV ones (`tierTint`). */
export function art(): Record<string, Art> {
  const A: Record<string, Art> = {
    // ---- storage ----
    chest: { model: [bx(1, 0, 2, 15, 8, 14, P.WOOD), bx(1, 8, 2, 15, 11, 14, P.WOOD_L), bx(1, 0, 2, 2, 11, 14, P.DARK), bx(14, 0, 2, 15, 11, 14, P.DARK),
      bx(1, 7.5, 1.8, 15, 8.5, 14.2, P.DARK), bx(7, 6, 14, 9, 9, 14.6, P.IRON)] },
    barrel: { model: [bx(3, 0, 3, 13, 14, 13, P.WOOD), bx(2, 3, 2, 14, 11, 14, P.WOOD), bx(1.8, 2.5, 1.8, 14.2, 3.5, 14.2, P.IRON), bx(1.8, 10.5, 1.8, 14.2, 11.5, 14.2, P.IRON),
      bx(4, 14, 4, 12, 14.5, 12, P.DARK), bx(7, 4, 14, 9, 6, 15.5, P.BRASS)] },
    // ---- primitive ----
    pit_kiln: { model: [bx(0, 0, 0, 16, 1.5, 16, P.DIRT), bx(1, 1.5, 1, 15, 3, 15, P.CLAY), bx(2, 3, 2, 14, 5, 14, P.STRAW), bx(4, 5, 4, 12, 7.5, 12, P.STRAW),
      bx(6, 7.5, 6, 10, 9, 10, P.DARK), bx(3, 1.5, 14.9, 13, 2.8, 15.2, P.GLOW, HOT), bx(0.9, 1.5, 3, 1.1, 2.8, 13, P.GLOW, HOT)], puff: [[8, 9, 8, 0]] },
    clay_furnace: { model: [bx(1, 0, 1, 15, 3, 15, P.BRICK), bx(2, 3, 2, 14, 10, 14, P.CLAY), bx(3, 10, 3, 13, 12, 13, P.CLAY_L), bx(6, 12, 6, 10, 16, 10, P.BRICK),
      ...fireDoor(5, 2, 11, 7, 14)], puff: [[8, 16, 8, 0]] },
    quern: { model: [bx(1, 0, 1, 15, 3, 15, P.WOOD), bx(2, 3, 2, 14, 6, 14, P.STONE_D), bx(3, 6, 3, 13, 9, 13, P.STONE_L, SPIN), bx(7, 9, 7, 9, 10, 9, P.DARK),
      bx(11, 9, 7, 12, 14, 8, P.WOOD), bx(0, 3, 6, 2, 5, 10, P.STONE_D)] },
    sluice: { model: [bx(0, 0, 4, 4, 6, 12, P.WOOD), bx(4, 0, 4, 8, 4.5, 12, P.WOOD), bx(8, 0, 4, 12, 3, 12, P.WOOD), bx(12, 0, 4, 16, 1.5, 12, P.WOOD),
      bx(0, 6, 4, 4, 7, 5, P.DARK), bx(0, 6, 11, 4, 7, 12, P.DARK), bx(1, 6, 5, 4, 6.3, 11, P.WATER), bx(4, 4.5, 5, 8, 4.8, 11, P.WATER), bx(8, 3, 5, 12, 3.3, 11, P.WATER),
      bx(12, 1.5, 5, 16, 1.8, 11, P.WATER), ...[5, 9, 13].map((x) => bx(x, 1, 4.5, x + 0.8, 5, 11.5, P.BRONZE))] },
    crucible: { model: [bx(1, 0, 1, 15, 4, 15, P.BRICK), bx(1, 4, 1, 15, 4.5, 15, P.MORTAR), ...fireDoor(5, 0.8, 11, 3.2, 15), bx(4, 4.5, 4, 12, 11, 12, 0xb0a8b8),
      bx(3.5, 10, 3.5, 12.5, 11, 12.5, 0x9890a0), bx(5, 10.5, 5, 11, 11.2, 11, P.MOLTEN, HOT)], puff: [[8, 12, 8, 0]] },
    lime_kiln: { model: [bx(1, 0, 1, 15, 6, 15, P.BRICK), bx(2, 6, 2, 14, 11, 14, P.BRICK), bx(3.5, 11, 3.5, 12.5, 15, 12.5, P.BRICK_D), bx(1, 5.5, 1, 15, 6.5, 15, P.MORTAR),
      ...fireDoor(5, 1.5, 11, 5, 15), bx(5, 15, 5, 11, 16, 11, P.LIME)], puff: [[8, 16, 8, 0]] },
    stone_anvil: { model: [bx(3, 0, 4, 13, 3, 12, P.STONE_D), bx(5, 3, 6, 11, 8, 10, P.STONE), bx(2, 8, 5, 14, 11, 11, P.STONE_L), bx(0.5, 9, 6.5, 2, 10.5, 9.5, P.STONE_L)] },
    // Primitive multiblocks: controllers + casings.
    charcoal_pit: { model: [bx(0, 0, 0, 16, 16, 16, P.DIRT), bx(0, 15, 0, 16, 16, 16, 0x7a5a3a), bx(5, 2, 15, 11, 7, 16.2, P.SOOT), bx(6, 3, 15.8, 10, 6, 16.4, P.GLOW, HOT)],
      puff: [[8, 32, 8, 0], [-6, 18, 3, 0]] },
    soil_cover: { model: [bx(0, 0, 0, 16, 16, 16, P.DIRT), bx(0, 15, 0, 16, 16, 16, P.GRASS), bx(3, 16, 4, 4, 17.5, 5, P.GRASS), bx(11, 16, 9, 12, 17, 10, P.GRASS), bx(2, 6, 0, 6, 8, 0.3, 0x5a3e26)] },
    bloomery: { model: [bx(1, 0, 1, 15, 16, 15, P.CLAY), bx(1, 0, 1, 15, 2, 15, P.BRICK), ...fireDoor(5.5, 3, 10.5, 7, 15), bx(12, 2, 14, 16, 5, 16.5, P.WOOD), bx(13, 5, 15, 15, 6, 16, P.DARK)],
      puff: [[8, 48, 8, 0]] },
    clay_wall: { model: [bx(2, 0, 2, 14, 16, 14, P.CLAY), bx(1.5, 7, 1.5, 14.5, 8.5, 14.5, P.BRICK), bx(3, 14, 3, 13, 16, 13, P.CLAY_L)] },
    coke_oven: { model: [bx(0, 0, 0, 16, 16, 16, P.FIRE), ...bricks(P.FIRE_D), bx(4, 2, 15.5, 12, 11, 16.2, P.SOOT), bx(5, 3, 16, 11, 10, 16.5, P.GLOW, HOT)], puff: [[16, 32, 0, 0]] },
    primitive_blast_furnace: { model: [bx(0, 0, 0, 16, 16, 16, P.FIRE), ...bricks(P.FIRE_D), ...fireDoor(5, 2, 11, 8, 15.5), bx(2, 12, 15.5, 14, 13, 16.2, P.STEEL_D)],
      puff: [[16, 48, 0, 0], [12, 49, -4, 0]] },
    fire_brick_wall: { model: [bx(0, 0, 0, 16, 16, 16, P.FIRE), ...bricks(P.FIRE_D)] },
    // ---- steam ----
    water_pump: { model: [bx(1, 0, 1, 15, 3, 15, P.WOOD), bx(1, 0, 1, 15, 0.8, 15, P.DARK), bx(4, 3, 4, 12, 11, 12, P.BRONZE), bx(3.5, 6, 3.5, 12.5, 7, 12.5, P.BRONZE_D),
      bx(6, 11, 6, 10, 14, 10, P.BRONZE_D), bx(5, 14, 5, 11, 15, 11, P.BRONZE_L, SPIN), bx(0, 4, 6, 4, 8, 10, P.BRONZE_D), bx(0, 4.5, 6.5, 0.5, 7.5, 9.5, P.WATER)] },
    small_boiler: { model: [bx(1, 0, 1, 15, 5, 15, P.BRICK), bx(1, 4.5, 1, 15, 5, 15, P.MORTAR), ...fireDoor(5, 1, 11, 4, 15), bx(2, 5, 2, 14, 14, 14, P.BRONZE),
      bx(1.5, 7, 1.5, 14.5, 8, 14.5, P.BRONZE_D), bx(1.5, 12, 1.5, 14.5, 13, 14.5, P.BRONZE_D), ...gauge(10, 9, 14), bx(3, 14, 3, 13, 15, 13, P.BRONZE_D),
      bx(6.5, 15, 6.5, 9.5, 17, 9.5, P.BRONZE_D)], puff: [[8, 17, 8, 1]] },
    steam_furnace: { model: [...bronze(13), ...fireDoor(4.5, 3.5, 11.5, 8.5), ...gauge(11.5, 10), ...exhaust(10, 4, 14, 17)], puff: [[11, 17, 5, 0]] },
    steam_macerator: { model: [...bronze(10), bx(3, 11, 3, 13, 13, 13, P.STEEL_D), bx(4, 13, 4, 12, 15, 12, P.STEEL, SPIN), bx(5, 15, 5, 11, 16, 11, P.SOOT),
      bx(4, 3, 15, 12, 8, 15.5, P.BRONZE_D), ...vent(5, 4, 11, 3, P.SOOT, 15.5), ...gauge(12, 9.5)], puff: [[3, 12, 13, 1]] },
    steam_forge_hammer: { model: [...bronze(6), bx(4, 7, 4, 12, 9, 12, P.STONE), bx(2, 7, 2, 4, 16, 4, P.BRONZE_D), bx(12, 7, 2, 14, 16, 4, P.BRONZE_D),
      bx(2, 15, 2, 14, 17, 5, P.BRONZE), bx(6.5, 11, 2.5, 9.5, 15, 13, P.STEEL), bx(5, 11, 9, 11, 13, 13, P.STEEL_D)], puff: [[8, 17, 3, 1]] },
    steam_ore_washer: { model: [...bronze(9), bx(2, 10, 2, 14, 13, 14, P.BRONZE_D), bx(3, 12, 3, 13, 12.6, 13, P.WATER), bx(4, 10.5, 7, 12, 14.5, 9, P.BRONZE_L, SPINZ),
      bx(7, 10, 1, 9, 16, 3, P.BRONZE_D)], puff: [[8, 16, 2, 1]] },
    steam_alloy_smelter: { model: [bx(1, 0, 1, 15, 12, 15, P.BRICK), ...bricks(P.BRICK_D, 12), bx(2.5, 1.5, 15, 13.5, 9, 15.5, P.BRONZE), ...fireDoor(5, 3, 11, 7.5, 15.5),
      bx(3, 12, 3, 13, 14, 13, P.BRONZE), bx(5, 14, 5, 11, 15, 11, 0xb0a8b8), bx(6, 14.5, 6, 10, 15.2, 10, P.MOLTEN, HOT)], puff: [[8, 15, 8, 0]] },
    steam_compressor: { model: [...bronze(8), bx(3, 9, 3, 13, 11, 13, P.STEEL_D), bx(3.5, 11, 6, 5.5, 16, 10, P.BRONZE_D), bx(10.5, 11, 6, 12.5, 16, 10, P.BRONZE_D),
      bx(3, 14.5, 5.5, 13, 16.5, 10.5, P.BRONZE), bx(6, 11, 6.5, 10, 13, 9.5, P.STEEL_L), ...gauge(11, 4)], puff: [[8, 17, 8, 1]] },
    steam_extractor: { model: [...bronze(9), bx(4, 10, 4, 12, 15, 12, P.GLASS), bx(5, 10, 5, 11, 12, 11, 0xd09030), bx(3.5, 15, 3.5, 12.5, 16, 12.5, P.BRONZE_D),
      bx(4, 3, 15, 12, 7, 15.5, 0xd09030), ...gauge(12, 4)], puff: [[8, 16, 8, 1]] },
    steam_pump: { model: [...bronze(9), bx(5, 10, 5, 11, 14, 11, P.BRONZE_D), bx(4, 14, 4, 12, 15, 12, P.BRONZE_L, SPIN), bx(0, 3, 6, 2, 8, 10, P.WATER), bx(14, 3, 6, 16, 8, 10, P.BRONZE_D),
      ...gauge(6.5, 4.5)], puff: [[8, 15, 8, 1]] },
    steam_thumper: { model: [bx(0, 0, 0, 16, 2, 16, P.STEEL_D), bx(3, 2, 3, 13, 8, 13, P.BRONZE), ...posts(1, 1, 15, 15, 2, 16, 2, P.BRONZE_D), bx(1, 15, 1, 15, 16, 15, P.BRONZE_D),
      bx(6, 8, 6, 10, 15, 10, P.STEEL), bx(4.5, 11, 4.5, 11.5, 13, 11.5, P.STEEL_D)], puff: [[8, 16.5, 8, 1]] },
    steam_excavator: { model: [bx(0, 0, 0, 3, 3, 16, P.STEEL_D), bx(13, 0, 0, 16, 3, 16, P.STEEL_D), bx(1, 3, 1, 15, 12, 15, P.BRONZE), ...posts(1, 1, 15, 15, 3, 12, 2, P.BRONZE_D),
      bx(6, 0, 6, 10, 3, 10, P.STEEL, SPIN), bx(5, 12, 5, 11, 16, 11, P.BRONZE_D), ...gauge(11.5, 7)], puff: [[8, 16, 8, 1]] },
    hp_boiler: { model: [bx(1, 0, 1, 15, 5, 15, P.FIRE), ...fireDoor(5, 1, 11, 4, 15), bx(2, 5, 2, 14, 15, 14, P.STEEL), bx(1.5, 8, 1.5, 14.5, 9, 14.5, P.SOOT),
      bx(1.5, 12, 1.5, 14.5, 13, 14.5, P.SOOT), ...gauge(10, 9.5, 14), bx(6, 15, 6, 10, 17, 10, P.BRONZE)], puff: [[8, 17, 8, 1]] },
    solar_boiler: { model: [bx(2, 0, 2, 14, 8, 14, P.BRONZE), ...posts(2, 2, 14, 14, 0, 8, 1.5, P.BRONZE_D), bx(0.5, 8, 0.5, 15.5, 9.5, 15.5, 0xd8dce0),
      ...[1, 5, 9, 13].map((x) => bx(x, 9.5, 1, x + 2.5, 10.5, 15, 0x9ac8e8)), bx(6, 3, 14, 10, 7, 14.5, P.BRONZE_D)], puff: [[14, 10, 8, 1]] },
    large_boiler: { model: [bx(0, 0, 0, 16, 16, 16, P.STEEL), bx(0, 0, 0, 16, 2, 16, P.STEEL_D), ...fireDoor(3, 3, 13, 9, 15.5), bx(2, 12, 15.5, 14, 14, 16.2, P.BRONZE), ...gauge(12.5, 10, 15.5)],
      puff: [[16, 48, -8, 1], [10, 48, -16, 1]] },
    bronze_casing: { model: [bx(0, 0, 0, 16, 16, 16, P.BRICK), ...bricks(P.BRICK_D), bx(0, 0, 0, 16, 2.5, 16, P.BRONZE), bx(0, 13.5, 0, 16, 16, 16, P.BRONZE),
      ...posts(0, 0, 16, 16, 2.5, 13.5, 2, P.BRONZE)] },
    steel_firebox: { model: [bx(0, 0, 0, 16, 16, 16, P.STEEL), ...[4, 10].map((y) => bx(0, y, 0, 16, y + 2, 16, P.SOOT)), ...posts(0, 0, 16, 16, 0, 16, 1.5, P.STEEL_D)] },
    bronze_pipe_casing: { model: [bx(0, 0, 0, 16, 16, 16, P.BRONZE_D), ...[2, 7, 12].map((x) => bx(x, 0, 2, x + 2, 16, 14, P.BRONZE)), bx(0, 7, 0, 16, 9, 16, P.BRONZE_L)] },
    input_hatch: { model: hatch(P.BRONZE, P.WATER) }, output_hatch: { model: hatch(P.BRONZE, 0xe07020) }, input_bus: { model: hatch(P.BRONZE, P.WOOD) },
    // ---- LV ----
    steam_turbine: { model: [...lv(10), bx(0, 3, 4, 16, 9, 12, P.STEEL), bx(-0.5, 4, 5, 0.5, 8, 11, P.BRONZE), bx(15.5, 4, 5, 16.5, 8, 11, P.BRONZE),
      bx(3, 11, 3, 13, 13, 13, P.BRONZE_D), bx(4, 13, 4, 12, 15, 12, P.STEEL_L, SPIN), ...vent(4, 3, 12, 3, P.LV_D)], puff: [[8, 16, 8, 1]] },
    macerator: { model: [...lv(), bx(3, 12, 3, 13, 14, 13, P.STEEL_D), bx(4, 14, 4, 12, 16, 12, P.STEEL, SPIN), bx(6, 16, 6, 10, 16.5, 10, P.SOOT), ...vent(4, 3, 12, 3, P.LV_D), ...screen(4, 7.5, 8, 9.5)] },
    electric_furnace: { model: [...lv(), bx(4, 3, 15, 12, 9, 15.3, P.SOOT), bx(5, 4, 15.2, 11, 8, 15.6, P.GLOW, HOT), bx(3, 12, 3, 13, 13, 13, P.COPPER), ...exhaust(11, 3, 12, 15, P.LV_D)] },
    bender: { model: [...lv(), bx(3, 12, 4, 5.5, 16, 12, P.STEEL), bx(10.5, 12, 4, 13, 16, 12, P.STEEL), bx(5.5, 12, 6, 10.5, 13, 10, P.LV_D), bx(5.5, 14, 7, 10.5, 15, 9, P.STEEL_L),
      ...screen(5, 4, 11, 7)] },
    wiremill: { model: [...lv(), bx(3, 12, 3, 13, 13.5, 13, P.STEEL), ...[4.5, 11.5].map((x) => bx(x - 1.5, 13.5, 6, x + 1.5, 16, 10, P.COPPER_D, SPINZ)), bx(4, 14.5, 7.5, 12, 15, 8.5, P.COPPER),
      bx(7, 4, 15, 9, 8, 15.5, P.COPPER)] },
    lathe: { model: [...lv(), bx(2, 12, 6, 14, 13.5, 10, P.STEEL), bx(2, 13.5, 6.5, 5, 16, 9.5, P.LV_D), bx(11, 13.5, 6.5, 14, 16, 9.5, P.LV_D), bx(5, 14, 7, 11, 15.5, 9, P.STEEL_L, SPINZ),
      ...screen(4, 4, 9, 7)] },
    cutter: { model: [...lv(), bx(2, 12, 4, 14, 13, 12, 0x303030), bx(3, 13, 7.5, 13, 13.4, 8.5, P.LV_D), bx(4, 13, 2, 12, 17, 3, P.STEEL_D), bx(5, 13.5, 3, 11, 16.5, 13, P.STEEL_L, SPINZ),
      ...screen(4, 4, 9, 7)] },
    assembler: { model: [...lv(), bx(2, 12, 2, 14, 12.5, 14, 0x303030), bx(3, 12.5, 3, 5, 16, 5, 0xa08a50), bx(3, 15, 3, 9, 16, 5, 0xa08a50), bx(11, 12.5, 11, 13, 16, 13, 0xa08a50),
      bx(7, 15, 11, 13, 16, 13, 0xa08a50), bx(6, 12.5, 6, 10, 13.5, 10, 0x2a6a3a), ...screen(4, 4, 12, 8)] },
    ore_washer: { model: [...lv(), bx(3, 12, 3, 13, 15, 13, P.GLASS), bx(4, 12, 4, 12, 14, 12, P.WATER), bx(5, 12.5, 7, 11, 13.5, 9, P.STEEL_L, SPIN), ...vent(4, 3, 12, 3, P.LV_D)] },
    centrifuge: { model: [...lv(), bx(3.5, 12, 3.5, 12.5, 14, 12.5, P.STEEL_D), bx(4, 14, 4, 12, 15.5, 12, P.STEEL, SPIN), bx(7, 15.5, 7, 9, 16.5, 9, P.LV_D), ...screen(5, 4, 11, 7)] },
    thermal_centrifuge: { model: [...lv(), bx(3.5, 12, 3.5, 12.5, 14, 12.5, P.CUNI, HOT), bx(4, 14, 4, 12, 15.5, 12, P.STEEL, SPIN), bx(7, 15.5, 7, 9, 16.5, 9, P.LV_D),
      bx(4, 3, 15, 12, 8, 15.3, P.SOOT), bx(5, 4, 15.2, 11, 7, 15.6, P.GLOW, HOT)] },
    fluid_extractor: { model: [...lv(), bx(4, 12, 4, 12, 16, 12, P.GLASS), bx(5, 12, 5, 11, 14, 11, 0xe07020), bx(3.5, 15.5, 3.5, 12.5, 16.5, 12.5, P.LV_D), bx(6.5, 4, 15, 9.5, 8, 15.5, 0xe07020)] },
    fluid_solidifier: { model: [...lv(), bx(4, 12, 4, 12, 14, 12, P.GLASS), bx(5, 12, 5, 11, 13, 11, 0xe07020), bx(3, 14, 3, 13, 16, 13, P.STEEL), bx(5, 4, 15, 11, 7, 15.5, P.STEEL_D)] },
    polarizer: { model: [...lv(), ...[3, 11].map((x) => bx(x, 12, 5, x + 2, 16, 11, P.COPPER)), bx(5, 12, 7, 11, 14, 9, P.LV_D), bx(7, 14, 7.5, 9, 16, 8.5, 0x40a0ff, HOT)] },
    mixer: { model: [...lv(), bx(4, 12, 4, 12, 16, 12, P.GLASS), bx(5, 12, 5, 11, 13.5, 11, 0x9ab0c0), bx(5, 13, 7, 11, 14, 9, P.STEEL, SPIN), bx(7.5, 14, 7.5, 8.5, 17, 8.5, P.STEEL),
      bx(6, 16.5, 6, 10, 17.5, 10, P.LV_D)] },
    electrolyzer: { model: [...lv(), bx(3, 12, 3, 13, 15, 13, P.GLASS), bx(4, 12, 4, 12, 14, 12, 0x9ab0c0), bx(5, 12, 7, 6, 16, 9, 0xd8dce4), bx(10, 12, 7, 11, 16, 9, P.COPPER),
      bx(5, 16, 7, 11, 16.5, 9, P.RED), ...screen(5, 4, 11, 7)] },
    chemical_reactor: { model: [...lv(), bx(3.5, 12, 3.5, 12.5, 15, 12.5, 0x6a8a6a), ...topDome(15, 0x6a8a6a, 3.5), bx(5, 12, 12.4, 11, 14.5, 12.7, P.GLASS),
      bx(7.5, 17, 7.5, 8.5, 19, 8.5, P.STEEL), ...screen(4, 4, 12, 8, 0xa0e060)] },
    chemical_bath: { model: [...lv(), bx(2, 12, 2, 14, 14.5, 14, P.STEEL), bx(3, 13.5, 3, 13, 14.2, 13, 0xd0a030), ...[4, 11].map((x) => bx(x, 14, 7, x + 1, 17, 8, P.STEEL_D)),
      bx(4, 16, 7, 12, 17, 8, P.STEEL_D)] },
    roaster: { model: [...lv(), bx(3, 12, 3, 13, 14, 13, P.FIRE), bx(6, 14, 6, 10, 17, 10, P.BRICK), bx(5, 4, 15, 11, 7, 15.3, P.SOOT), bx(5.5, 4.5, 15.2, 10.5, 6.5, 15.6, P.GLOW, HOT)],
      puff: [[8, 17, 8, 0]] },
    canner: { model: [...lv(), bx(2, 12, 7, 14, 12.5, 9, 0x303030), bx(3, 12.5, 4, 6, 15, 7, P.TIN), bx(10, 12.5, 9, 13, 15, 12, P.TIN), bx(7, 12.5, 2, 9, 16, 4, P.LV_D), bx(7, 15, 4, 9, 16, 8, P.LV_D)] },
    electric_pump: { model: [...lv(), bx(5, 12, 5, 11, 15, 11, 0x5070a0), bx(4.5, 15, 4.5, 11.5, 16, 11.5, P.STEEL, SPIN), bx(0, 3, 6, 1, 8, 10, P.WATER)] },
    battery_buffer: { model: [...lv(), ...[[3, 3], [9, 3], [3, 9], [9, 9]].flatMap(([x, z]) => [bx(x, 12, z, x + 4, 15, z + 4, P.LEAD), bx(x + 1.5, 15, z + 1.5, x + 2.5, 15.6, z + 2.5, P.VOLT)])] },
    transformer: { model: [...lv(), ...[3.5, 9.5].map((x) => bx(x, 12, 4, x + 3, 15.5, 12, P.COPPER)), bx(3, 12, 7, 13, 16, 9, P.STEEL_D), bx(5, 3, 15, 11, 9, 15.4, P.RED)] },
    combustion_generator: { model: [...lv(10), bx(3, 11, 3, 13, 12.5, 13, P.SOOT), ...exhaust(11, 4, 12, 17), ...exhaust(3, 10, 12, 15), ...fireDoor(5, 3.5, 11, 7.5)],
      puff: [[12, 17, 5, 0], [4, 15, 11, 0]] },
    solar_panel: { model: [bx(2, 0, 2, 14, 3, 14, P.STEEL), bx(0, 3, 0, 16, 4, 16, 0x7a2e2a), bx(0.5, 4, 0.5, 15.5, 5, 15.5, 0x9ab8c8), ...[5.2, 10.6].map((x) => bx(x, 5, 0.5, x + 0.4, 5.2, 15.5, P.STEEL_L)),
      bx(6, 1, 14, 10, 3, 16, P.VOLT)] },
    wind_turbine: { model: [bx(3, 0, 3, 13, 5, 13, P.LVC), bx(3, 0, 3, 13, 1, 13, P.LV_D), bx(7, 5, 7, 9, 13, 9, P.STEEL), bx(5.5, 12, 6, 10.5, 15, 11, P.LVC),
      bx(0, 12.9, 11.2, 16, 14.1, 11.8, P.WHITE, SPINZ), bx(7.4, 5.5, 11.2, 8.6, 21.5, 11.8, P.WHITE, SPINZ), bx(7, 13, 11, 9, 14, 12.5, P.LV_D), bx(6, 1, 13, 10, 4, 13.5, P.VOLT)] },
    water_turbine: { model: [bx(1, 4, 1, 15, 12, 15, P.LVC), bx(1, 11, 1, 15, 12, 15, P.LV_D), bx(0, 0, 5, 16, 6, 11, P.STEEL), bx(0, 1, 6, 16, 4, 10, P.WATER),
      bx(1, 0.5, 15, 15, 6, 15.3, P.STEEL_D), bx(4, 0.5, 15.3, 12, 6, 15.8, P.STEEL_L, SPINZ), bx(6, 7, 0, 10, 10, 1, P.VOLT)] },
    scanner: { model: [...lv(), bx(4, 12, 4, 12, 13, 12, P.COPPER), bx(7, 13, 7, 9, 16, 9, P.STEEL), bx(5, 15.5, 5, 11, 16.5, 11, 0x40a0c0, SPIN), ...screen(4, 4, 12, 8, 0x40a0c0)] },
    mining_rig: { model: [...lv(), bx(3, 12, 3, 13, 14, 13, P.STEEL), bx(7, 14, 7, 9, 20, 9, 0xd0a030), ...posts(2, 2, 14, 14, 12, 20, 1, P.STEEL_D), bx(2, 19, 2, 14, 20, 14, P.STEEL_D),
      bx(0, 0, 0, 3, 3, 16, P.STEEL), bx(13, 0, 0, 16, 3, 16, P.STEEL)] },
    // Cables + fuse + breaker keep their simple shapes (rendered as hubs + arms).
    breaker: { model: [bx(4, 3, 4, 12, 13, 12, 0x404448), bx(4.5, 3, 11.8, 11.5, 12.5, 12.3, 0x50545a), bx(6, 8, 12, 10, 11, 13, P.RED), bx(7, 5, 12, 9, 6.5, 12.6, P.VOLT)] },
    // ---- EBF + hatches ----
    ebf: { model: [bx(0, 0, 0, 16, 16, 16, P.HEAT), bx(0, 0, 0, 16, 2, 16, P.STEEL), ...fireDoor(4, 4, 12, 10, 15.5), bx(5, 12, 15.5, 11, 14.5, 16.2, P.SCREEN), bx(6, 12.6, 16.1, 10, 13.9, 16.3, P.LCD, HOT)],
      puff: [[8, 64, -8, 0]] },
    heat_casing: { model: [bx(0, 0, 0, 16, 16, 16, P.HEAT), bx(0, 0, 0, 16, 2, 16, P.STEEL), bx(0, 14, 0, 16, 16, 16, P.STEEL), ...posts(0, 0, 16, 16, 2, 14, 1.5, P.STEEL_D),
      bx(3, 6, -0.2, 13, 10, 16.2, 0x9a8a70)] },
    cupronickel_coil: { model: coil(0x5a4a3a, P.CUNI) }, kanthal_coil: { model: coil(0x4a4a50, P.KANTHAL) },
    energy_hatch: { model: hatch(P.LVC, P.CABLE, P.VOLT) }, energy_hatch_mv: { model: hatch(P.MVC, 0x4a3a34, P.VOLT) },
    maintenance_hatch: { model: [...hatch(P.LVC, 0x4080c0), bx(6, 6, 15.6, 10, 10, 16.4, 0xd0d0d0), bx(7.3, 7.3, 16.3, 8.7, 8.7, 16.6, 0x4080c0)] },
    output_bus: { model: hatch(P.STEEL, 0xe0a040, P.DARK) },
    // ---- MV ----
    steam_turbine_mv: { model: [...lv(10).map(mv), bx(0, 3, 4, 16, 9, 12, P.STEEL_L), bx(-0.5, 4, 5, 0.5, 8, 11, P.STEEL), bx(15.5, 4, 5, 16.5, 8, 11, P.STEEL), bx(3, 11, 3, 13, 13, 13, P.STEEL_D),
      bx(4, 13, 4, 12, 15, 12, P.WHITE, SPIN), ...vent(4, 3, 12, 3, P.LV_D)], puff: [[8, 16, 8, 1]] },
    combustion_generator_mv: { model: [...lv(10).map(mv), bx(3, 11, 3, 13, 12.5, 13, P.SOOT), ...exhaust(11, 4, 12, 18), ...exhaust(3, 10, 12, 18), ...fireDoor(4, 3.5, 12, 7.5)],
      puff: [[12, 18, 5, 0], [4, 18, 11, 0]] },
    battery_buffer_mv: { model: [...lv().map(mv), ...[[3, 3], [9, 3], [3, 9], [9, 9]].flatMap(([x, z]) => [bx(x, 12, z, x + 4, 15, z + 4, 0xd0d8e0), bx(x + 1.5, 15, z + 1.5, x + 2.5, 15.6, z + 2.5, P.VOLT)])] },
    pyrolyse_oven: { model: [bx(0, 0, 0, 16, 16, 16, P.HEAT), bx(0, 0, 0, 16, 2, 16, P.MVC), ...fireDoor(3, 3, 13, 10, 15.5), bx(2, 12.5, 15.5, 14, 14.5, 16.2, P.MVC), bx(6.5, 13, 16, 9.5, 14, 16.4, P.VOLT)],
      puff: [[8, 32, -8, 0]] },
    distillery: { model: [bx(1, 0, 1, 15, 8, 15, P.MVC), ...posts(1, 1, 15, 15, 0, 8, 1, P.STEEL_L), ...socket(), bx(4, 8, 4, 12, 22, 12, P.STEEL), ...[10, 14, 18].map((y) => bx(3.5, y, 3.5, 12.5, y + 1, 12.5, P.MVC)),
      ...[11, 15, 19].map((y) => bx(12, y, 7, 15, y + 1, 9, P.STEEL_D)), bx(5, 2, 15, 11, 6, 15.4, P.GLASS), bx(7, 22, 7, 9, 23, 9, P.STEEL_D)], puff: [[8, 23, 8, 1]] },
    scrubber: { model: [bx(0, 0, 0, 16, 16, 16, 0x8aa0a8), bx(0, 0, 0, 16, 2, 16, P.ALU), bx(3, 3, 15.5, 13, 11, 16, P.STEEL), bx(4, 4, 15.8, 12, 10, 16.2, P.WATER, SPINZ),
      bx(6, 12, 15.5, 10, 14, 16.2, P.VOLT)], puff: [[8, 96, 8, 1]] },
    scrubber_casing: { model: [bx(0, 0, 0, 16, 16, 16, 0x8aa0a8), bx(0, 0, 0, 16, 2, 16, P.ALU), bx(0, 14, 0, 16, 16, 16, P.ALU), ...posts(0, 0, 16, 16, 2, 14, 1.5, P.ALU),
      bx(3, 4, -0.2, 13, 12, 16.2, 0xa8c8d0)] },
    water_treatment: { model: [bx(1, 0, 1, 15, 8, 15, P.MVC), ...posts(1, 1, 15, 15, 0, 8, 1, P.STEEL_L), ...socket(), bx(2, 8, 2, 14, 13, 14, P.STEEL), bx(3, 12, 3, 13, 12.8, 13, P.WATER),
      bx(7, 12.5, 3, 9, 13.5, 13, P.STEEL_L, SPIN), bx(7, 13, 7, 9, 16, 9, P.STEEL_D), ...screen(4, 3, 12, 6.5)] },
    geothermal_generator: { model: [bx(1, 0, 1, 15, 8, 15, P.MVC), ...posts(1, 1, 15, 15, 0, 8, 1, P.STEEL_L), ...socket(), bx(5, 8, 5, 11, 14, 11, P.STEEL), bx(4, 14, 4, 12, 16, 12, 0xd8d8d8),
      bx(0, 0, 6, 1, 4, 10, P.GLOW, HOT), ...vent(4, 2, 12, 3, P.LV_D)], puff: [[8, 16, 8, 1]] },
    hall_heroult: { model: [bx(0, 0, 0, 16, 16, 16, P.CARBON), bx(0, 0, 0, 16, 2, 16, P.STEEL), bx(2, 10, 15.5, 14, 14, 16.2, P.ALU), bx(4, 3, 15.5, 12, 8, 16.2, P.MOLTEN, HOT),
      bx(6, 12, 15.9, 10, 14, 16.5, P.VOLT)], puff: [[8, 17, -8, 0], [8, 17, -24, 0]] },
    carbon_casing: { model: [bx(0, 0, 0, 16, 16, 16, P.STEEL), bx(1, 1, -0.2, 15, 15, 16.2, P.CARBON), bx(-0.2, 1, 1, 16.2, 15, 15, P.CARBON), bx(0, 14, 0, 16, 16, 16, 0x5a5e64)] },
    cathode_block: { model: [bx(0, 0, 0, 16, 14, 16, P.CARBON), bx(0, 14, 0, 16, 15, 16, P.MOLTEN, HOT), bx(6, 0, 6, 10, 16, 10, P.STEEL), bx(2, 15, 2, 14, 15.5, 14, 0x202024)] },
  };
  return A;
}

/** Brick courses on the four faces of a full block (offset rows), up to height h. */
function bricks(c: number, h = 16): Box[] {
  const out: Box[] = [];
  for (let y = 3.5; y < h; y += 4) {
    out.push(bx(-0.1, y, -0.1, 16.1, y + 0.6, 16.1, c));
    const off = (y / 4) % 2 < 1 ? 4 : 0;
    for (let x = off; x < 16; x += 8) out.push(bx(x, y - 3.4, -0.15, x + 0.6, y, 16.15, c), bx(-0.15, y - 3.4, x, 16.15, y, x + 0.6, c));
  }
  return out;
}
/** Hatch: casing block with a coloured port on the front, optional core. */
function hatch(casing: number, port: number, core = P.DARK): Box[] {
  return [bx(0, 0, 0, 16, 16, 16, casing), ...posts(0, 0, 16, 16, 0, 16, 1.5, P.STEEL_D), bx(3, 3, 15.5, 13, 13, 16.2, port), bx(5, 5, 16, 11, 11, 16.5, core)];
}
/** Coil: dark core wound with bands. */
function coil(core: number, wire: number): Box[] {
  return [bx(0, 0, 0, 16, 16, 16, core), ...[1, 4, 7, 10, 13].map((y) => bx(-0.2, y, -0.2, 16.2, y + 2, 16.2, wire))];
}
/** LV → MV hull tint. */
function mv(b: Box): Box { const c = b[6] === P.LVC ? P.MVC : b[6] === P.LV_S ? P.MV_S : b[6]; return [b[0], b[1], b[2], b[3], b[4], b[5], c, b[7]]; }
export const tierTint = (m: Box[]) => m.map(mv);
