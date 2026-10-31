import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegram";
import { createGameScene, type GameScene } from "./game/scene";
import { addRiver } from "./game/terrain";
import { scatterForest } from "./game/trees";
import { renderHouses, renderPaths } from "./game/houses";
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

    return () => gameRef.current?.dispose();
  }, []);

  return <div id="game-canvas-container" ref={containerRef} />;
}
