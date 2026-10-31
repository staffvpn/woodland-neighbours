import { useState } from "react";
import { apiPost } from "../api/client";

const DECORATION_CATALOG = [
  "roof_moss", "porch", "woodpile", "mailbox", "flowerbed", "fence",
  "lantern", "birdhouse", "bench", "well", "stone_path", "windchime",
];

interface DecorationDrawerProps {
  houseId: number;
  onClose: () => void;
}

export function DecorationDrawer({ houseId, onClose }: DecorationDrawerProps) {
  const [placing, setPlacing] = useState<string | null>(null);

  async function place(itemType: string, slot: number) {
    setPlacing(itemType);
    try {
      await apiPost(`/houses/${houseId}/items`, { itemType, slot });
      onClose();
    } finally {
      setPlacing(null);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 20 }} onClick={onClose}>
      <div
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#1e2a1a", padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#fff", marginTop: 0 }}>Украсить дом</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {DECORATION_CATALOG.map((item, index) => (
            <button
              key={item}
              disabled={placing !== null}
              onClick={() => place(item, index)}
              style={{ padding: 10, borderRadius: 8 }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
