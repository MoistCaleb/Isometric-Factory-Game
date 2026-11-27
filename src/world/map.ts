// Planet overview raster (region map + globe texture). Equirectangular: x→longitude, y→latitude.
import { BLOCKS } from './blocks';
import { Water, type WorldGen } from './gen';

/** RGBA pixels, `pw` × `ph`, sampling tile centers. Async-chunked so the UI stays responsive. */
export async function planetMap(gen: WorldGen, pw: number, ph: number, yieldEvery = 32): Promise<Uint8ClampedArray> {
  const px = new Uint8ClampedArray(pw * ph * 4);
  for (let j = 0; j < ph; j++) {
    const y = Math.floor(((j + 0.5) / ph) * gen.h);
    for (let i = 0; i < pw; i++) {
      const x = Math.floor(((i + 0.5) / pw) * gen.w);
      const sf = gen.surface(x, y);
      let c = BLOCKS[gen.terrain(x, y, 0, sf)].color;
      if (sf.water === Water.Ocean) c = sf.coast ? 0x3a7cb0 : 0x1f4f80;
      else if (sf.water === Water.River) c = 0x3f86c0;
      const o = (j * pw + i) * 4;
      px[o] = c >> 16; px[o + 1] = (c >> 8) & 255; px[o + 2] = c & 255; px[o + 3] = 255;
    }
    if (yieldEvery && j % yieldEvery === yieldEvery - 1) await new Promise((r) => setTimeout(r));
  }
  return px;
}
