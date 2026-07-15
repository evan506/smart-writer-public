export function ConfBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  let label: string;
  let color: string;

  if (pct >= 80) {
    label = "높음";
    color = "var(--sw-success)";
  } else if (pct >= 60) {
    label = "보통";
    color = "var(--sw-warning)";
  } else {
    label = "낮음";
    color = "var(--sw-danger)";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto", flexShrink: 0 }}>
      <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "var(--sw-bg-raised)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "2px" }} />
      </div>
      <span style={{ fontSize: "10px", color, fontWeight: 700 }}>{label}</span>
    </div>
  );
}
