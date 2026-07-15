export function UsageGuide({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: "10px",
      background: "rgba(125,211,168,0.1)", border: "1px solid rgba(125,211,168,0.2)",
      position: "relative",
    }}>
      <button
        onClick={onDismiss}
        style={{
          position: "absolute", top: "8px", right: "8px",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--sw-text-ghost)", fontSize: "12px", padding: "2px",
          fontFamily: "var(--sw-font-sans)",
        }}
      >
        ✕
      </button>
      <div style={{ fontSize: "11px", color: "var(--sw-accent)", fontWeight: 700, marginBottom: "4px" }}>
        작품 기억 안내
      </div>
      <div style={{ fontSize: "11px", color: "var(--sw-text-muted)", lineHeight: 1.6 }}>
        이번 장면에서 작품 기억으로 남겨둘 만한 표현과 관계입니다.<br />
        새 항목으로 기억하거나 기존 항목의 <b style={{ color: "var(--sw-text-primary)" }}>별칭/호칭</b>으로 저장할 수 있습니다.
      </div>
    </div>
  );
}
