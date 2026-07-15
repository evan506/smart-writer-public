export function ConfirmAllModal({
  confirmAllCount,
  confirmableEntityCount,
  relationSuggestionCount,
  mergeSuggestionCount,
  onClose,
  onConfirm,
}: {
  confirmAllCount: number;
  confirmableEntityCount: number;
  relationSuggestionCount: number;
  mergeSuggestionCount: number;
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
          {confirmAllCount}개의 항목을 모두 기억합니다
        </h3>
        <p style={{ fontSize: "12px", color: "var(--sw-text-muted)", lineHeight: 1.6, margin: "0 0 16px" }}>
          별칭/호칭 후보는 작가가 대상을 직접 확인해야 하므로 자동으로 기억하지 않습니다. 본문은 바뀌지 않습니다.
        </p>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {confirmableEntityCount > 0 && (
            <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "4px", background: "rgba(125,211,168,0.1)", color: "var(--sw-accent)", fontWeight: 700 }}>
              설정 {confirmableEntityCount}개
            </span>
          )}
          {relationSuggestionCount > 0 && (
            <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "4px", background: "rgba(182, 134, 42, 0.12)", color: "var(--sw-warning)", fontWeight: 700 }}>
              관계 {relationSuggestionCount}개
            </span>
          )}
          {mergeSuggestionCount > 0 && (
            <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "4px", background: "var(--sw-bg-raised)", color: "var(--sw-text-secondary)", fontWeight: 700 }}>
              대상 선택 {mergeSuggestionCount}개
            </span>
          )}
        </div>
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
            모두 기억
          </button>
        </div>
      </div>
    </div>
  );
}
