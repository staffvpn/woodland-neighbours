import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getTelegramWebApp } from "./telegram";
import { createGameScene, type GameScene } from "./game/scene";
import { addRiver } from "./game/terrain";
import { scatterForest } from "./game/trees";
import { renderHouses, renderPaths } from "./game/houses";
import { createCharacter } from "./game/character";
import { apiGet, type HouseDTO } from "./api/client";

const BASE_RADIUS = 8;
const RADIUS_GROWTH_K = 2.2;

function settlementRadius(houseCount: number): number {
  return BASE_RADIUS + RADIUS_GROWTH_K * Math.sqrt(houseCount);
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameScene | null>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();

    if (!containerRef.current) return;
    gameRef.current = createGameScene(containerRef.current);
    addRiver(gameRef.current.scene);

    apiGet<HouseDTO[]>("/houses").then((houses) => {
      if (!gameRef.current) return;
      scatterForest(gameRef.current.scene, settlementRadius(houses.length));
      renderHouses(gameRef.current.scene, houses);
      renderPaths(gameRef.current.scene, houses);
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
      gameRef.current?.renderer.domElement.removeEventListener("click", onClick);
      gameRef.current?.dispose();
    };
  }, []);

  return <div id="game-canvas-container" ref={containerRef} />;
}
