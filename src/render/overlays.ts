// Overlays (DESIGN §8, P3e): pollution (one tinted quad per 32×32 chunk, iso + map) and pipes (every pipe block near the
// camera on all storeys, drawn through everything: fluid blue, item orange). Built in camera-relative world coords.
import * as THREE from 'three';
import { PIPES } from '../data/structures';
import { HAZE, POLL_CH, SMOG } from '../sim/pollution';
import type { Ent } from '../sim/state';

const mod = (a: number, n: number) => ((a % n) + n) % n;
const LOW = new THREE.Color(0xe8e070), MID = new THREE.Color(0xe89030), HIGH = new THREE.Color(0xd02020);

export function pollColor(p: number) {
  return p < HAZE ? LOW.clone().lerp(MID, p / HAZE) : MID.clone().lerp(HIGH, Math.min(1, (p - HAZE) / (SMOG - HAZE)));
}

/** Pollution quads for chunks within `R` tiles of camera x (`cx`), at height `y`. */
export function pollGeometry(pl: Record<string, number>, w: number, cx: number, cy: number, R: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  for (const [k, p] of Object.entries(pl)) {
    if (p < 5) continue;
    const [kx, ky] = k.split(',').map(Number);
    const x0 = cx + mod(kx * POLL_CH - cx + w / 2, w) - w / 2, z0 = ky * POLL_CH;
    if (Math.abs(x0 + POLL_CH / 2 - cx) > R || Math.abs(z0 + POLL_CH / 2 - cy) > R) continue;
    const x1 = x0 + POLL_CH, z1 = z0 + POLL_CH, c = pollColor(p), g = 0.15; // small gap shows chunk borders
    pos.push(x0 + g, y, z0 + g, x0 + g, y, z1 - g, x1 - g, y, z1 - g, x0 + g, y, z0 + g, x1 - g, y, z1 - g, x1 - g, y, z0 + g);
    for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

const BOX = new THREE.BoxGeometry(0.42, 0.42, 0.42);
const FLUID = new THREE.Color(0x40a8ff), ITEM = new THREE.Color(0xffa040);

/** Pipe blocks within `R` tiles of the camera, as one merged geometry of small boxes. */
export function pipeGeometry(ents: Record<string, Ent>, w: number, cx: number, cy: number, R: number): THREE.BufferGeometry {
  const bp = BOX.getAttribute('position'), idx = BOX.getIndex()!, pos: number[] = [], col: number[] = [];
  for (const [k, e] of Object.entries(ents)) {
    const pd = PIPES.get(e.s);
    if (!pd) continue;
    const [x, y, b] = k.split(',').map(Number), wx = cx + mod(x - cx + w / 2, w) - w / 2;
    if (Math.abs(wx - cx) > R || Math.abs(y - cy) > R) continue;
    const c = pd.item ? ITEM : FLUID;
    for (let i = 0; i < idx.count; i++) {
      const j = idx.getX(i);
      pos.push(Math.floor(wx) + 0.5 + bp.getX(j), b + 0.5 + bp.getY(j), y + 0.5 + bp.getZ(j));
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
