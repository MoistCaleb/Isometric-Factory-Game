// Vein overlay (DESIGN §3 discovery / §8 overlays): hints as dashed circles, exposed veins as outlines,
// surveyed veins as tinted fills. Shared by the iso view (at the viewed layer) and the region map.
import * as THREE from 'three';
import { MINERALS } from '../data/minerals';
import { KNOW } from '../sim/state';
import { BLOCKS, oreBlock } from '../world/blocks';
import { HINT_R, type VeinInst, type WorldGen } from '../world/gen';

const MINERAL_NAME = new Map(MINERALS.map((m) => [m.id, m.name]));
/** Main mineral of a vein (first non-filler part). */
export const mainMineral = (v: VeinInst) => v.def.parts.find((p) => !p.ref.startsWith('mat:'))?.ref ?? v.def.parts[0].ref;
export const veinColor = (v: VeinInst) => BLOCKS[oreBlock(mainMineral(v))]?.color ?? 0xffffff;
export const mineralName = (id: string) => MINERAL_NAME.get(id) ?? id.replace(/^mat:/, '');

export interface KnownVein { id: string; v: VeinInst; level: number; x: number; y: number }

/** Known veins resolved against the generator; hint-level entries are placed at their (jittered) hint centre. */
export function knownVeins(gen: WorldGen, known: Record<string, number>): KnownVein[] {
  const out: KnownVein[] = [];
  for (const [id, level] of Object.entries(known)) {
    const v = gen.veinById(id);
    if (!v) continue;
    const c = level === KNOW.hint ? gen.hintCentre(v) : v;
    out.push({ id, v, level, x: c.x + 0.5, y: c.y + 0.5 });
  }
  return out;
}

const dashMats = new Map<number, THREE.LineDashedMaterial>();
const lineMats = new Map<number, THREE.LineBasicMaterial>();
const fillMats = new Map<number, THREE.MeshBasicMaterial>();
const getMat = <M>(m: Map<number, M>, c: number, make: () => M) => m.get(c) ?? (m.set(c, make()), m.get(c)!);

function ellipse(a: number, b: number, rot: number, n = 48): THREE.Vector3[] {
  const c = Math.cos(rot), s = Math.sin(rot), pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2, u = Math.cos(t) * a, w = Math.sin(t) * b;
    pts.push(new THREE.Vector3(u * c - w * s, 0, u * s + w * c));
  }
  return pts;
}

/**
 * Overlay objects (local to each vein; caller positions `userData.x` / `userData.y` near the camera across the x-wrap).
 * `layer` filters exposed/surveyed veins to those spanning that depth (null = all); hints only show at the surface.
 */
export function buildVeinOverlay(list: KnownVein[], layer: number | null, scale = 1): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const k of list) {
    if (layer !== null && (k.level === KNOW.hint ? layer > 0 : layer > 0 && (layer < k.v.z0 || layer > k.v.z1))) continue;
    const col = veinColor(k.v);
    const g = new THREE.Group();
    if (k.level === KNOW.hint) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ellipse(HINT_R, HINT_R, 0)),
        getMat(dashMats, col, () => new THREE.LineDashedMaterial({ color: col, dashSize: 1.5 * scale, gapSize: 1.2 * scale, transparent: true, opacity: 0.9, depthTest: false })));
      line.computeLineDistances();
      g.add(line);
    } else {
      const pts = ellipse(k.v.a, k.v.b, k.v.rot);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), getMat(lineMats, col, () => new THREE.LineBasicMaterial({ color: col, depthTest: false }))));
      if (k.level === KNOW.surveyed) {
        const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
        g.add(new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
          getMat(fillMats, col, () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false }))));
      }
    }
    // Region map: a dot with a minimum on-screen size so veins stay findable when zoomed out.
    if (layer === null) g.add(new THREE.Mesh(new THREE.CircleGeometry(4 * scale, 16).rotateX(-Math.PI / 2),
      getMat(fillMats, col + (k.level === KNOW.hint ? 0x2000000 : 0x1000000), () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: k.level === KNOW.hint ? 0.5 : 0.95, depthTest: false }))));
    g.userData = { x: k.x, y: k.y };
    g.renderOrder = 5;
    g.traverse((o) => { o.renderOrder = 5; o.frustumCulled = false; });
    out.push(g);
  }
  return out;
}

export function disposeOverlay(g: THREE.Group) {
  g.traverse((o) => { if (o instanceof THREE.Line || o instanceof THREE.Mesh) o.geometry.dispose(); });
  g.clear();
}

/** Known veins covering a tile (exposed/surveyed: inside the outline; hints: inside the circle). */
export function veinsAtTile(gen: WorldGen, list: KnownVein[], x: number, y: number): KnownVein[] {
  return list.filter((k) => k.level === KNOW.hint ? Math.hypot(gen.dx(x + 0.5, k.x), y + 0.5 - k.y) <= HINT_R : gen.veinDist(k.v, x, y) <= 1);
}
