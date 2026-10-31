import * as THREE from "three";

export interface Character {
  group: THREE.Group;
  update: (deltaSeconds: number) => void;
  walkTo: (target: THREE.Vector3) => void;
}

const WALK_SPEED = 4;

export function createCharacter(scene: THREE.Scene, scarfColor: string): Character {
  const group = new THREE.Group();
  group.name = "character";

  const bodyGeometry = new THREE.CapsuleGeometry(0.35, 0.7, 4, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#e8d3b0" });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  const headGeometry = new THREE.SphereGeometry(0.28, 12, 12);
  const headMaterial = new THREE.MeshStandardMaterial({ color: "#f2c9a0" });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.2;
  head.castShadow = true;
  group.add(head);

  const scarfGeometry = new THREE.TorusGeometry(0.3, 0.08, 8, 16);
  const scarfMaterial = new THREE.MeshStandardMaterial({ color: scarfColor });
  const scarf = new THREE.Mesh(scarfGeometry, scarfMaterial);
  scarf.position.y = 0.95;
  scarf.rotation.x = Math.PI / 2;
  group.add(scarf);

  scene.add(group);

  let target: THREE.Vector3 | null = null;

  function update(deltaSeconds: number) {
    if (!target) return;
    const direction = target.clone().sub(group.position);
    const distance = direction.length();
    if (distance < 0.05) {
      target = null;
      return;
    }
    direction.normalize();
    group.position.addScaledVector(direction, Math.min(WALK_SPEED * deltaSeconds, distance));
    group.rotation.y = Math.atan2(direction.x, direction.z);
  }

  function walkTo(newTarget: THREE.Vector3) {
    target = newTarget;
  }

  return { group, update, walkTo };
}
