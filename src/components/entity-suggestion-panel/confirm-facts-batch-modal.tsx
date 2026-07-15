export function ConfirmFactsBatchModal({
  count,
  onClose,
  onConfirm,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "360px", padding: "24px", borderRadius: "12px",
          background: "var(--sw-bg-elevated)", border: "1px solid var(--sw-border-default)",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--sw-text-primary)", margin: "0 0 8px" }}>
          설정 {count}개를 모두 저장합니다
        </h3>
        <p style={{ fontSize: "12px", color: "var(--sw-text-muted)", lineHeight: 1.6, margin: "0 0 16px" }}>
          충돌·항목 대기 설정은 직접 확인이 필요해 제외됩니다. 승인하면 출처가 연결된 설정으로 저장됩니다.
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
              background: "var(--sw-bg-raised)", border: "1px solid var(--sw-border-muted)",
              color: "var(--sw-text-muted)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
            }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
              background: "var(--sw-accent)", border: "none",
              color: "#fffaf1", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
            }}
          >
            설정 {count}개 저장
          </button>
        </div>
      </div>
    </div>
  );
}
