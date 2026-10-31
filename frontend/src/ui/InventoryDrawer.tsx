interface InventoryDrawerProps {
  inventory: Record<string, number>;
}

const LABELS: Record<string, string> = {
  branch: "Ветки",
  stone: "Камни",
  mushroom: "Грибы",
  berry: "Ягоды",
};

export function InventoryDrawer({ inventory }: InventoryDrawerProps) {
  return (
    <div style={{ position: "fixed", bottom: 12, left: 12, display: "flex", gap: 8, zIndex: 10 }}>
      {Object.entries(LABELS).map(([type, label]) => (
        <div
          key={type}
          style={{
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {label}: {inventory[type] ?? 0}
        </div>
      ))}
    </div>
  );
}
