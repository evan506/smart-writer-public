export function CodexStatusBadge({
  status,
}: {
  status: "confirmed" | "review" | "warning";
}) {
  const config = {
    confirmed: { label: "작가 승인", bg: "var(--sw-bg-active)", color: "var(--sw-accent)" },
    review: { label: "검토 필요", bg: "rgba(182, 134, 42, 0.16)", color: "var(--sw-warning)" },
    warning: { label: "이름 확인", bg: "rgba(163, 90, 69, 0.12)", color: "var(--sw-danger)" },
  }[status];

  return (
    <span
      className="inline-block text-[10px] font-semibold px-2 py-[2px] rounded"
      style={{ background: config.bg, color: config.color }}
    >
      {config.label}
    </span>
  );
}
