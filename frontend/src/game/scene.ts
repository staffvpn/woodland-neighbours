import * as THREE from "three";

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  dispose: () => void;
}

const FRUSTUM_SIZE = 40;

export function createGameScene(container: HTMLElement): GameScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1a12");

  const aspect = container.clientWidth / container.clientHeight;
  const camera = new THREE.OrthographicCamera(
    (-FRUSTUM_SIZE * aspect) / 2,
    (FRUSTUM_SIZE * aspect) / 2,
    FRUSTUM_SIZE / 2,
    -FRUSTUM_SIZE / 2,
    0.1,
    200,
  );
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff6e0, 1.0);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.name = "sun";
  scene.add(sun);

  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#7a6a3a" });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);

  let isDragging = false;
  let previous = { x: 0, y: 0 };

  function onPointerDown(event: PointerEvent) {
    isDragging = true;
    previous = { x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: PointerEvent) {
    if (!isDragging) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    previous = { x: event.clientX, y: event.clientY };
    camera.position.x -= deltaX * 0.05;
    camera.position.z -= deltaY * 0.05;
    camera.lookAt(camera.position.x - 30, 0, camera.position.z - 30);
  }
  function onPointerUp() {
    isDragging = false;
  }
  function onWheel(event: WheelEvent) {
    const zoomFactor = 1 + event.deltaY * 0.001;
    camera.zoom = Math.min(Math.max(camera.zoom / zoomFactor, 0.5), 3);
    camera.updateProjectionMatrix();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

  function onResize() {
    const newAspect = container.clientWidth / container.clientHeight;
    camera.left = (-FRUSTUM_SIZE * newAspect) / 2;
    camera.right = (FRUSTUM_SIZE * newAspect) / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener("resize", onResize);

  let animationFrame = 0;
  function animate() {
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  }
  animate();

  function dispose() {
    cancelAnimationFrame(animationFrame);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return { scene, camera, renderer, sun, dispose };
}
