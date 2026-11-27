// World renderer (DESIGN §3/§8): iso chunk view ⇄ region map ⇄ 3D globe. Camera pan/zoom/4-way rotate, Z-level,
// day/night lighting, rain. Reads sim stats for time/weather; world is generated locally from seed + diffs.
import * as THREE from 'three';
import { planet, type PlanetDef } from '../data/planets';
import type { SimClient } from '../sim/client';
import { STOREY, TPS, timeOfDay, type GameState } from '../sim/state';
import { nearSide, STRUCT, topInStorey } from '../sim/build';
import { B, BLOCKS, isOre } from '../world/blocks';
import { LAYERS, Tree, Water, worldGen, type WorldGen } from '../world/gen';
import { planetMap } from '../world/map';
import { buildChunk, CH, disposeChunk } from './chunks';
import { buildStructs, ghostGeometry } from './structures';
import { multiCells } from '../data/structures';
import { buildVeinOverlay, disposeOverlay, knownVeins, mineralName, veinsAtTile, type KnownVein } from './veins';
import type { Ent } from '../sim/state';
import { pipeGeometry, pollGeometry } from './overlays';
import { HAZE, POLL_CH, SMOG } from '../sim/pollution';

export type Mode = 'iso' | 'map' | 'globe';
/** Player action mode (DESIGN §3 Building). */
export type Act = 'view' | 'build' | 'base' | 'demolish' | 'mine';
/** Build cursor preview (set by the UI). */
export type Ghost = { kind: 'struct'; id: string; r: number } | { kind: 'base'; part: string } | { kind: 'demolish' };
export interface View { mode: Mode; x: number; y: number; zoom: number; rot: number; level: number; xray: boolean; mapZoom: number; globeDist: number;
  /** Vein overlay on (iso + map). */
  veins: boolean;
  /** Pipe and pollution overlays (P3e). */
  pipes?: boolean; poll?: boolean }

export const LEVEL_MIN = -LAYERS.bedrock, LEVEL_MAX = 8;
const ISO_ZOOM: [number, number] = [5, 110];
const GLOBE_DIST: [number, number] = [1.6, 6];
const GLOBE_ENTER = 3.8; // whole planet in view when zooming out of the map
const ELEV = Math.atan(1 / Math.SQRT2);
const MAX_CACHE = 400; // hard cap on chunk meshes
const KEEP_FRAMES = 90; // off-screen chunks are freed after ~1.5 s (short grace avoids rebuild thrash while panning)
const CULL_PAD = 3; // tiles: side faces and trees poke slightly past a chunk's ground footprint
const mod = (a: number, n: number) => ((a % n) + n) % n;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface ChunkEntry { g: THREE.Group; used: number }

/** Axis-aligned rect vs convex quad overlap (separating axes: the quad's edge normals; rect axes handled by the caller's bounds). */
export function rectInQuad(rx0: number, rz0: number, rx1: number, rz1: number, q: readonly { x: number; z: number }[]): boolean {
  let area = 0;
  for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; area += a.x * b.z - b.x * a.z; }
  const sgn = Math.sign(area) || 1;
  const cs = [[rx0, rz0], [rx1, rz0], [rx1, rz1], [rx0, rz1]];
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    // Every rect corner strictly outside this edge → separated.
    if (cs.every(([x, z]) => sgn * ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) < 0)) return false;
  }
  return true;
}

export class Renderer {
  view: View = { mode: 'iso', x: 0, y: 0, zoom: 24, rot: 0, level: 0, xray: false, mapZoom: 400, globeDist: 2.6, veins: true };
  onView?: (v: View) => void;
  onHover?: (text: string | null) => void;
  act: Act = 'view';
  /** Click on a tile in iso view with a non-view action. level = view level (−depth or storey); fx/fy = point inside the tile. */
  /** Called when the user pans (drag or keys). */
  onPan?: () => void;
  /** Tile click; `block` = structure block under the pointer (`x,y,b`), if one was hit. */
  onTile?: (x: number, y: number, level: number, fx: number, fy: number, block?: string) => void;
  ghost: Ghost | null = null;
  /** Tile under the mouse (iso). */
  cursor: { x: number; y: number; fx: number; fy: number } | null = null;

  private r: THREE.WebGLRenderer;
  private gen?: WorldGen;
  private p: PlanetDef = planet('earth');
  private diffs: Record<string, number> = {};
  private ents: Record<string, Ent> = {};
  private base: Record<string, number> = {};
  private structVer = 0;
  private structSig = '';
  private structMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private structs = new THREE.Mesh(new THREE.BufferGeometry(), this.structMat);
  private structsGlass = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }));
  private ghostMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
  private multiGhost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMesh.material);
  /** Machine statuses (sim) and multiblock casings to ghost (open machine panel). */
  private ms: Record<string, number> = {};
  private msSig = '';
  private ghosts: Record<string, string> = {};
  /** Selected machine (open panel): pulsing outline around it / its whole multiblock, drawn through everything. */
  private selKey: string | null = null;
  private sel = new THREE.Group();
  private ghostSig = '';
  private seed = 0;
  private frameNo = 0;
  private known: Record<string, number> = {};
  private knownList: KnownVein[] = [];
  private veinVer = 0;
  private veinSig = '';
  private veinIso = new THREE.Group();
  private veinMap = new THREE.Group();
  /** Pollution per chunk (sim stats) + overlay meshes. */
  private pl: Record<string, number> = {};
  private plSig = '';
  private ovMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  private pollIso = new THREE.Mesh(new THREE.BufferGeometry(), this.ovMat);
  private pollMap = new THREE.Mesh(new THREE.BufferGeometry(), this.ovMat);
  private pipeMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false }));
  private pipeSig = '';

  // iso
  private iso = new THREE.Scene();
  private isoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 2000);
  private terrain = new THREE.Group();
  private chunks = new Map<string, ChunkEntry>();
  private chunkSig = '';
  private hemi = new THREE.HemisphereLight(0xdfe8ff, 0x403a30, 1);
  private sun = new THREE.DirectionalLight(0xffffff, 1.5);
  private grid = new THREE.GridHelper(160, 160, 0x8090a0, 0x8090a0);
  private rain: THREE.LineSegments;
  private rainBase: Float32Array;
  private ray = new THREE.Raycaster();

  // map + globe
  private mapScene = new THREE.Scene();
  private mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 1000);
  private globeScene = new THREE.Scene();
  private globeCam = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  private globe?: THREE.Mesh;
  private mapMeshes: THREE.Mesh[] = [];
  private marker = new THREE.Mesh(new THREE.RingGeometry(10, 16, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  private mapTex?: THREE.DataTexture;
  private mapLoading = false;

  // input
  private pointers = new Map<number, { x: number; y: number }>();
  private drag?: { grab?: THREE.Vector3; x: number; y: number; sx: number; sy: number; t: number; moved: boolean };
  private pinch = 0;
  private keys = new Set<string>();
  private last = performance.now();
  private saveT = 0;

  constructor(private canvas: HTMLCanvasElement, private sim: SimClient) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.iso.add(this.terrain, this.hemi, this.sun, this.sun.target);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.25;
    this.iso.add(this.grid, this.structs, this.structsGlass, this.ghostMesh, this.multiGhost, this.sel);
    {
      const box = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0xffd040, transparent: true, depthTest: false }));
      const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.12, depthWrite: false }));
      edges.renderOrder = 10; this.sel.add(fill, edges); this.sel.visible = false;
    }
    this.structs.frustumCulled = this.structsGlass.frustumCulled = this.ghostMesh.frustumCulled = this.multiGhost.frustumCulled = false;

    const N = 2500;
    this.rainBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.rainBase.set([Math.random(), Math.random(), Math.random()], i * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8c0d8, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false;
    this.iso.add(this.rain);

    this.mapScene.background = new THREE.Color(0x0b0f16);
    this.mapScene.add(this.marker, this.veinMap);
    this.iso.add(this.veinIso, this.pollIso, this.pipeMesh);
    this.mapScene.add(this.pollMap);
    for (const o of [this.pollIso, this.pollMap, this.pipeMesh]) { o.frustumCulled = false; o.renderOrder = 6; }
    this.globeScene.background = new THREE.Color(0x05070c);
    this.globeScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const gl = new THREE.DirectionalLight(0xffffff, 1.2);
    this.globeCam.add(gl);
    gl.position.set(-1, 1, 1);
    this.globeScene.add(this.globeCam);

    this.bindInput();
    addEventListener('resize', this.resize);
    this.resize();
    requestAnimationFrame(this.frame);
  }

  // ---------- world ----------
  setWorld(s: GameState) {
    this.p = planet(s.planet);
    this.gen = worldGen(s.seed, this.p);
    this.diffs = s.diffs;
    this.ents = s.ents;
    this.base = s.base;
    this.structVer++;
    this.known = { ...s.veins };
    this.veinVer++;
    if (this.seed !== s.seed) {
      this.seed = s.seed;
      this.clearChunks();
      this.disposeMap();
      let saved: Partial<View> | null = null;
      try { saved = JSON.parse(localStorage.getItem(`view:${s.seed}`) ?? 'null'); } catch { /* ignore */ }
      Object.assign(this.view, { mode: 'iso', x: s.spawn.x + 0.5, y: s.spawn.y + 0.5, zoom: 24, rot: 0, level: 0 }, saved ?? {});
      if (this.view.mode !== 'iso') this.ensureMap();
    }
    this.emit();
  }

  private emit() { this.onView?.({ ...this.view }); }

  setLevel(l: number) { this.view.level = clamp(Math.round(l), LEVEL_MIN, LEVEL_MAX); this.emit(); }
  rotate(d: number) { this.view.rot = mod(this.view.rot + d, 4); this.emit(); }
  toggleXray() { this.view.xray = !this.view.xray; this.emit(); }
  toggleVeins() { this.view.veins = !this.view.veins; this.emit(); }
  togglePipes() { this.view.pipes = !this.view.pipes; this.emit(); }
  togglePoll() { this.view.poll = !this.view.poll; this.emit(); }
  /** Pollution per chunk from sim stats. */
  setPollution(pl: Record<string, number> = {}) { this.pl = pl; }
  /** Pollution at the camera's chunk. */
  get pollHere() { return this.pl[`${Math.floor(mod(this.view.x, this.p.w) / POLL_CH)},${Math.floor(this.view.y / POLL_CH)}`] ?? 0; }

  private updatePoll(mesh: THREE.Mesh, y: number, R: number, on: boolean) {
    mesh.visible = on;
    if (!on) return;
    const v = this.view, cx = Math.round(v.x / POLL_CH) * POLL_CH, cy = Math.round(v.y / POLL_CH) * POLL_CH;
    const sig = `${JSON.stringify(this.pl)}|${cx},${cy}|${y}|${R}|${mesh === this.pollIso}`;
    if (sig === this.plSig) return;
    this.plSig = sig;
    mesh.geometry.dispose(); mesh.geometry = pollGeometry(this.pl, this.p.w, cx, cy, R, y);
  }

  private updatePipes() {
    const v = this.view, on = !!v.pipes;
    this.pipeMesh.visible = on;
    if (!on) return;
    const R = Math.ceil(Math.max(48, v.zoom * 2.5) / 16) * 16, cx = Math.round(v.x / 16) * 16, cy = Math.round(v.y / 16) * 16;
    const sig = `${this.structVer}|${cx},${cy},${R}`;
    if (sig === this.pipeSig) return;
    this.pipeSig = sig;
    this.pipeMesh.geometry.dispose(); this.pipeMesh.geometry = pipeGeometry(this.ents, this.p.w, cx, cy, R);
  }
  /** Centre the local view on a tile. */
  flyTo(x: number, y: number) { Object.assign(this.view, { mode: 'iso', x: x + 0.5, y: y + 0.5 }); this.onHover?.(null); this.emit(); }
  get world() { return this.gen; }
  get veinList() { return this.knownList; }
  /** Apply vein knowledge raised by the sim. */
  applyVeins(patch: Record<string, number>) { Object.assign(this.known, patch); this.veinVer++; }

  private updateVeins(group: THREE.Group, layer: number | null, y: number, scale: number) {
    const v = this.view;
    const sig = `${this.veinVer}|${v.veins}|${layer}|${scale}|${group === this.veinIso}`;
    if (sig !== this.veinSig) {
      this.veinSig = sig;
      this.knownList = knownVeins(this.gen!, this.known);
      disposeOverlay(this.veinIso); disposeOverlay(this.veinMap);
      const objs = v.veins ? buildVeinOverlay(this.knownList, layer, scale) : [];
      if (objs.length) group.add(...objs);
    }
    const w = this.p.w;
    for (const o of group.children) o.position.set(v.x + mod(o.userData.x - v.x + w / 2, w) - w / 2, y, o.userData.y);
  }
  setMode(m: Mode) {
    const v = this.view;
    if (m === v.mode) return;
    if (m !== 'iso') this.ensureMap();
    if (m === 'map') v.mapZoom = clamp(v.mapZoom, 220, this.mapMax);
    v.mode = m;
    this.onHover?.(null);
    this.emit();
  }
  private get mapMax() { return this.p.h * 0.6; }

  /** Apply world diff changes from the sim and rebuild the touched chunks (and neighbours sharing an edge). */
  applyChanges(ch: Record<string, number>) {
    const ncx = Math.ceil(this.p.w / CH), drop = new Set<string>();
    for (const [k, b] of Object.entries(ch)) {
      this.diffs[k] = b;
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) drop.add(`${mod(Math.floor((x + dx) / CH), ncx)},${Math.floor((y + dy) / CH)}`);
    }
    for (const k of drop) { const e = this.chunks.get(k); if (e) { disposeChunk(e.g); this.terrain.remove(e.g); this.chunks.delete(k); } }
  }

  /** Apply structure / base part changes from the sim. */
  applyBuild(ents?: Record<string, Ent | null>, base?: Record<string, number | null>) {
    for (const [k, e] of Object.entries(ents ?? {})) if (e) this.ents[k] = e; else delete this.ents[k];
    for (const [k, b] of Object.entries(base ?? {})) if (b) this.base[k] = b; else delete this.base[k];
    this.structVer++;
  }

  /** Machine statuses from sim stats (status icons). */
  setStatuses(ms: Record<string, number> = {}) {
    const sig = JSON.stringify(ms);
    if (sig !== this.msSig) { this.msSig = sig; this.ms = ms; this.structVer++; }
  }
  /** Ghost casings for an incomplete multiblock (keys → structure id). */
  setGhosts(g: Record<string, string>) {
    if (JSON.stringify(g) !== JSON.stringify(this.ghosts)) { this.ghosts = g; this.structVer++; }
  }
  /** Highlight the machine whose panel is open (null clears). */
  setSelected(key: string | null) { this.selKey = key; }
  get entities() { return this.ents; }
  get width() { return this.p.w; }

  private updateStructs() {
    const v = this.view, R = Math.ceil(Math.max(48, v.zoom * 2.5) / 16) * 16;
    const cx = Math.round(v.x / 16) * 16, cy = Math.round(v.y / 16) * 16, zoomedOut = v.zoom >= 30, baseMode = this.act === 'base';
    const sig = `${this.structVer}|${v.level}|${v.rot}|${baseMode}|${zoomedOut}|${cx},${cy},${R}`;
    const show = v.level >= 0;
    this.structs.visible = this.structsGlass.visible = this.multiGhost.visible = show;
    if (!show || sig === this.structSig) return;
    this.structSig = sig;
    const [a, b, c] = buildStructs({ ents: this.ents, base: this.base, w: this.p.w, cx, cy, radius: R, top: v.level, rot: v.rot, baseMode, zoomedOut, ms: this.ms, ghosts: this.ghosts });
    this.multiGhost.geometry.dispose(); this.multiGhost.geometry = c;
    this.structs.geometry.dispose(); this.structs.geometry = a;
    this.structsGlass.geometry.dispose(); this.structsGlass.geometry = b;
  }

  /** Ghost height: structures stack on what's already in the storey. */
  private ghostY(x: number, y: number) {
    const base = Math.max(0, this.view.level) * STOREY;
    if (this.ghost?.kind !== 'struct') return base;
    const top = topInStorey(this.ents, mod(x, this.p.w), y, Math.max(0, this.view.level));
    return top ? +top.split(',')[2] + 1 : base;
  }

  private updateGhost() {
    const v = this.view, c = this.cursor, g = this.ghost;
    const on = !!(c && g && v.level >= 0 && (this.act === 'build' || this.act === 'base' || this.act === 'demolish'));
    this.ghostMesh.visible = on;
    if (!on) return;
    const side = g!.kind === 'base' ? nearSide(c!.fx, c!.fy) : '';
    const sig = JSON.stringify(g) + side;
    if (sig !== this.ghostSig) {
      this.ghostSig = sig;
      this.ghostMesh.geometry.dispose();
      this.ghostMesh.geometry = ghostGeometry(g!.kind === 'base' ? { kind: 'base', part: g!.part, side } : g!);
    }
    const wx = v.x + mod(c!.x - v.x + this.p.w / 2, this.p.w) - this.p.w / 2;
    this.ghostMesh.position.set(Math.floor(wx), this.ghostY(c!.x, c!.y) + 0.01, c!.y);
  }

  private updateSelected(now: number) {
    const k = this.selKey, e = k ? this.ents[k] : undefined;
    this.sel.visible = !!e && this.view.level >= 0;
    if (!e || !this.sel.visible) return;
    const [x, y, b] = k!.split(',').map(Number), st = STRUCT.get(e.s);
    let x0 = 0, x1 = 1, y0 = 0, y1 = 1, b1 = 1;
    for (const { c: [dx, dy, db] } of st?.multi ? multiCells(st, e.r) : []) {
      x0 = Math.min(x0, dx); x1 = Math.max(x1, dx + 1); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy + 1); b1 = Math.max(b1, db + 1);
    }
    const v = this.view, wx = v.x + mod(x - v.x + this.p.w / 2, this.p.w) - this.p.w / 2, pad = 0.06;
    this.sel.position.set(Math.floor(wx) + x0 - pad, b - pad, y + y0 - pad);
    this.sel.scale.set(x1 - x0 + 2 * pad, b1 + 2 * pad, y1 - y0 + 2 * pad);
    const pulse = 0.55 + 0.45 * Math.sin(now / 250);
    ((this.sel.children[1] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = pulse;
    ((this.sel.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.1 * pulse;
  }

  // ---------- chunks ----------
  private clearChunks() {
    for (const e of this.chunks.values()) { disposeChunk(e.g); this.terrain.remove(e.g); }
    this.chunks.clear();
  }

  /** Free chunk meshes not on screen for KEEP_FRAMES (also runs in map/globe, so leaving iso releases them). */
  private evictChunks() {
    for (const [k, e] of this.chunks) if (this.frameNo - e.used > KEEP_FRAMES) { disposeChunk(e.g); this.terrain.remove(e.g); this.chunks.delete(k); }
  }

  private updateChunks() {
    const gen = this.gen!, v = this.view;
    const lvl = Math.min(v.level, 0);
    const sig = `${lvl}|${v.xray}`;
    if (sig !== this.chunkSig) { this.clearChunks(); this.chunkSig = sig; }
    const ys = Math.min(v.level, 0) as number;
    // Viewport footprint on the ground plane: a quad (a rhombus-ish shape in iso). Only chunks overlapping it are built.
    const quad: { x: number; z: number }[] = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const g = this.groundAt(a, b, ys);
      if (g) quad.push({ x: g.x, z: g.z });
    }
    if (quad.length < 4) return;
    const x0 = Math.min(...quad.map((q) => q.x)), x1 = Math.max(...quad.map((q) => q.x));
    const z0 = Math.min(...quad.map((q) => q.z)), z1 = Math.max(...quad.map((q) => q.z));
    const ncx = Math.ceil(gen.w / CH), ncy = Math.ceil(gen.h / CH);
    const want: { cx: number; cy: number; d: number }[] = [];
    for (let cy = Math.max(0, Math.floor(z0 / CH)); cy <= Math.min(ncy - 1, Math.floor(z1 / CH)); cy++)
      for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++)
        if (rectInQuad(cx * CH - CULL_PAD, cy * CH - CULL_PAD, (cx + 1) * CH + CULL_PAD, (cy + 1) * CH + CULL_PAD, quad))
          want.push({ cx, cy, d: Math.hypot((cx + 0.5) * CH - v.x, (cy + 0.5) * CH - v.y) });
    want.sort((a, b) => a.d - b.d);
    for (const e of this.chunks.values()) e.g.visible = false;
    const t0 = performance.now();
    for (const { cx, cy } of want) {
      const cxw = mod(cx, ncx), key = `${cxw},${cy}`;
      let e = this.chunks.get(key);
      if (!e) {
        if (performance.now() - t0 > 8) continue; // build budget per frame
        e = { g: buildChunk(gen, cxw, cy, { level: lvl, xray: v.xray, diffs: this.diffs }), used: 0 };
        this.chunks.set(key, e);
        this.terrain.add(e.g);
      }
      e.used = this.frameNo;
      e.g.visible = true;
      e.g.position.set(Math.floor(cx / ncx) * gen.w + cxw * CH, ys, cy * CH);
    }
    if (this.chunks.size > MAX_CACHE) {
      const old = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, this.chunks.size - MAX_CACHE);
      for (const [k, e] of old) { disposeChunk(e.g); this.terrain.remove(e.g); this.chunks.delete(k); }
    }
  }

  // ---------- cameras ----------
  private aspect = 1;
  private resize = () => {
    const w = innerWidth, h = innerHeight;
    this.aspect = w / h;
    this.r.setSize(w, h, false);
    this.globeCam.aspect = this.aspect;
    this.globeCam.updateProjectionMatrix();
  };

  private updateIsoCam() {
    const v = this.view, c = this.isoCam, a = this.aspect;
    const th = Math.PI / 4 + v.rot * (Math.PI / 2), ly = this.levelY, D = 500;
    c.left = -v.zoom * a; c.right = v.zoom * a; c.top = v.zoom; c.bottom = -v.zoom;
    c.position.set(v.x + D * Math.cos(ELEV) * Math.sin(th), ly + D * Math.sin(ELEV), v.y + D * Math.cos(ELEV) * Math.cos(th));
    c.lookAt(v.x, ly, v.y);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  private updateMapCam() {
    const v = this.view, c = this.mapCam, a = this.aspect, z = v.mapZoom;
    c.left = -z * a; c.right = z * a; c.top = z; c.bottom = -z;
    c.position.set(v.x, 100, v.y);
    c.up.set(0, 0, -1);
    c.lookAt(v.x, 0, v.y);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    this.marker.position.set(v.x, 1, v.y);
    this.marker.scale.setScalar(z / 400);
    const w = this.p.w;
    this.mapMeshes.forEach((m, i) => m.position.set(w / 2 + (Math.round(v.x / w) - 1 + i) * w, 0, this.p.h / 2));
  }

  private updateGlobeCam() {
    const v = this.view, phi = (v.x / this.p.w) * Math.PI * 2, th = clamp((v.y / this.p.h) * Math.PI, 0.05, Math.PI - 0.05); // keep off the pole: lookAt degenerates there
    const d = new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    this.globeCam.position.copy(d.multiplyScalar(v.globeDist));
    this.globeCam.up.set(0, 1, 0);
    this.globeCam.lookAt(0, 0, 0);
    this.globeCam.updateMatrixWorld();
  }

  /** Ground point (plane y = ly) under NDC coords in iso view. */
  /** Render Y of the view level's ground plane (storeys are STOREY blocks tall; below ground 1 per layer). */
  private get levelY() { return this.view.level > 0 ? this.view.level * STOREY : this.view.level; }

  private groundAt(nx: number, ny: number, ly = this.levelY): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.isoCam);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ly), out);
  }

  private ndc(px: number, py: number) {
    const r = this.canvas.getBoundingClientRect();
    return [((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1] as const;
  }

  // ---------- map texture ----------
  private ensureMap() {
    if (this.mapTex || this.mapLoading || !this.gen) return;
    this.mapLoading = true;
    const gen = this.gen, pw = Math.min(1024, gen.w), ph = Math.round(pw / 2);
    void planetMap(gen, pw, ph).then((px) => {
      this.mapLoading = false;
      if (gen !== this.gen) return;
      const tex = new THREE.DataTexture(px, pw, ph, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, -1); tex.offset.set(0, 1); // row 0 = north
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      this.mapTex = tex;
      const geo = new THREE.PlaneGeometry(gen.w, gen.h).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      this.mapMeshes = [0, 1, 2].map(() => { const m = new THREE.Mesh(geo, mat); this.mapScene.add(m); return m; });
      // Globe gets its own mipmapped, linearly filtered copy: nearest sampling shimmers where texels crowd near the poles.
      const gt = new THREE.DataTexture(px, pw, ph, THREE.RGBAFormat);
      gt.wrapS = THREE.RepeatWrapping; gt.flipY = false;
      gt.colorSpace = THREE.SRGBColorSpace;
      gt.magFilter = THREE.LinearFilter; gt.minFilter = THREE.LinearMipmapLinearFilter; gt.generateMipmaps = true;
      gt.anisotropy = this.r.capabilities.getMaxAnisotropy();
      gt.repeat.set(1, -1); gt.offset.set(0, 1);
      gt.needsUpdate = true;
      this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), new THREE.MeshLambertMaterial({ map: gt }));
      this.globeScene.add(this.globe);
    });
  }

  private disposeMap() {
    for (const m of this.mapMeshes) this.mapScene.remove(m);
    if (this.mapMeshes[0]) { this.mapMeshes[0].geometry.dispose(); (this.mapMeshes[0].material as THREE.Material).dispose(); }
    this.mapMeshes = [];
    if (this.globe) { const gm = this.globe.material as THREE.MeshLambertMaterial; this.globeScene.remove(this.globe); this.globe.geometry.dispose(); gm.map?.dispose(); gm.dispose(); this.globe = undefined; }
    this.mapTex?.dispose();
    this.mapTex = undefined;
  }

  // ---------- frame ----------
  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameNo++;
    if (!this.gen) return;
    this.evictChunks();
    this.keyPan(dt);
    const v = this.view;
    v.x = mod(v.x, this.p.w);
    if (v.mode === 'iso') {
      v.y = clamp(v.y, 0, this.p.h);
      this.updateIsoCam();
      this.updateChunks();
      this.updateSky(now, dt);
      this.updateStructs();
      this.updateGhost();
      this.updateSelected(now);
      this.updateVeins(this.veinIso, Math.max(0, -v.level), Math.min(v.level, 0) + 0.04, 1);
      this.updatePoll(this.pollIso, this.levelY + 0.06, Math.max(64, v.zoom * 3), !!v.poll);
      this.updatePipes();
      this.grid.visible = v.level > 0;
      if (this.grid.visible) this.grid.position.set(Math.round(v.x), this.levelY, Math.round(v.y));
      this.r.render(this.iso, this.isoCam);
    } else if (v.mode === 'map') {
      this.updateMapCam();
      this.updateVeins(this.veinMap, null, 2, 2 ** Math.round(Math.log2(v.mapZoom / 80)));
      this.updatePoll(this.pollMap, 1.5, v.mapZoom * 2, !!v.poll);
      this.r.render(this.mapScene, this.mapCam);
    } else {
      this.updateGlobeCam();
      this.r.render(this.globeScene, this.globeCam);
    }
    if (now - this.saveT > 1000) {
      this.saveT = now;
      try { localStorage.setItem(`view:${this.seed}`, JSON.stringify(v)); } catch { /* ignore */ }
    }
  };

  private updateSky(now: number, dt: number) {
    const st = this.sim.stats, v = this.view;
    const tick = st.tick + (st.paused ? 0 : Math.min(TPS, ((now - this.sim.statsAt) / 1000) * TPS));
    const f = timeOfDay(tick), a = (f - 0.25) * Math.PI * 2; // 0 at sunrise
    const elev = Math.sin(a), day = clamp(elev * 4 + 0.3, 0, 1), rain = st.rain;
    const under = v.level < 0;
    const light = under ? 0.9 : day;
    this.sun.intensity = under ? 0.8 : Math.max(0, day) * 1.6 * (1 - rain * 0.55);
    this.sun.position.set(v.x + Math.cos(a) * 100, Math.max(5, Math.abs(elev) * 100), v.y + 40);
    this.sun.target.position.set(v.x, 0, v.y);
    this.sun.color.setHSL(0.1, elev < 0.25 ? 0.6 : 0.1, 0.6 + Math.min(elev, 0.4));
    this.hemi.intensity = 0.35 + light * 0.75;
    this.hemi.color.setRGB(0.6 + light * 0.3, 0.68 + light * 0.25, 1);
    const sky = new THREE.Color(under ? 0x0d0c10 : 0x0a1020).lerp(new THREE.Color(under ? 0x0d0c10 : rain > 0.3 ? 0x6a7682 : 0x8fb3d4), under ? 0 : day);
    // Pollution haze (P3e): browns the sky and light above HAZE, strongest at 2× SMOG.
    const haze = under ? 0 : clamp((this.pollHere - HAZE) / (SMOG * 2 - HAZE), 0, 0.7);
    if (haze > 0) { sky.lerp(new THREE.Color(0x8a7650), haze); this.hemi.color.lerp(new THREE.Color(0xc0a070), haze * 0.6); }
    this.iso.background = sky;

    // Rain falls in a box around the camera target; wind slants it.
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = under ? 0 : Math.floor(rain * (pos.count / 2));
    this.rain.geometry.setDrawRange(0, n * 2);
    if (n) {
      const S = v.zoom * 3, Hh = 40, t = now / 1000, wind = st.wind * 0.6, arr = pos.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const bx = this.rainBase[i * 3], by = this.rainBase[i * 3 + 1], bz = this.rainBase[i * 3 + 2];
        const y = mod(by * Hh - t * 30, Hh);
        const x = v.x + (bx - 0.5) * S + y * wind, z = v.y + (bz - 0.5) * S;
        arr.set([x, y, z, x - wind * 0.8, y + 0.8, z], i * 6);
      }
      pos.needsUpdate = true;
    }
    void dt;
  }

  // ---------- input ----------
  private bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        const [nx, ny] = this.ndc(e.clientX, e.clientY);
        this.drag = { grab: this.view.mode === 'iso' ? this.groundAt(nx, ny) ?? undefined : undefined, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
      } else { this.drag = undefined; this.pinch = this.pinchDist(); }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (this.pointers.size >= 2) {
        const d = this.pinchDist();
        if (this.pinch && d) { const [a, b] = [...this.pointers.values()]; this.zoomBy(this.pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2); }
        this.pinch = d;
        return;
      }
      if (this.drag) {
        if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 6) this.drag.moved = true;
        this.panPx(e.clientX, e.clientY);
      } else this.hover(e.clientX, e.clientY);
    });
    const up = (e: PointerEvent) => {
      const d = this.drag;
      this.pointers.delete(e.pointerId);
      if (d && !d.moved && performance.now() - d.t < 500) this.click(e.clientX, e.clientY);
      this.drag = undefined;
      if (this.pointers.size < 2) this.pinch = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { if (!this.pointers.size) { this.onHover?.(null); this.cursor = null; } });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyQ': this.rotate(-1); break;
        case 'KeyE': this.rotate(1); break;
        case 'PageUp': case 'BracketRight': this.setLevel(this.view.level + 1); break;
        case 'PageDown': case 'BracketLeft': this.setLevel(this.view.level - 1); break;
        case 'KeyM': this.setMode(this.view.mode === 'map' ? 'iso' : 'map'); break;
        case 'KeyG': this.setMode(this.view.mode === 'globe' ? 'iso' : 'globe'); break;
        case 'Equal': case 'NumpadAdd': this.zoomBy(0.8); break;
        case 'Minus': case 'NumpadSubtract': this.zoomBy(1.25); break;
      }
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  private pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private keyPan(dt: number) {
    const k = this.keys, v = this.view;
    let r = 0, f = 0;
    if (k.has('KeyD') || k.has('ArrowRight')) r++;
    if (k.has('KeyA') || k.has('ArrowLeft')) r--;
    if (k.has('KeyW') || k.has('ArrowUp')) f++;
    if (k.has('KeyS') || k.has('ArrowDown')) f--;
    if (!r && !f) return;
    this.onPan?.();
    if (v.mode === 'iso') {
      const th = Math.PI / 4 + v.rot * (Math.PI / 2), sp = v.zoom * 1.5 * dt;
      v.x += (Math.cos(th) * r - Math.sin(th) * f) * sp;
      v.y += (-Math.sin(th) * r - Math.cos(th) * f) * sp;
    } else if (v.mode === 'map') {
      v.x += r * v.mapZoom * dt; v.y = clamp(v.y - f * v.mapZoom * dt, 0, this.p.h);
    } else {
      v.x -= r * this.p.w * 0.15 * dt; v.y = clamp(v.y - f * this.p.h * 0.3 * dt, this.p.h * 0.02, this.p.h * 0.98);
    }
  }

  private panPx(px: number, py: number) {
    const v = this.view, d = this.drag!;
    const dx = px - d.x, dy = py - d.y;
    d.x = px; d.y = py;
    if (v.mode === 'iso') {
      if (!d.grab) return;
      this.updateIsoCam();
      const [nx, ny] = this.ndc(px, py);
      const g = this.groundAt(nx, ny);
      if (!g) return;
      v.x += d.grab.x - g.x; v.y = clamp(v.y + d.grab.z - g.z, 0, this.p.h);
      this.onPan?.();
    } else if (v.mode === 'map') {
      const upp = (2 * v.mapZoom) / this.canvas.clientHeight;
      v.x -= dx * upp; v.y = clamp(v.y - dy * upp, 0, this.p.h);
    } else {
      const k = (v.globeDist - 1) * 0.0016;
      v.x -= dx * k * this.p.w * 0.5; v.y = clamp(v.y - dy * k * this.p.h, this.p.h * 0.02, this.p.h * 0.98);
    }
  }

  /** f > 1 zooms out. Past the iso/map limits it switches level of detail (iso → map → globe). */
  zoomBy(f: number, px = innerWidth / 2, py = innerHeight / 2) {
    const v = this.view;
    if (v.mode === 'iso') {
      if (f > 1 && v.zoom >= ISO_ZOOM[1]) { this.setMode('map'); v.mapZoom = 220; return; }
      const [nx, ny] = this.ndc(px, py);
      this.updateIsoCam();
      const before = this.groundAt(nx, ny);
      v.zoom = clamp(v.zoom * f, ISO_ZOOM[0], ISO_ZOOM[1]);
      this.updateIsoCam();
      const after = this.groundAt(nx, ny);
      if (before && after) { v.x += before.x - after.x; v.y = clamp(v.y + before.z - after.z, 0, this.p.h); }
    } else if (v.mode === 'map') {
      if (f < 1 && v.mapZoom <= 220) { this.setMode('iso'); v.zoom = ISO_ZOOM[1]; return; }
      if (f > 1 && v.mapZoom >= this.mapMax) { this.setMode('globe'); v.globeDist = GLOBE_ENTER; return; }
      v.mapZoom = clamp(v.mapZoom * f, 220, this.mapMax);
    } else {
      if (f < 1 && v.globeDist <= GLOBE_DIST[0]) { this.setMode('map'); v.mapZoom = this.mapMax; return; }
      v.globeDist = clamp(1 + (v.globeDist - 1) * f, GLOBE_DIST[0], GLOBE_DIST[1]);
    }
    this.emit();
  }

  /** Tile under a screen point (any mode). */
  private tileAt(px: number, py: number): { x: number; y: number; fx?: number; fy?: number } | null {
    const [nx, ny] = this.ndc(px, py), v = this.view;
    if (v.mode === 'iso') {
      const g = this.groundAt(nx, ny);
      return g ? { x: mod(Math.floor(g.x), this.p.w), y: Math.floor(g.z), fx: g.x - Math.floor(g.x), fy: g.z - Math.floor(g.z) } : null;
    }
    if (v.mode === 'map') {
      this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.mapCam);
      const g = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      return g ? { x: mod(Math.floor(g.x), this.p.w), y: Math.floor(g.z) } : null;
    }
    if (!this.globe) return null;
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.globeCam);
    const hit = this.ray.intersectObject(this.globe)[0];
    return hit?.uv ? { x: Math.floor(hit.uv.x * this.p.w) % this.p.w, y: Math.floor((1 - hit.uv.y) * this.p.h) } : null;
  }

  /** Structure block (`x,y,b`) under a screen point, by raycasting the visible structure mesh. */
  private blockAt(px: number, py: number): string | null {
    const [nx, ny] = this.ndc(px, py);
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.isoCam);
    for (const h of this.ray.intersectObject(this.structs)) {
      const n = h.face?.normal, p = h.point.clone().addScaledVector(n ?? new THREE.Vector3(), -0.01);
      const x = mod(Math.floor(p.x), this.p.w), y = Math.floor(p.z), b = Math.floor(p.y);
      // Floor slabs lift a block by a few pixels, so its top can poke into the next level.
      for (const bb of [b, b - 1]) if (bb >= 0 && this.ents[`${x},${y},${bb}`]) return `${x},${y},${bb}`;
    }
    return null;
  }

  private click(px: number, py: number) {
    const v = this.view;
    const t = this.tileAt(px, py);
    if (v.mode === 'iso') {
      if (t) this.onTile?.(t.x, t.y, v.level, t.fx ?? 0.5, t.fy ?? 0.5, this.blockAt(px, py) ?? undefined);
      return;
    }
    if (!t || t.y < 0 || t.y >= this.p.h) return;
    v.x = t.x + 0.5; v.y = t.y + 0.5;
    if (v.mode === 'globe') { this.setMode('map'); v.mapZoom = 300; }
    else { this.setMode('iso'); v.zoom = 40; }
  }

  private hover(px: number, py: number) {
    const t = this.tileAt(px, py), gen = this.gen;
    this.cursor = t && gen?.inBounds(t.y) && this.view.mode === 'iso' ? { x: t.x, y: t.y, fx: t.fx ?? 0.5, fy: t.fy ?? 0.5 } : null;
    if (!t || !gen || !gen.inBounds(t.y)) return this.onHover?.(null);
    this.onHover?.(this.describe(t.x, t.y));
  }

  describe(x: number, y: number): string {
    const gen = this.gen!, v = this.view, sf = gen.surface(x, y);
    const lat = (0.5 - (y + 0.5) / gen.h) * 180, lon = ((x + 0.5) / gen.w) * 360 - 180;
    const place = sf.ice ? 'Polar ice cap' : sf.water === Water.Ocean ? `${sf.depth > 8 ? 'Ocean trench' : 'Ocean'}, depth ${sf.depth}` : sf.water === Water.River ? `River (${sf.biome}), depth ${sf.depth}` : sf.water === Water.Lake ? `Lake (${sf.biome}), depth ${sf.depth}` : `${sf.biome[0].toUpperCase()}${sf.biome.slice(1)}${sf.volcanic ? ', volcanic' : ''}`;
    const head = `${x}, ${y} · ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'} · ${place}`;
    if (v.mode !== 'iso') return head;
    if (v.level > 0) { const tk = topInStorey(this.ents, x, y, v.level), e = tk ? this.ents[tk] : undefined; return `${head}\nStorey ${v.level}${e ? ` · ${STRUCT.get(e.s)?.name ?? e.s}` : this.base[`${x},${y},${v.level},f`] ? ' · Floor' : ''}`; }
    const z = Math.max(0, -v.level);
    const tk0 = z === 0 ? topInStorey(this.ents, x, y, 0) : null, ent = tk0 ? this.ents[tk0] : undefined;
    if (ent) return `${head}\n${STRUCT.get(ent.s)?.name ?? ent.s}`;
    let b = this.diffs[`${x},${y},${z}`];
    let extra = '';
    if (b === undefined) {
      if (v.xray && z > 0) { const o = gen.ore(x, y, z); if (o) extra = ` · ${o.vein.def.name} vein, ${o.richness}/block`; }
      const open = (xx: number, yy: number, zz: number) => this.diffs[`${gen.wrapX(xx)},${yy},${zz}`] === B.air;
      const shown = v.xray || z === 0 || open(x, y, z - 1) || open(x - 1, y, z) || open(x + 1, y, z) || open(x, y - 1, z) || open(x, y + 1, z);
      b = shown ? gen.block(x, y, z, sf) : gen.terrain(x, y, z, sf);
    }
    if (z === 0 && this.diffs[`${x},${y},s`] === undefined) { const smp = gen.sample(x, y, sf); if (smp) extra += ` · ${mineralName(smp.mineral)} sample`; }
    for (const k of veinsAtTile(gen, this.knownList, x, y)) extra += k.level === 1 ? ` · ${k.v.def.name} hint` : ` · ${k.v.def.name} vein (layers ${k.v.z0}–${k.v.z1})`;
    const tree = z === 0 ? gen.tree(x, y, sf) : Tree.None;
    const treeName = ['', ' · Tree', ' · Conifer', ' · Rubber tree', ' · Cactus'][tree];
    return `${head}\nLayer ${z}: ${BLOCKS[b].name}${isOre(b) ? '' : ''}${treeName}${extra}`;
  }
}
