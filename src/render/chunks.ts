// Chunk meshes: one layer slice (surface, or depth d) of CH×CH tiles, vertex-colored quads + instanced trees.
import * as THREE from 'three';
import { B, BLOCKS, isOre } from '../world/blocks';
import { Tree, Water, type WorldGen } from '../world/gen';
import { hash01 } from '../world/noise';

export const CH = 32;
export interface ChunkOpts { level: number; xray: boolean; diffs: Record<string, number> }

const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const treeMat = new THREE.MeshLambertMaterial();
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const TREE_PARTS: Record<number, [w: number, h: number, y: number, color: number][]> = {
  [Tree.Broadleaf]: [[0.16, 0.5, 0, 0x6a4a2a], [0.7, 0.55, 0.45, 0x3f7a2a]],
  [Tree.Conifer]: [[0.14, 0.35, 0, 0x5a3e24], [0.6, 0.45, 0.3, 0x2d5a35], [0.38, 0.4, 0.7, 0x2d5a35]],
  [Tree.Jungle]: [[0.2, 0.9, 0, 0x5a4a2a], [0.9, 0.45, 0.8, 0x2f8a30]],
  [Tree.Cactus]: [[0.18, 0.7, 0, 0x4a8a3a]],
};

const darken = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

/** Height of a tile's top face relative to the layer plane. Dug-out (air) blocks show as pits onto the block below. */
function topOf(gen: WorldGen, x: number, y: number, level: number, xray: boolean, diffs: Record<string, number>): { h: number; c: number } {
  if (!gen.inBounds(y)) return { h: -2, c: 0 };
  const xw = gen.wrapX(x);
  const at = (z: number) => diffs[`${xw},${y},${z}`] ?? (xray ? gen.block(xw, y, z) : gen.terrain(xw, y, z));
  const z0 = Math.max(0, -level);
  let b: number, h = 0, c: number;
  if (z0 === 0) {
    const sf = gen.surface(xw, y);
    b = diffs[`${xw},${y},0`] ?? gen.terrain(xw, y, 0, sf);
    c = BLOCKS[b].color;
    if (b !== B.air) {
      if (sf.water === Water.Ocean) c = sf.coast ? 0x3a7cb0 : 0x1f4f80;
      return { h: sf.ice ? 0.12 : sf.water === Water.Ocean ? -0.35 : sf.water !== Water.None ? -0.22 : 0, c };
    }
  } else {
    b = at(z0);
    if (b !== B.air) return { h: xray && isOre(b) ? 0.12 : 0, c: BLOCKS[b].color };
  }
  let z = z0;
  while (b === B.air && z < 25) { b = at(++z); h -= 0.5; }
  c = darken(BLOCKS[b].color, Math.max(0.35, 1 + h * 0.4));
  return { h: Math.max(h, -1.5), c };
}

function shade(c: number, f: number): [number, number, number] {
  return [((c >> 16) & 255) / 255 * f, ((c >> 8) & 255) / 255 * f, (c & 255) / 255 * f];
}

/** Build chunk (cx wrapped index, cy) in local coords [0,CH). Tiles beyond the planet width are skipped. */
export function buildChunk(gen: WorldGen, cx: number, cy: number, o: ChunkOpts): THREE.Group {
  const N = CH + 2, x0 = cx * CH, y0 = cy * CH;
  const H = new Float32Array(N * N), C = new Uint32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = topOf(gen, x0 + i - 1, y0 + j - 1, o.level, o.xray, o.diffs);
    H[j * N + i] = t.h; C[j * N + i] = t.c;
  }
  const pos: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = [];
  const quad = (p: number[][], n: number[], rgb: [number, number, number]) => {
    const b = pos.length / 3;
    for (const v of p) { pos.push(v[0], v[1], v[2]); nrm.push(n[0], n[1], n[2]); col.push(rgb[0], rgb[1], rgb[2]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const wLimit = gen.w - x0;
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH && i < wLimit; i++) {
    const k = (j + 1) * N + i + 1, h = H[k], c = C[k];
    if (h <= -2) continue;
    const jit = 0.93 + hash01(gen.seed + 31, x0 + i, y0 + j) * 0.12;
    quad([[i, h, j], [i, h, j + 1], [i + 1, h, j + 1], [i + 1, h, j]], [0, 1, 0], shade(c, jit));
    // Sides where a neighbour is lower (water banks, ice edges, ore bumps, world edge).
    const sides: [number, number[][], number[]][] = [
      [k - 1, [[i, h, j], [i, -99, j], [i, -99, j + 1], [i, h, j + 1]], [-1, 0, 0]],
      [k + 1, [[i + 1, h, j + 1], [i + 1, -99, j + 1], [i + 1, -99, j], [i + 1, h, j]], [1, 0, 0]],
      [k - N, [[i + 1, h, j], [i + 1, -99, j], [i, -99, j], [i, h, j]], [0, 0, -1]],
      [k + N, [[i, h, j + 1], [i, -99, j + 1], [i + 1, -99, j + 1], [i + 1, h, j + 1]], [0, 0, 1]],
    ];
    for (const [nk, p, n] of sides) {
      const nh = Math.max(H[nk], -2);
      if (nh >= h) continue;
      for (const v of p) if (v[1] === -99) v[1] = nh;
      quad(p, n, shade(c, jit * 0.62));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, terrainMat));
  if (o.level >= 0) addTrees(g, gen, x0, y0, Math.min(CH, wLimit), o.diffs);
  return g;
}

function addTrees(g: THREE.Group, gen: WorldGen, x0: number, y0: number, wN: number, diffs: Record<string, number>) {
  const parts: [THREE.Matrix4, number][] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let j = 0; j < CH; j++) for (let i = 0; i < wN; i++) {
    const x = x0 + i, y = y0 + j;
    if (!gen.inBounds(y) || diffs[`${x},${y},t`] !== undefined) continue;
    const t = gen.tree(x, y);
    if (!t) continue;
    const ox = (hash01(gen.seed + 40, x, y) - 0.5) * 0.3, oz = (hash01(gen.seed + 41, x, y) - 0.5) * 0.3;
    const sc = 0.85 + hash01(gen.seed + 42, x, y) * 0.35;
    for (const [w, h, yy, c] of TREE_PARTS[t]) {
      p.set(i + 0.5 + ox, yy * sc, j + 0.5 + oz); s.set(w * sc, h * sc, w * sc);
      parts.push([m.compose(p, q, s).clone(), c]);
    }
  }
  if (!parts.length) return;
  const im = new THREE.InstancedMesh(unitBox, treeMat, parts.length);
  const col = new THREE.Color();
  parts.forEach(([mx, c], n) => { im.setMatrixAt(n, mx); im.setColorAt(n, col.setHex(c)); });
  im.computeBoundingSphere();
  g.add(im);
}

export function disposeChunk(g: THREE.Group) {
  g.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); else if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}
