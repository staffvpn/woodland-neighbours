import * as THREE from "three";
import type { HouseDTO } from "../api/client";
import { computePathSegments, type Point } from "./paths";

const ROOF_COLORS: Record<1 | 2 | 3, string> = {
  1: "#8b4a2f",
  2: "#5c4a3a",
  3: "#6b3f2e",
};

export function buildHouse(shape: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();

  const wallGeometry = new THREE.BoxGeometry(2.4, 1.8, 2.4);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#c9a876" });
  const walls = new THREE.Mesh(wallGeometry, wallMaterial);
  walls.position.y = 0.9;
  walls.castShadow = true;
  group.add(walls);

  const roofGeometry = new THREE.ConeGeometry(2.0, shape === 2 ? 1.6 : 1.1, 4);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: ROOF_COLORS[shape] });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = shape === 2 ? 2.6 : 2.3;
  roof.castShadow = true;
  group.add(roof);

  const doorGeometry = new THREE.PlaneGeometry(0.6, 1.0);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: "#3d2b1f" });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 0.5, 1.21);
  group.add(door);

  return group;
}

export function renderHouses(scene: THREE.Scene, houses: HouseDTO[]): void {
  const existing = scene.getObjectByName("houses");
  if (existing) scene.remove(existing);

  const housesGroup = new THREE.Group();
  housesGroup.name = "houses";

  for (const house of houses) {
    const houseMesh = buildHouse(house.shape);
    houseMesh.position.set(house.x, 0, house.y);
    houseMesh.userData = { houseId: house.id, hasSmoke: house.hasSmoke, isOvergrown: house.isOvergrown };
    housesGroup.add(houseMesh);
  }

  scene.add(housesGroup);
}

export function renderPaths(scene: THREE.Scene, houses: HouseDTO[]): void {
  const existing = scene.getObjectByName("paths");
  if (existing) scene.remove(existing);

  const campfire: Point = { x: 0, y: 0 };
  const housePoints: Point[] = houses.map((h) => ({ x: h.x, y: h.y }));
  const segments = computePathSegments(housePoints, campfire);

  const pathsGroup = new THREE.Group();
  pathsGroup.name = "paths";
  const material = new THREE.LineBasicMaterial({ color: "#c9b48c" });

  for (const [from, to] of segments) {
    const points = [new THREE.Vector3(from.x, 0.03, from.y), new THREE.Vector3(to.x, 0.03, to.y)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    pathsGroup.add(new THREE.Line(geometry, material));
  }

  scene.add(pathsGroup);
}
