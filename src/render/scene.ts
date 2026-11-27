// P0 placeholder renderer: orthographic iso camera + test voxel. World rendering arrives in P1.
import * as THREE from 'three';

export function startRenderer(canvas: HTMLCanvasElement): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1f24);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 10, 3);
  scene.add(sun);

  scene.add(new THREE.GridHelper(32, 32, 0x3a4350, 0x2a3038));
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xc98b3a }));
  box.position.y = 0.5;
  scene.add(box);

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  cam.position.set(10, 10, 10); // true iso: equal axes
  cam.lookAt(0, 0, 0);
  const zoom = 8; // tiles visible vertically / 2

  const resize = () => {
    const w = innerWidth, h = innerHeight, a = w / h;
    renderer.setSize(w, h, false);
    cam.left = -zoom * a; cam.right = zoom * a; cam.top = zoom; cam.bottom = -zoom;
    cam.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  let raf = 0;
  const draw = () => { box.rotation.y += 0.005; renderer.render(scene, cam); raf = requestAnimationFrame(draw); };
  draw();
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); renderer.dispose(); };
}
