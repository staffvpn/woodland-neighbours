import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getTelegramWebApp } from "./telegram";
import { createGameScene, type GameScene } from "./game/scene";
import { addRiver } from "./game/terrain";
import { scatterForest } from "./game/trees";
import { renderHouses, renderPaths, loadAndRenderPlacedItems } from "./game/houses";
import { createCharacter } from "./game/character";
import { renderResourceNodes, findResourceNodeIdFromIntersect } from "./game/resources";
import { InventoryDrawer } from "./ui/InventoryDrawer";
import { DecorationDrawer } from "./ui/DecorationDrawer";
import { GiftDrawer } from "./ui/GiftDrawer";
import { buildCampfire, renderOnlineAvatars } from "./game/campfire";
import { sunState } from "./game/daynight";
import { apiGet, apiPost, type HouseDTO, type ResourceNodeDTO, type UserDTO } from "./api/client";

const BASE_RADIUS = 8;
const RADIUS_GROWTH_K = 2.2;

function settlementRadius(houseCount: number): number {
  return BASE_RADIUS + RADIUS_GROWTH_K * Math.sqrt(houseCount);
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameScene | null>(null);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [currentUser, setCurrentUser] = useState<UserDTO | null>(null);
  const [openHouseId, setOpenHouseId] = useState<number | null>(null);
  const [openHouseOwnerId, setOpenHouseOwnerId] = useState<number | null>(null);
  const loadedHousesRef = useRef<HouseDTO[]>([]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();

    if (!containerRef.current) return;
    gameRef.current = createGameScene(containerRef.current);
    addRiver(gameRef.current.scene);
    buildCampfire(gameRef.current.scene);

    function updateDayNight() {
      if (!gameRef.current) return;
      const state = sunState(new Date());
      gameRef.current.sun.color.set(state.colorHex);
      gameRef.current.sun.intensity = 0.3 + state.intensity * 0.9;
      gameRef.current.sun.position.set(
        20 * Math.cos((state.elevationDeg * Math.PI) / 180),
        Math.max(5, 30 * Math.sin((state.elevationDeg * Math.PI) / 180)),
        10,
      );
      const bg = state.intensity > 0.1 ? "#2e4a24" : "#0b1a12";
      gameRef.current.scene.background = new THREE.Color(bg);
    }
    updateDayNight();
    const dayNightInterval = setInterval(updateDayNight, 60_000);

    function pollOnline() {
      apiGet<{ telegramId: number; nickname: string }[]>("/campfire/online").then((online) => {
        if (gameRef.current) renderOnlineAvatars(gameRef.current.scene, online);
      });
    }
    pollOnline();
    const onlineInterval = setInterval(pollOnline, 20_000);

    apiGet<HouseDTO[]>("/houses").then((houses) => {
      if (!gameRef.current) return;
      scatterForest(gameRef.current.scene, settlementRadius(houses.length));
      renderHouses(gameRef.current.scene, houses);
      renderPaths(gameRef.current.scene, houses);
      loadedHousesRef.current = houses;
      loadAndRenderPlacedItems(gameRef.current.scene, houses);
    });

    apiPost<UserDTO>("/users/ping").then(setCurrentUser);

    apiGet<ResourceNodeDTO[]>("/resources").then((nodes) => {
      if (gameRef.current) renderResourceNodes(gameRef.current.scene, nodes);
    });

    const character = createCharacter(gameRef.current.scene, "#8B4513");
    character.group.position.set(2, 0, 2);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function onClick(event: MouseEvent) {
      if (!gameRef.current) return;
      const rect = gameRef.current.renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, gameRef.current.camera);

      const housesGroup = gameRef.current.scene.getObjectByName("houses");
      const houseHits = housesGroup ? raycaster.intersectObjects(housesGroup.children, true) : [];
      if (houseHits.length > 0) {
        let node: THREE.Object3D | null = houseHits[0].object;
        while (node && node.userData.houseId === undefined) node = node.parent;
        if (node) {
          setOpenHouseId(node.userData.houseId as number);
          setOpenHouseOwnerId(node.userData.ownerTelegramId as number);
        }
        return;
      }

      const resourceGroup = gameRef.current.scene.getObjectByName("resourceNodes");
      const resourceHits = resourceGroup ? raycaster.intersectObjects(resourceGroup.children) : [];
      const nodeId = findResourceNodeIdFromIntersect(gameRef.current.scene, resourceHits);
      if (nodeId !== null) {
        apiPost<{ harvested: string }>(`/resources/${nodeId}/harvest`)
          .then((result) => {
            setInventory((prev) => ({ ...prev, [result.harvested]: (prev[result.harvested] ?? 0) + 1 }));
            if (gameRef.current) {
              apiGet<ResourceNodeDTO[]>("/resources").then((nodes) => renderResourceNodes(gameRef.current!.scene, nodes));
            }
          })
          .catch(() => {});
        return;
      }

      const ground = gameRef.current.scene.getObjectByName("ground");
      if (!ground) return;
      const hits = raycaster.intersectObject(ground);
      if (hits.length > 0) {
        character.walkTo(hits[0].point);
      }
    }
    gameRef.current.renderer.domElement.addEventListener("click", onClick);

    const clock = new THREE.Clock();
    let characterFrame = 0;
    function animateCharacter() {
      character.update(clock.getDelta());
      characterFrame = requestAnimationFrame(animateCharacter);
    }
    animateCharacter();

    return () => {
      cancelAnimationFrame(characterFrame);
      clearInterval(onlineInterval);
      clearInterval(dayNightInterval);
      gameRef.current?.renderer.domElement.removeEventListener("click", onClick);
      gameRef.current?.dispose();
    };
  }, []);

  return (
    <>
      <div id="game-canvas-container" ref={containerRef} />
      <InventoryDrawer inventory={inventory} />
      {openHouseId !== null && currentUser && openHouseOwnerId === currentUser.telegramId && (
        <DecorationDrawer
          houseId={openHouseId}
          onClose={() => {
            setOpenHouseId(null);
            if (gameRef.current) loadAndRenderPlacedItems(gameRef.current.scene, loadedHousesRef.current);
          }}
        />
      )}
      {openHouseId !== null && currentUser && openHouseOwnerId !== null && openHouseOwnerId !== currentUser.telegramId && (
        <GiftDrawer houseId={openHouseId} targetTelegramId={openHouseOwnerId} onClose={() => setOpenHouseId(null)} />
      )}
    </>
  );
}
