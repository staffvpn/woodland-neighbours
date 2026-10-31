import { useState } from "react";
import { apiPost } from "../api/client";

const SHAPES: { shape: 1 | 2 | 3; label: string }[] = [
  { shape: 1, label: "Домик 1" },
  { shape: 2, label: "Домик 2" },
  { shape: 3, label: "Домик 3" },
];

interface PlaceHouseDrawerProps {
  onPlaced: () => void;
}

export function PlaceHouseDrawer({ onPlaced }: PlaceHouseDrawerProps) {
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function place(shape: 1 | 2 | 3) {
    setPlacing(true);
    setError(null);
    try {
      await apiPost("/houses/place", { shape });
      onPlaced();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось поставить дом");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 30 }}>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#1e2a1a",
          padding: 20,
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#fff", marginTop: 0 }}>Выберите свой дом</h2>
        {error && <p style={{ color: "#f28b82" }}>{error}</p>}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {SHAPES.map(({ shape, label }) => (
            <button
              key={shape}
              disabled={placing}
              onClick={() => place(shape)}
              style={{ padding: "14px 20px", borderRadius: 10, fontSize: 15 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
