import * as THREE from "three";

const RIVER_HALF_WIDTH = 3;

export function addRiver(scene: THREE.Scene): void {
  const geometry = new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2, 200);
  const material = new THREE.MeshStandardMaterial({
    color: "#3a6ea5",
    transparent: true,
    opacity: 0.85,
    metalness: 0.1,
    roughness: 0.2,
  });
  const river = new THREE.Mesh(geometry, material);
  river.rotation.x = -Math.PI / 2;
  river.position.y = 0.02;
  river.name = "river";
  scene.add(river);
}
