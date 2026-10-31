import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { getTelegramWebApp } from "./telegram";
export function App() {
    const containerRef = useRef(null);
    useEffect(() => {
        const webApp = getTelegramWebApp();
        webApp?.ready();
        webApp?.expand();
    }, []);
    return _jsx("div", { id: "game-canvas-container", ref: containerRef });
}
