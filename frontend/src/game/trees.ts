import * as THREE from "three";
import { disposeObject3D } from "./dispose";

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

export interface ForestCandidate {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

export function generateForestCandidates(seed: number, count: number): ForestCandidate[] {
  const random = mulberry32(seed);
  const candidates: ForestCandidate[] = [];

  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * FOREST_EXTENT * 2;
    const z = (random() - 0.5) * FOREST_EXTENT * 2;
    const rotationY = random() * Math.PI * 2;
    const scale = 0.7 + random() * 0.6;
    candidates.push({ x, z, rotationY, scale });
  }

  return candidates;
}

export function scatterForest(scene: THREE.Scene, clearingRadius: number): void {
  const existingForest = scene.getObjectByName("forest");
  if (existingForest) {
    disposeObject3D(existingForest);
    scene.remove(existingForest);
  }

  const forestGroup = new THREE.Group();
  forestGroup.name = "forest";

  const candidates = generateForestCandidates(SEED, TREE_COUNT + ROCK_COUNT);

  const treeGeometry = new THREE.ConeGeometry(1.2, 3, 8);
  const treeMaterial = new THREE.MeshStandardMaterial({ color: "#6b6b3a" });
  const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, TREE_COUNT);
  treeMesh.castShadow = true;

  const rockGeometry = new THREE.DodecahedronGeometry(0.6);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: "#7d7d7d" });
  const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, ROCK_COUNT);

  const dummy = new THREE.Object3D();
  let treeIndex = 0;
  let rockIndex = 0;

  for (let i = 0; i < candidates.length; i++) {
    const { x, z, rotationY, scale } = candidates[i];
    const distFromCenter = Math.hypot(x, z);

    if (distFromCenter < clearingRadius || isInRiver(x)) continue;

    dummy.position.set(x, 0, z);
    dummy.rotation.y = rotationY;
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
