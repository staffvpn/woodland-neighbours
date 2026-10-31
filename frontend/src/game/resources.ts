import * as THREE from "three";
import type { ResourceNodeDTO } from "../api/client";
import { disposeObject3D } from "./dispose";

const NODE_COLORS: Record<ResourceNodeDTO["type"], string> = {
  branch: "#8a5a32",
  stone: "#9a9a9a",
  mushroom: "#c94f4f",
  berry: "#7a2fae",
};

export function renderResourceNodes(scene: THREE.Scene, nodes: ResourceNodeDTO[]): void {
  const existing = scene.getObjectByName("resourceNodes");
  if (existing) {
    disposeObject3D(existing);
    scene.remove(existing);
  }

  const group = new THREE.Group();
  group.name = "resourceNodes";

  for (const node of nodes) {
    if (!node.available) continue;
    const geometry = new THREE.IcosahedronGeometry(0.3, 0);
    const material = new THREE.MeshStandardMaterial({ color: NODE_COLORS[node.type] });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(node.x, 0.3, node.y);
    mesh.userData = { resourceNodeId: node.id };
    group.add(mesh);
  }

  scene.add(group);
}

export function findResourceNodeIdFromIntersect(
  scene: THREE.Scene,
  hits: THREE.Intersection[],
): number | null {
  const resourceGroup = scene.getObjectByName("resourceNodes");
  if (!resourceGroup) return null;
  for (const hit of hits) {
    if (resourceGroup.children.includes(hit.object) && hit.object.userData.resourceNodeId !== undefined) {
      return hit.object.userData.resourceNodeId as number;
    }
  }
  return null;
}
