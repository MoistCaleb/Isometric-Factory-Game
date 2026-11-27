import { describe, expect, it } from 'vitest';
import { planet } from '../src/data/planets';
import { migrate } from '../src/save/migrations';
import { newGame, STATE_VERSION } from '../src/sim/state';
import { step } from '../src/sim/step';
import { B, BLOCKS, ORE_BASE } from '../src/world/blocks';
import { LAYERS, Water, WorldGen } from '../src/world/gen';

const earth = planet('earth');
const gen = new WorldGen(12345, earth);

describe('world gen', () => {
  it('is deterministic', () => {
    const g2 = new WorldGen(12345, earth);
    for (let i = 0; i < 200; i++) {
      const x = (i * 977) % earth.w, y = (i * 613) % earth.h, z = i % 26;
      expect(g2.block(x, y, z)).toBe(gen.block(x, y, z));
    }
  });
  it('wraps east–west', () => {
    for (let y = 100; y < earth.h; y += 300) {
      expect(gen.surface(-1, y)).toEqual(gen.surface(earth.w - 1, y));
      expect(gen.block(earth.w + 5, y, 4)).toBe(gen.block(5, y, 4));
    }
  });
  it('has polar ice caps and bedrock', () => {
    expect(gen.surface(10, 0).ice).toBe(true);
    expect(gen.surface(10, earth.h - 1).ice).toBe(true);
    expect(gen.block(10, 1000, LAYERS.bedrock)).toBe(B.bedrock);
  });
  it('has oceans, land and rivers', () => {
    const seen = new Set<number>();
    for (let y = 200; y < 1800; y += 7) for (let x = 0; x < earth.w; x += 61) seen.add(gen.surface(x, y).water);
    expect([...seen].sort()).toEqual([Water.None, Water.River, Water.Lake, Water.Ocean]);
  });
  it('places 2–4k veins on Earth within their depth bands', () => {
    let n = 0;
    for (let cy = 0; cy < gen.cellsY; cy++) for (let cx = 0; cx < gen.cellsX; cx++) for (const v of gen.veinsInCell(cx, cy)) {
      n++;
      expect(v.z0).toBeGreaterThanOrEqual(v.def.depth[0]);
      expect(v.z1).toBeLessThanOrEqual(v.def.depth[1]);
    }
    expect(n).toBeGreaterThan(2000);
    expect(n).toBeLessThan(4000);
  });
  it('ore blocks belong to their vein', () => {
    let hits = 0;
    for (const v of gen.veinsAround(2000, 600, 2)) {
      const o = gen.ore(v.x, v.y, v.z0);
      if (!o) continue;
      hits++;
      const ref = BLOCKS[o.block].mineral ?? `mat:${BLOCKS[o.block].key}`;
      expect(v.def.parts.some((p) => p.ref === ref) || o.vein !== v).toBe(true);
      if (o.block >= ORE_BASE) expect(o.richness).toBeGreaterThan(0);
    }
    expect(hits).toBeGreaterThan(0);
  });
  it('spawns on temperate land', () => {
    const s = gen.findSpawn(), sf = gen.surface(s.x, s.y);
    expect(sf.water).toBe(Water.None);
    expect(['plains', 'forest']).toContain(sf.biome);
  });
});

describe('weather + saves', () => {
  it('weather stays in range', () => {
    const s = newGame(7);
    for (let i = 0; i < 20 * 60 * 60; i++) step(s);
    expect(s.weather.wind).toBeGreaterThanOrEqual(0);
    expect(s.weather.wind).toBeLessThanOrEqual(1);
    expect(s.weather.rain).toBeGreaterThanOrEqual(0);
    expect(s.weather.rain).toBeLessThanOrEqual(1);
  });
  it('migrates v1 saves', () => {
    const s = migrate({ version: 1, seed: 12345, planet: 'earth', tick: 5, rng: 1, playSeconds: 0 });
    expect(s.version).toBe(STATE_VERSION);
    expect(s.spawn).toEqual(gen.findSpawn());
    expect(s.diffs).toEqual({});
  });
});
