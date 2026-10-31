import * as THREE from "three";

const RIVER_HALF_WIDTH = 3;
const FOREST_EXTENT = 90;
const TREE_COUNT = 600;
const ROCK_COUNT = 80;
const SEED = 1337;

function mulberry32(seed: number) {
  let t = seed;
  return function random() {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isInRiver(x: number): boolean {
  return x > -RIVER_HALF_WIDTH && x < RIVER_HALF_WIDTH;
}

export function scatterForest(scene: THREE.Scene, clearingRadius: number): void {
  const existingForest = scene.getObjectByName("forest");
  if (existingForest) scene.remove(existingForest);

  const forestGroup = new THREE.Group();
  forestGroup.name = "forest";

  const random = mulberry32(SEED);

  const treeGeometry = new THREE.ConeGeometry(1.2, 3, 8);
  const treeMaterial = new THREE.MeshStandardMaterial({ color: "#2f5233" });
  const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, TREE_COUNT);
  treeMesh.castShadow = true;

  const rockGeometry = new THREE.DodecahedronGeometry(0.6);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: "#7d7d7d" });
  const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, ROCK_COUNT);

  const dummy = new THREE.Object3D();
  let treeIndex = 0;
  let rockIndex = 0;

  for (let i = 0; i < TREE_COUNT + ROCK_COUNT; i++) {
    const x = (random() - 0.5) * FOREST_EXTENT * 2;
    const z = (random() - 0.5) * FOREST_EXTENT * 2;
    const distFromCenter = Math.hypot(x, z);

    if (distFromCenter < clearingRadius || isInRiver(x)) continue;

    dummy.position.set(x, 0, z);
    dummy.rotation.y = random() * Math.PI * 2;
    const scale = 0.7 + random() * 0.6;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    if (i < TREE_COUNT && treeIndex < TREE_COUNT) {
      treeMesh.setMatrixAt(treeIndex, dummy.matrix);
      treeIndex++;
    } else if (rockIndex < ROCK_COUNT) {
      rockMesh.setMatrixAt(rockIndex, dummy.matrix);
      rockIndex++;
    }
  }

  treeMesh.count = treeIndex;
  rockMesh.count = rockIndex;
  treeMesh.instanceMatrix.needsUpdate = true;
  rockMesh.instanceMatrix.needsUpdate = true;

  forestGroup.add(treeMesh, rockMesh);
  scene.add(forestGroup);
}
