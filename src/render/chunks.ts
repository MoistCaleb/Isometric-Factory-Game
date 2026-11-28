// Chunk meshes: one layer slice (surface, or depth d) of CH×CH tiles, vertex-colored quads + instanced trees.
import * as THREE from 'three';
import { CROP } from '../data/crops';
import { B, BLOCKS, isOre, oreBlock } from '../world/blocks';
import { Tree, type WorldGen } from '../world/gen';
import { waterColor } from '../world/map';
import { hash01 } from '../world/noise';

export const CH = 32;
/** `blight`: pollution withered this chunk's trees (P5e; chunk = pollution chunk). */
export interface ChunkOpts { level: number; xray: boolean; diffs: Record<string, number>; blight?: boolean }

const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const treeMat = new THREE.MeshLambertMaterial();
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
/** Tree boxes [width, height, base y, colour]: trees stand 2 storeys (6 blocks) tall, cactus 1 storey (P5g). */
export const TREE_PARTS: Record<number, [w: number, h: number, y: number, color: number][]> = {
  [Tree.Broadleaf]: [[0.22, 3.6, 0, 0x6a4a2a], [1.25, 1.9, 2.7, 0x3f7a2a], [0.95, 1.0, 4.5, 0x4a8a32], [0.5, 0.5, 5.5, 0x4a8a32]],
  [Tree.Conifer]: [[0.2, 1.8, 0, 0x5a3e24], [1.15, 1.3, 1.0, 0x2d5a35], [0.9, 1.3, 2.2, 0x2d5a35], [0.65, 1.3, 3.4, 0x335f3a], [0.38, 1.3, 4.6, 0x335f3a]],
  [Tree.Jungle]: [[0.28, 5.0, 0, 0x5a4a2a], [1.5, 0.9, 4.6, 0x2f8a30], [1.0, 0.6, 5.4, 0x3a9a38], [0.5, 1.2, 3.4, 0x2f8a30]],
  [Tree.Cactus]: [[0.32, 2.8, 0, 0x4a8a3a], [0.75, 0.24, 1.4, 0x4a8a3a]],
};

const waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
/** Water surface sits just below land; the seabed is drawn at its depth underneath (cap keeps trenches on screen). */
export const WATER_H = -0.15;
export const seabedH = (d: number) => -0.3 - 0.15 * Math.min(d, 8) - 0.04 * Math.max(0, d - 8);

const darken = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

/** Height of a tile's top face relative to the layer plane. Dug-out (air) blocks show as pits onto the block below. */
function topOf(gen: WorldGen, x: number, y: number, level: number, xray: boolean, diffs: Record<string, number>): { h: number; c: number; w?: number } {
  if (!gen.inBounds(y)) return { h: -2, c: 0 };
  const xw = gen.wrapX(x);
  // A block shows what it really is (ores included) once revealed: at the surface, or next to / under a dug-out block.
  const open = (xx: number, yy: number, z: number) => diffs[`${gen.wrapX(xx)},${yy},${z}`] === B.air;
  const revealed = (z: number) => z === 0 || open(xw, y, z - 1) || open(xw - 1, y, z) || open(xw + 1, y, z) || open(xw, y - 1, z) || open(xw, y + 1, z);
  const at = (z: number) => diffs[`${xw},${y},${z}`] ?? (xray || revealed(z) ? gen.block(xw, y, z) : gen.terrain(xw, y, z));
  const z0 = Math.max(0, -level);
  let b: number, h = 0, c: number;
  if (z0 === 0) {
    const sf = gen.surface(xw, y);
    b = diffs[`${xw},${y},0`] ?? gen.block(xw, y, 0, sf);
    c = BLOCKS[b].color;
    if (b === B.water && sf.depth) {
      const d = sf.depth, bed = diffs[`${xw},${y},${d}`] ?? (xray ? gen.block(xw, y, d, sf) : gen.terrain(xw, y, d, sf));
      return { h: seabedH(d), c: darken(BLOCKS[bed].color, Math.max(0.3, 1 - d * 0.06)), w: waterColor(d) };
    }
    if (b !== B.air) return { h: sf.ice ? 0.12 : isOre(b) ? 0.06 : 0, c };
  } else {
    b = at(z0);
    if (b !== B.air) return { h: isOre(b) ? 0.06 : 0, c: BLOCKS[b].color };
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
  const H = new Float32Array(N * N), C = new Uint32Array(N * N), Wc = new Int32Array(N * N).fill(-1);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = topOf(gen, x0 + i - 1, y0 + j - 1, o.level, o.xray, o.diffs);
    H[j * N + i] = t.h; C[j * N + i] = t.c;
    if (t.w !== undefined) Wc[j * N + i] = t.w;
  }
  const wpos: number[] = [], wcol: number[] = [], wnrm: number[] = [], widx: number[] = [];
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
    if (Wc[k] >= 0) {
      const b = wpos.length / 3, rgb = shade(Wc[k], 0.97 + (jit - 1) * 0.3);
      for (const v of [[i, WATER_H, j], [i, WATER_H, j + 1], [i + 1, WATER_H, j + 1], [i + 1, WATER_H, j]]) { wpos.push(...v); wnrm.push(0, 1, 0); wcol.push(...rgb); }
      widx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
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
  if (widx.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wnrm, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
    wg.setIndex(widx);
    wg.computeBoundingSphere();
    const wm = new THREE.Mesh(wg, waterMat);
    wm.renderOrder = 1;
    g.add(wm);
  }
  if (o.level >= 0) addTrees(g, gen, x0, y0, Math.min(CH, wLimit), o.diffs, !!o.blight);
  if (o.level >= 0) addSamples(g, gen, x0, y0, Math.min(CH, wLimit), o.diffs);
  if (o.level >= 0) addWild(g, gen, x0, y0, Math.min(CH, wLimit), o.diffs);
  return g;
}

/** Withered foliage colour (blight). */
const DEAD = 0x7a6a52;

function addTrees(g: THREE.Group, gen: WorldGen, x0: number, y0: number, wN: number, diffs: Record<string, number>, blight: boolean) {
  const parts: [THREE.Matrix4, number][] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let j = 0; j < CH; j++) for (let i = 0; i < wN; i++) {
    const x = x0 + i, y = y0 + j;
    if (!gen.inBounds(y) || diffs[`${x},${y},t`] !== undefined) continue;
    const t = gen.tree(x, y);
    if (!t) continue;
    const ox = (hash01(gen.seed + 40, x, y) - 0.5) * 0.3, oz = (hash01(gen.seed + 41, x, y) - 0.5) * 0.3;
    const sc = 0.9 + hash01(gen.seed + 42, x, y) * 0.2;
    TREE_PARTS[t].forEach(([w, h, yy, c], n) => {
      const leaf = n > 0 && blight && t !== Tree.Cactus, k = leaf ? 0.75 : 1; // withered crowns shrink and brown
      p.set(i + 0.5 + ox, yy * sc, j + 0.5 + oz); s.set(w * sc * k, h * sc * k, w * sc * k);
      parts.push([m.compose(p, q, s).clone(), leaf ? DEAD : c]);
    });
  }
  if (!parts.length) return;
  const im = new THREE.InstancedMesh(unitBox, treeMat, parts.length);
  const col = new THREE.Color();
  parts.forEach(([mx, c], n) => { im.setMatrixAt(n, mx); im.setColorAt(n, col.setHex(c)); });
  im.computeBoundingSphere();
  g.add(im);
}

/** Loose ore samples (DESIGN §3 discovery): a couple of small ore-coloured rocks on the tile. */
function addSamples(g: THREE.Group, gen: WorldGen, x0: number, y0: number, wN: number, diffs: Record<string, number>) {
  const parts: [THREE.Matrix4, number][] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let j = 0; j < CH; j++) for (let i = 0; i < wN; i++) {
    const x = x0 + i, y = y0 + j;
    if (!gen.inBounds(y) || diffs[`${x},${y},s`] !== undefined || diffs[`${x},${y},0`] === B.air) continue;
    const smp = gen.sample(x, y);
    if (!smp) continue;
    const c = BLOCKS[oreBlock(smp.mineral)].color;
    for (let k = 0; k < 2; k++) {
      const ox = 0.25 + hash01(gen.seed + 60 + k, x, y) * 0.5, oz = 0.25 + hash01(gen.seed + 62 + k, x, y) * 0.5, s = k ? 0.2 : 0.3;
      q.setFromAxisAngle(UP, hash01(gen.seed + 64 + k, x, y) * Math.PI);
      p.set(i + ox, 0, j + oz); sc.set(s, s * 0.8, s);
      parts.push([m.compose(p, q, sc).clone(), c]);
    }
  }
  if (!parts.length) return;
  const im = new THREE.InstancedMesh(unitBox, treeMat, parts.length);
  const col = new THREE.Color();
  parts.forEach(([mx, c], n) => { im.setMatrixAt(n, mx); im.setColorAt(n, col.setHex(c)); });
  im.computeBoundingSphere();
  g.add(im);
}
const UP = new THREE.Vector3(0, 1, 0);

/** Wild plants (P5h): a tuft of green stems with the crop's colour on top. */
function addWild(g: THREE.Group, gen: WorldGen, x0: number, y0: number, wN: number, diffs: Record<string, number>) {
  const parts: [THREE.Matrix4, number][] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let j = 0; j < CH; j++) for (let i = 0; i < wN; i++) {
    const x = x0 + i, y = y0 + j;
    if (!gen.inBounds(y) || diffs[`${x},${y},p`] !== undefined || diffs[`${x},${y},0`] === B.air) continue;
    const c = gen.plant(x, y);
    if (!c) continue;
    const col = CROP.get(c)!.color;
    for (let k = 0; k < 3; k++) {
      const ox = 0.3 + hash01(gen.seed + 72 + k, x, y) * 0.4, oz = 0.3 + hash01(gen.seed + 75 + k, x, y) * 0.4, h = 0.25 + hash01(gen.seed + 78 + k, x, y) * 0.2;
      parts.push([m.compose(p.set(i + ox, 0, j + oz), q, sc.set(0.05, h, 0.05)).clone(), 0x4a8a2a]);
      parts.push([m.compose(p.set(i + ox, h, j + oz), q, sc.set(0.12, 0.1, 0.12)).clone(), col]);
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
