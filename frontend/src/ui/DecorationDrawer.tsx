import { useEffect, useState } from "react";
import { apiGet, apiPost, type GiftDTO } from "../api/client";

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
  const [error, setError] = useState<string | null>(null);
  const [gifts, setGifts] = useState<GiftDTO[]>([]);
  const [giftsError, setGiftsError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<GiftDTO[]>(`/houses/${houseId}/gifts`)
      .then(setGifts)
      .catch((err) => setGiftsError(err instanceof Error ? err.message : "Не удалось загрузить подарки"));
  }, [houseId]);

  async function place(itemType: string, slot: number) {
    setPlacing(itemType);
    setError(null);
    try {
      await apiPost(`/houses/${houseId}/items`, { itemType, slot });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось");
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
        {error && <p style={{ color: "#f28b82" }}>{error}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
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

        <h3 style={{ color: "#fff" }}>Подарки у двери</h3>
        {giftsError && <p style={{ color: "#f28b82" }}>{giftsError}</p>}
        {!giftsError && gifts.length === 0 && <p style={{ color: "#cfcfcf" }}>Пока ничего не оставили.</p>}
        <ul style={{ color: "#fff", listStyle: "none", padding: 0, margin: 0 }}>
          {gifts.map((gift) => (
            <li key={gift.id}>{gift.itemType}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
