import * as THREE from "three";

export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      child.geometry?.dispose();
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material?.dispose();
      }
    } else if (child instanceof THREE.Sprite) {
      // Sprite textures in this codebase are always per-instance canvas
      // textures (nickname signs), never shared, so disposing the map here
      // is safe — unlike Mesh materials, which may reference shared textures.
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}
