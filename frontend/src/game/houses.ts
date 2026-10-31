import * as THREE from "three";
import { apiGet, type HouseDTO, type PlacedItemDTO } from "../api/client";
import { computePathSegments, type Point } from "./paths";
import { attachActivityVisuals } from "./activityVisuals";
import { disposeObject3D } from "./dispose";
import woodWallUrl from "../assets/textures/wood-wall.svg";
import roofShingle1Url from "../assets/textures/roof-shingle-1.svg";
import roofShingle2Url from "../assets/textures/roof-shingle-2.svg";
import roofShingle3Url from "../assets/textures/roof-shingle-3.svg";
import stonePathUrl from "../assets/textures/stone-path.svg";

const textureLoader = new THREE.TextureLoader();
const wallTexture = textureLoader.load(woodWallUrl);
wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(2, 2);

const roofTextures: Record<1 | 2 | 3, THREE.Texture> = {
  1: textureLoader.load(roofShingle1Url),
  2: textureLoader.load(roofShingle2Url),
  3: textureLoader.load(roofShingle3Url),
};

function createNicknameSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(20, 20, 15, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 28px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2, 0.5, 1);
  sprite.position.set(0, 3.3, 0);
  sprite.name = "nicknameSign";
  return sprite;
}

function attachFollowHighlight(houseGroup: THREE.Group): void {
  const ringGeometry = new THREE.RingGeometry(1.6, 1.85, 24);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#ffd166",
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.name = "followHighlight";
  houseGroup.add(ring);
}

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

export function renderHouses(scene: THREE.Scene, houses: HouseDTO[], followedTelegramIds: number[] = []): void {
  const existing = scene.getObjectByName("houses");
  if (existing) {
    disposeObject3D(existing);
    scene.remove(existing);
  }

  const housesGroup = new THREE.Group();
  housesGroup.name = "houses";
  const followedSet = new Set(followedTelegramIds);

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
    houseMesh.add(createNicknameSprite(house.ownerNickname));
    if (followedSet.has(house.ownerTelegramId)) {
      attachFollowHighlight(houseMesh);
    }
    housesGroup.add(houseMesh);
  }

  scene.add(housesGroup);
}

export function renderPaths(scene: THREE.Scene, houses: HouseDTO[]): void {
  const existing = scene.getObjectByName("paths");
  if (existing) {
    existing.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.map?.dispose();
      }
    });
    disposeObject3D(existing);
    scene.remove(existing);
  }

  const campfire: Point = { x: 0, y: 0 };
  const housePoints: Point[] = houses.map((h) => ({ x: h.x, y: h.y }));
  const segments = computePathSegments(housePoints, campfire);

  const pathsGroup = new THREE.Group();
  pathsGroup.name = "paths";
  const basePathTexture = textureLoader.load(stonePathUrl);
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
  if (existing) {
    disposeObject3D(existing);
    houseGroup.remove(existing);
  }

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
