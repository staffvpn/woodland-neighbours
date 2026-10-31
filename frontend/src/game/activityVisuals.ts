import * as THREE from "three";

export function attachActivityVisuals(houseGroup: THREE.Group, hasSmoke: boolean, isOvergrown: boolean): void {
  if (hasSmoke) {
    const smokeGeometry = new THREE.SphereGeometry(0.15, 6, 6);
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: "#cfcfcf", transparent: true, opacity: 0.6 });
    const smoke = new THREE.Group();
    smoke.name = "smoke";
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(smokeGeometry, smokeMaterial);
      puff.position.set(0.3, 2.8 + i * 0.4, 0.3);
      puff.scale.setScalar(1 + i * 0.3);
      smoke.add(puff);
    }
    houseGroup.add(smoke);
  }

  if (isOvergrown) {
    const ivyGeometry = new THREE.TorusKnotGeometry(0.5, 0.08, 32, 6);
    const ivyMaterial = new THREE.MeshStandardMaterial({ color: "#3b5e2b" });
    const ivy = new THREE.Mesh(ivyGeometry, ivyMaterial);
    ivy.name = "ivy";
    ivy.position.set(0, 1.0, 1.2);
    houseGroup.add(ivy);
  }
}
