import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegram";
import { createGameScene, type GameScene } from "./game/scene";
import { addRiver } from "./game/terrain";

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameScene | null>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();

    if (containerRef.current) {
      gameRef.current = createGameScene(containerRef.current);
      addRiver(gameRef.current.scene);
    }
    return () => gameRef.current?.dispose();
  }, []);

  return <div id="game-canvas-container" ref={containerRef} />;
}
