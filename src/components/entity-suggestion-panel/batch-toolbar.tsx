import { CheckCheck, XCircle } from "lucide-react";

export function BatchToolbar({
  isPending,
  onConfirmAll,
  onDismissAll,
}: {
  isPending: boolean;
  onConfirmAll: () => void;
  onDismissAll: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      <button
        onClick={onConfirmAll}
        disabled={isPending}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
          padding: "6px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
          background: "var(--sw-bg-elevated)", border: "1px solid var(--sw-border-default)",
          color: "var(--sw-text-dim)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
          opacity: isPending ? 0.5 : 1,
        }}
      >
        <CheckCheck size={11} /> 모두 기억
      </button>
      <button
        onClick={onDismissAll}
        disabled={isPending}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
          padding: "6px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
          background: "var(--sw-bg-elevated)", border: "1px solid var(--sw-border-default)",
          color: "var(--sw-text-dim)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
          opacity: isPending ? 0.5 : 1,
        }}
      >
        <XCircle size={11} /> 모두 넘기기
      </button>
    </div>
  );
}
