// Planet overview raster (region map + globe texture). Equirectangular: x→longitude, y→latitude.
import { BLOCKS } from './blocks';
import type { WorldGen } from './gen';

const lerpC = (a: number, b: number, t: number) => {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh;
  return ch(16) | ch(8) | ch(0);
};
/** Water tint by depth (layers): shallow turquoise → deep navy. */
export const waterColor = (d: number) => lerpC(0x4a9ac8, 0x0c2448, Math.min(1, (d - 1) / 12));

/** RGBA pixels, `pw` × `ph`, sampling tile centers. Async-chunked so the UI stays responsive. */
export async function planetMap(gen: WorldGen, pw: number, ph: number, yieldEvery = 32): Promise<Uint8ClampedArray> {
  const px = new Uint8ClampedArray(pw * ph * 4);
  for (let j = 0; j < ph; j++) {
    const y = Math.floor(((j + 0.5) / ph) * gen.h);
    for (let i = 0; i < pw; i++) {
      const x = Math.floor(((i + 0.5) / pw) * gen.w);
      const sf = gen.surface(x, y);
      const c = sf.depth ? waterColor(sf.depth) : BLOCKS[gen.terrain(x, y, 0, sf)].color;
      const o = (j * pw + i) * 4;
      px[o] = c >> 16; px[o + 1] = (c >> 8) & 255; px[o + 2] = c & 255; px[o + 3] = 255;
    }
    if (yieldEvery && j % yieldEvery === yieldEvery - 1) await new Promise((r) => setTimeout(r));
  }
  return px;
}
