import * as THREE from "three";

interface OnlineUser {
  telegramId: number;
  nickname: string;
}

export function buildCampfire(scene: THREE.Scene): void {
  const group = new THREE.Group();
  group.name = "campfire";

  const logGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6);
  const logMaterial = new THREE.MeshStandardMaterial({ color: "#5a3d26" });
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(logGeometry, logMaterial);
    const angle = (i / 6) * Math.PI * 2;
    log.position.set(Math.cos(angle) * 0.4, 0.1, Math.sin(angle) * 0.4);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = angle;
    group.add(log);
  }

  const flameGeometry = new THREE.ConeGeometry(0.3, 0.8, 8);
  const flameMaterial = new THREE.MeshBasicMaterial({ color: "#ff8c3b" });
  const flame = new THREE.Mesh(flameGeometry, flameMaterial);
  flame.position.y = 0.5;
  flame.name = "flame";
  group.add(flame);

  const fireLight = new THREE.PointLight(0xff8c3b, 2, 8);
  fireLight.position.y = 0.6;
  group.add(fireLight);

  scene.add(group);
}

export function renderOnlineAvatars(scene: THREE.Scene, online: OnlineUser[]): void {
  const campfire = scene.getObjectByName("campfire");
  if (!campfire) return;

  const existing = campfire.getObjectByName("onlineAvatars");
  if (existing) campfire.remove(existing);

  const avatarsGroup = new THREE.Group();
  avatarsGroup.name = "onlineAvatars";

  const radius = 1.3;
  online.forEach((user, index) => {
    const angle = (index / Math.max(online.length, 1)) * Math.PI * 2;
    const avatarGeometry = new THREE.CapsuleGeometry(0.2, 0.4, 4, 6);
    const avatarMaterial = new THREE.MeshStandardMaterial({ color: "#d9b38c" });
    const avatar = new THREE.Mesh(avatarGeometry, avatarMaterial);
    avatar.position.set(Math.cos(angle) * radius, 0.4, Math.sin(angle) * radius);
    avatar.userData = { telegramId: user.telegramId, nickname: user.nickname };
    avatarsGroup.add(avatar);
  });

  campfire.add(avatarsGroup);
}
