import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegram";

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();
  }, []);

  return <div id="game-canvas-container" ref={containerRef} />;
}
