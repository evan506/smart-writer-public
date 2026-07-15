import { getColor, TYPE_LABELS } from "./constants";
import { CodexStatusBadge } from "./codex-status-badge";
import type { EnrichedEntity } from "./types";

interface CodexEntityRowProps {
  entity: EnrichedEntity;
  isSelected: boolean;
  onClick: () => void;
}

export function CodexEntityRow({ entity, isSelected, onClick }: CodexEntityRowProps) {
  const color = getColor(entity.type);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-[10px] px-[10px] py-[5px] rounded-md cursor-pointer transition-all"
      style={(() => {
        const needsAttention = entity.status !== "confirmed" && !isSelected;
        const borderColor = isSelected
          ? "var(--sw-border-focus)"
          : "transparent";
        return {
          animation: "codex-fadeIn 0.25s ease both",
          borderTop: `1px solid ${borderColor}`,
          borderRight: `1px solid ${borderColor}`,
          borderBottom: `1px solid ${borderColor}`,
          borderLeft: needsAttention
            ? "3px solid var(--sw-warning)"
            : `1px solid ${borderColor}`,
          background: isSelected ? "var(--sw-bg-active)" : undefined,
        };
      })()}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = "var(--sw-bg-hover)";
          e.currentTarget.style.borderTopColor = "var(--sw-border-muted)";
          e.currentTarget.style.borderRightColor = "var(--sw-border-muted)";
          e.currentTarget.style.borderBottomColor = "var(--sw-border-muted)";
          if (entity.status === "confirmed") {
            e.currentTarget.style.borderLeftColor = "var(--sw-border-muted)";
          }
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = "";
          e.currentTarget.style.borderTopColor = "transparent";
          e.currentTarget.style.borderRightColor = "transparent";
          e.currentTarget.style.borderBottomColor = "transparent";
          if (entity.status === "confirmed") {
            e.currentTarget.style.borderLeftColor = "transparent";
          }
        }
      }}
    >
      <div
        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
        style={{ background: `${color}1e`, color }}
      >
        {entity.name[0]}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold leading-tight truncate" style={{ color: "var(--sw-text-primary)" }}>
          {entity.name}
        </div>
        <div className="text-[11px] leading-tight truncate mt-[1px]" style={{ color: "var(--sw-text-muted)" }}>
          {entity.summary ?? ""}
        </div>
      </div>

      <div className="w-[180px] flex gap-1 flex-shrink-0 flex-wrap items-center">
        <span
          className="text-[9.5px] px-[6px] py-[1px] rounded-[3px] font-semibold uppercase"
          style={{ background: `${color}28`, color }}
        >
          {TYPE_LABELS[entity.type] ?? entity.type}
        </span>
        {entity.aliasArray.slice(0, 2).map((alias) => (
          <span
            key={alias}
            className="text-[9.5px] px-[6px] py-[1px] rounded-[3px] font-medium"
            style={{
              background: "var(--sw-bg-raised)",
              color: "var(--sw-text-muted)",
              border: "1px solid var(--sw-border-muted)",
            }}
          >
            {alias}
          </span>
        ))}
        {entity.status === "review" && (
          <span
            className="text-[9.5px] px-[6px] py-[1px] rounded-[3px] font-semibold"
            style={{ background: "rgba(182, 134, 42, 0.14)", color: "var(--sw-warning)" }}
          >
            확인 필요
          </span>
        )}
        {entity.isDuplicate && (
          <span
            className="text-[9.5px] px-[6px] py-[1px] rounded-[3px] font-semibold"
            style={{ background: "rgba(163, 90, 69, 0.12)", color: "var(--sw-danger)" }}
          >
            이름 확인
          </span>
        )}
      </div>

      <div className="w-[50px] text-right text-[11px] font-mono flex-shrink-0" style={{ color: "var(--sw-text-muted)" }}>
        {entity.relationCount}
      </div>

      <div className="w-[44px] text-right text-[11px] font-mono flex-shrink-0" style={{ color: "var(--sw-text-dim)" }}>
        {entity.firstChapter != null ? `${entity.firstChapter}화` : "—"}
      </div>

      <div className="w-[64px] text-right flex-shrink-0">
        <CodexStatusBadge status={entity.status} />
      </div>
    </div>
  );
}
