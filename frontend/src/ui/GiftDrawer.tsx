import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";

const GIFT_CATALOG = ["berry_jam", "firewood_bundle", "dried_mushrooms", "wildflowers"];

interface GiftDrawerProps {
  houseId: number;
  targetTelegramId: number;
  onClose: () => void;
}

export function GiftDrawer({ houseId, targetTelegramId, onClose }: GiftDrawerProps) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    apiGet<number[]>("/follows").then((ids) => setIsFollowing(ids.includes(targetTelegramId)));
  }, [targetTelegramId]);

  async function send(itemType: string) {
    setSending(true);
    setError(null);
    try {
      await apiPost(`/houses/${houseId}/gifts`, { itemType });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось");
    } finally {
      setSending(false);
    }
  }

  async function toggleFollow() {
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await apiPost(`/follows/${targetTelegramId}`, undefined, "DELETE");
      } else {
        await apiPost(`/follows/${targetTelegramId}`);
      }
      setIsFollowing(!isFollowing);
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 20 }} onClick={onClose}>
      <div
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#1e2a1a", padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#fff", marginTop: 0 }}>Оставить подарок у двери</h3>
        {error && <p style={{ color: "#f28b82" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {GIFT_CATALOG.map((item) => (
            <button key={item} disabled={sending} onClick={() => send(item)} style={{ padding: 10, borderRadius: 8 }}>
              {item}
            </button>
          ))}
        </div>
        <button disabled={followBusy} onClick={toggleFollow} style={{ padding: "8px 14px", borderRadius: 8 }}>
          {isFollowing ? "Отписаться" : "Подписаться на соседа"}
        </button>
      </div>
    </div>
  );
}
