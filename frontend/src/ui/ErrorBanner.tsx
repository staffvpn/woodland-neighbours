interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        right: 12,
        background: "#5c1f1f",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 8,
        zIndex: 40,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>{message}</span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}
