export function ResultSummary({
  entitySuggestionCount,
  relationSuggestionCount,
}: {
  entitySuggestionCount: number;
  relationSuggestionCount: number;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "10px",
        background: "var(--sw-bg-elevated)",
        border: "1px solid var(--sw-border-muted)",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 800,
          color: "var(--sw-text-primary)",
          marginBottom: "5px",
        }}
      >
        검토 대기 canon 후보
      </div>
      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
          marginBottom: "6px",
        }}
      >
        <span style={{ fontSize: "10.5px", padding: "3px 7px", borderRadius: "999px", background: "rgba(125,211,168,0.1)", color: "var(--sw-accent)", fontWeight: 700 }}>
          설정 후보 {entitySuggestionCount}개
        </span>
        <span style={{ fontSize: "10.5px", padding: "3px 7px", borderRadius: "999px", background: "rgba(182, 134, 42, 0.12)", color: "var(--sw-warning)", fontWeight: 700 }}>
          관계 후보 {relationSuggestionCount}개
        </span>
      </div>
      <p style={{ fontSize: "10.5px", color: "var(--sw-text-ghost)", lineHeight: 1.55, margin: 0 }}>
        원문 근거를 먼저 보고 작가가 승인한 항목만 Codex canon으로 기억합니다. 본문은 직접 수정하기 전까지 바뀌지 않습니다.
      </p>
    </div>
  );
}
