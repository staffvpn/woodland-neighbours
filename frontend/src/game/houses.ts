import * as THREE from "three";
import { apiGet, type HouseDTO, type PlacedItemDTO } from "../api/client";
import { computePathSegments, type Point } from "./paths";
import { attachActivityVisuals } from "./activityVisuals";

const textureLoader = new THREE.TextureLoader();
const wallTexture = textureLoader.load("/src/assets/textures/wood-wall.svg");
wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(2, 2);

const roofTextures: Record<1 | 2 | 3, THREE.Texture> = {
  1: textureLoader.load("/src/assets/textures/roof-shingle-1.svg"),
  2: textureLoader.load("/src/assets/textures/roof-shingle-2.svg"),
  3: textureLoader.load("/src/assets/textures/roof-shingle-3.svg"),
};

export function buildHouse(shape: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();

  const wallGeometry = new THREE.BoxGeometry(2.4, 1.8, 2.4);
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
  const walls = new THREE.Mesh(wallGeometry, wallMaterial);
  walls.position.y = 0.9;
  walls.castShadow = true;
  group.add(walls);

  const roofGeometry = new THREE.ConeGeometry(2.0, shape === 2 ? 1.6 : 1.1, 4);
  const roofMaterial = new THREE.MeshStandardMaterial({ map: roofTextures[shape] });
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
    houseMesh.userData = {
      houseId: house.id,
      ownerTelegramId: house.ownerTelegramId,
      hasSmoke: house.hasSmoke,
      isOvergrown: house.isOvergrown,
    };
    attachActivityVisuals(houseMesh, house.hasSmoke, house.isOvergrown);
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
  const basePathTexture = textureLoader.load("/src/assets/textures/stone-path.svg");
  basePathTexture.wrapS = basePathTexture.wrapT = THREE.RepeatWrapping;

  for (const [from, to] of segments) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);

    const segmentTexture = basePathTexture.clone();
    segmentTexture.needsUpdate = true;
    segmentTexture.repeat.set(1, Math.max(1, length));

    const ribbonGeometry = new THREE.PlaneGeometry(0.8, length);
    const ribbonMaterial = new THREE.MeshStandardMaterial({ map: segmentTexture });
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.rotation.x = -Math.PI / 2;
    ribbon.rotation.z = -Math.atan2(dx, dy);
    ribbon.position.set((from.x + to.x) / 2, 0.03, (from.y + to.y) / 2);
    pathsGroup.add(ribbon);
  }

  scene.add(pathsGroup);
}

export function attachPlacedItemMarkers(houseGroup: THREE.Group, items: PlacedItemDTO[]): void {
  const existing = houseGroup.getObjectByName("placedItems");
  if (existing) houseGroup.remove(existing);

  const group = new THREE.Group();
  group.name = "placedItems";

  items.forEach((item, index) => {
    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshStandardMaterial({ color: "#d9a441" });
    const marker = new THREE.Mesh(geometry, material);
    const angle = (index / Math.max(items.length, 1)) * Math.PI * 2;
    marker.position.set(Math.cos(angle) * 1.6, 0.15, Math.sin(angle) * 1.6 + 1.5);
    marker.userData = { itemType: item.itemType };
    group.add(marker);
  });

  houseGroup.add(group);
}

export async function loadAndRenderPlacedItems(scene: THREE.Scene, houses: HouseDTO[]): Promise<void> {
  const housesGroup = scene.getObjectByName("houses");
  if (!housesGroup) return;

  await Promise.all(
    houses.map(async (house) => {
      const items = await apiGet<PlacedItemDTO[]>(`/houses/${house.id}/items`);
      const houseMesh = housesGroup.children.find((child) => child.userData.houseId === house.id);
      if (houseMesh instanceof THREE.Group) {
        attachPlacedItemMarkers(houseMesh, items);
      }
    }),
  );
}
