// Overlays (DESIGN §8, P3e): pollution (one tinted quad per 32×32 chunk, iso + map) and pipes (every pipe block near the
// camera on all storeys, drawn through everything: fluid blue, item orange). Built in camera-relative world coords.
import * as THREE from 'three';
import { CABLES, PIPES } from '../data/structures';
import { HAZE, POLL_CH, SMOG } from '../sim/pollution';
import type { PNet } from '../sim/power';
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

/** Contaminated tiles (P4e hazards): one sickly green quad per tile within `R` of the camera, at height `y`. */
export function hazGeometry(hz: Record<string, number>, w: number, cx: number, cy: number, R: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const k of Object.keys(hz)) {
    const [kx, ky] = k.split(',').map(Number), x0 = cx + mod(kx - cx + w / 2, w) - w / 2, z0 = ky;
    if (Math.abs(x0 - cx) > R || Math.abs(z0 - cy) > R) continue;
    const x1 = x0 + 1, z1 = z0 + 1, g = 0.06;
    pos.push(x0 + g, y, z0 + g, x0 + g, y, z1 - g, x1 - g, y, z1 - g, x0 + g, y, z0 + g, x1 - g, y, z1 - g, x1 - g, y, z0 + g);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

const BOX = new THREE.BoxGeometry(0.42, 0.42, 0.42);
const FLUID = new THREE.Color(0x40a8ff), ITEM = new THREE.Color(0xffa040), POWER = new THREE.Color(0xf0e040);

const OK = new THREE.Color(0x40d040), BUSY = new THREE.Color(0xf0e040), HOT = new THREE.Color(0xf08020), OVER = new THREE.Color(0xe02020),
  DEAD = new THREE.Color(0x707070), TRIP = new THREE.Color(0xff40ff);
/** Load colour: green → yellow (50 %) → orange (90 %) → red (over); grey = no source. */
export function loadColor(l: number | undefined) {
  if (l === undefined || l < 0) return DEAD;
  return l <= 0.5 ? OK.clone().lerp(BUSY, l / 0.5) : l <= 0.9 ? BUSY.clone().lerp(HOT, (l - 0.5) / 0.4) : l <= 1 ? HOT : OVER;
}

/** Power overlay (P4c): every cable block near the camera coloured by its network's load; tripped breakers magenta. */
export function powerGeometry(ents: Record<string, Ent>, nets: PNet[], load: Record<string, number>, w: number, cx: number, cy: number, R: number): THREE.BufferGeometry {
  const col = new Map<string, THREE.Color>();
  for (const n of nets) { const c = loadColor(load[n.id]); for (const k of n.keys) col.set(k, c); }
  for (const [k, e] of Object.entries(ents)) if (e.trip && CABLES.has(e.s)) col.set(k, TRIP);
  return boxes([...col.entries()], w, cx, cy, R);
}

function boxes(list: [string, THREE.Color][], w: number, cx: number, cy: number, R: number): THREE.BufferGeometry {
  const bp = BOX.getAttribute('position'), idx = BOX.getIndex()!, pos: number[] = [], col: number[] = [];
  for (const [k, c] of list) {
    const [x, y, b] = k.split(',').map(Number), wx = cx + mod(x - cx + w / 2, w) - w / 2;
    if (Math.abs(wx - cx) > R || Math.abs(y - cy) > R) continue;
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

/** Pipe and cable (yellow, P4a) blocks within `R` tiles of the camera, as one merged geometry of small boxes. */
export function pipeGeometry(ents: Record<string, Ent>, w: number, cx: number, cy: number, R: number): THREE.BufferGeometry {
  const list: [string, THREE.Color][] = [];
  for (const [k, e] of Object.entries(ents)) {
    const pd = PIPES.get(e.s), cab = CABLES.has(e.s);
    if (pd || cab) list.push([k, cab ? POWER : pd!.item ? ITEM : FLUID]);
  }
  return boxes(list, w, cx, cy, R);
}
