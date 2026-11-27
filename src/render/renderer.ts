// World renderer (DESIGN §3/§8): iso chunk view ⇄ region map ⇄ 3D globe. Camera pan/zoom/4-way rotate, Z-level,
// day/night lighting, rain. Reads sim stats for time/weather; world is generated locally from seed + diffs.
import * as THREE from 'three';
import { planet, type PlanetDef } from '../data/planets';
import type { SimClient } from '../sim/client';
import { TPS, timeOfDay, type GameState } from '../sim/state';
import { BLOCKS, isOre } from '../world/blocks';
import { LAYERS, Tree, Water, worldGen, type WorldGen } from '../world/gen';
import { planetMap } from '../world/map';
import { buildChunk, CH, disposeChunk } from './chunks';

export type Mode = 'iso' | 'map' | 'globe';
export interface View { mode: Mode; x: number; y: number; zoom: number; rot: number; level: number; xray: boolean; mapZoom: number; globeDist: number }

export const LEVEL_MIN = -LAYERS.bedrock, LEVEL_MAX = 8;
const ISO_ZOOM: [number, number] = [5, 110];
const GLOBE_DIST: [number, number] = [1.6, 6];
const GLOBE_ENTER = 3.8; // whole planet in view when zooming out of the map
const ELEV = Math.atan(1 / Math.SQRT2);
const MAX_CACHE = 400;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface ChunkEntry { g: THREE.Group; used: number }

export class Renderer {
  view: View = { mode: 'iso', x: 0, y: 0, zoom: 24, rot: 0, level: 0, xray: false, mapZoom: 400, globeDist: 2.6 };
  onView?: (v: View) => void;
  onHover?: (text: string | null) => void;

  private r: THREE.WebGLRenderer;
  private gen?: WorldGen;
  private p: PlanetDef = planet('earth');
  private diffs: Record<string, number> = {};
  private seed = 0;
  private frameNo = 0;

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
    this.iso.add(this.grid);

    const N = 2500;
    this.rainBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.rainBase.set([Math.random(), Math.random(), Math.random()], i * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8c0d8, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false;
    this.iso.add(this.rain);

    this.mapScene.background = new THREE.Color(0x0b0f16);
    this.mapScene.add(this.marker);
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

  // ---------- chunks ----------
  private clearChunks() {
    for (const e of this.chunks.values()) { disposeChunk(e.g); this.terrain.remove(e.g); }
    this.chunks.clear();
  }

  private updateChunks() {
    const gen = this.gen!, v = this.view;
    const lvl = Math.min(v.level, 0);
    const sig = `${lvl}|${v.xray}`;
    if (sig !== this.chunkSig) { this.clearChunks(); this.chunkSig = sig; }
    const ys = Math.min(v.level, 0) as number;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const g = this.groundAt(a, b, ys);
      if (!g) continue;
      x0 = Math.min(x0, g.x); x1 = Math.max(x1, g.x); z0 = Math.min(z0, g.z); z1 = Math.max(z1, g.z);
    }
    if (!isFinite(x0)) return;
    const ncx = Math.ceil(gen.w / CH), ncy = Math.ceil(gen.h / CH);
    const want: { cx: number; cy: number; d: number }[] = [];
    for (let cy = Math.max(0, Math.floor(z0 / CH) - 1); cy <= Math.min(ncy - 1, Math.floor(z1 / CH) + 1); cy++)
      for (let cx = Math.floor(x0 / CH) - 1; cx <= Math.floor(x1 / CH) + 1; cx++)
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
    const th = Math.PI / 4 + v.rot * (Math.PI / 2), ly = Math.min(v.level, 0), D = 500;
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
  private groundAt(nx: number, ny: number, ly = Math.min(this.view.level, 0)): THREE.Vector3 | null {
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
    this.keyPan(dt);
    const v = this.view;
    v.x = mod(v.x, this.p.w);
    if (v.mode === 'iso') {
      v.y = clamp(v.y, 0, this.p.h);
      this.updateIsoCam();
      this.updateChunks();
      this.updateSky(now, dt);
      this.grid.visible = v.level > 0;
      if (this.grid.visible) this.grid.position.set(Math.round(v.x), v.level, Math.round(v.y));
      this.r.render(this.iso, this.isoCam);
    } else if (v.mode === 'map') {
      this.updateMapCam();
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
    c.addEventListener('pointerleave', () => { if (!this.pointers.size) this.onHover?.(null); });
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
  private tileAt(px: number, py: number): { x: number; y: number } | null {
    const [nx, ny] = this.ndc(px, py), v = this.view;
    if (v.mode === 'iso') {
      const g = this.groundAt(nx, ny);
      return g ? { x: mod(Math.floor(g.x), this.p.w), y: Math.floor(g.z) } : null;
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

  private click(px: number, py: number) {
    const v = this.view;
    if (v.mode === 'iso') return; // P2: tile actions
    const t = this.tileAt(px, py);
    if (!t || t.y < 0 || t.y >= this.p.h) return;
    v.x = t.x + 0.5; v.y = t.y + 0.5;
    if (v.mode === 'globe') { this.setMode('map'); v.mapZoom = 300; }
    else { this.setMode('iso'); v.zoom = 40; }
  }

  private hover(px: number, py: number) {
    const t = this.tileAt(px, py), gen = this.gen;
    if (!t || !gen || !gen.inBounds(t.y)) return this.onHover?.(null);
    this.onHover?.(this.describe(t.x, t.y));
  }

  describe(x: number, y: number): string {
    const gen = this.gen!, v = this.view, sf = gen.surface(x, y);
    const lat = (0.5 - (y + 0.5) / gen.h) * 180, lon = ((x + 0.5) / gen.w) * 360 - 180;
    const place = sf.ice ? 'Polar ice cap' : sf.water === Water.Ocean ? 'Ocean' : sf.water === Water.River ? `River (${sf.biome})` : sf.water === Water.Lake ? `Lake (${sf.biome})` : `${sf.biome[0].toUpperCase()}${sf.biome.slice(1)}${sf.volcanic ? ', volcanic' : ''}`;
    const head = `${x}, ${y} · ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'} · ${place}`;
    if (v.mode !== 'iso') return head;
    const z = Math.max(0, -v.level);
    let b = this.diffs[`${x},${y},${z}`];
    let extra = '';
    if (b === undefined) {
      if (v.xray && z > 0) { const o = gen.ore(x, y, z); if (o) extra = ` · ${o.vein.def.name} vein, ${o.richness}/block`; }
      b = v.xray ? gen.block(x, y, z, sf) : gen.terrain(x, y, z, sf);
    }
    const tree = z === 0 ? gen.tree(x, y, sf) : Tree.None;
    const treeName = ['', ' · Tree', ' · Conifer', ' · Jungle tree', ' · Cactus'][tree];
    return `${head}\nLayer ${z}: ${BLOCKS[b].name}${isOre(b) ? '' : ''}${treeName}${extra}`;
  }
}
