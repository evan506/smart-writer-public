import { getColor, TYPE_LABELS } from "./constants";
import type { EnrichedEntity } from "./types";

interface CodexEntityCardProps {
  entity: EnrichedEntity;
  isSelected: boolean;
  onClick: () => void;
}

export function CodexEntityCard({ entity, isSelected, onClick }: CodexEntityCardProps) {
  const color = getColor(entity.type);

  return (
    <div
      onClick={onClick}
      className="rounded-[10px] p-3 cursor-pointer transition-all"
      style={(() => {
        const needsAttention = entity.status !== "confirmed" && !isSelected;
        const borderColor = isSelected
          ? "var(--sw-border-focus)"
          : "var(--sw-border-subtle)";
        return {
          animation: "codex-fadeIn 0.25s ease both",
          background: isSelected ? "var(--sw-bg-active)" : "var(--sw-bg-card)",
          borderTop: `1px solid ${borderColor}`,
          borderRight: `1px solid ${borderColor}`,
          borderBottom: `1px solid ${borderColor}`,
          borderLeft: needsAttention
            ? "3px solid var(--sw-warning)"
            : `1px solid ${borderColor}`,
        };
      })()}
    >
      <div className="flex items-center gap-2 mb-[5px]">
        <div
          className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
          style={{ background: `${color}1e`, color }}
        >
          {entity.name[0]}
        </div>
        <div className="text-[13.5px] font-semibold flex-1 truncate" style={{ color: "var(--sw-text-primary)" }}>
          {entity.name}
        </div>
      </div>

      <div
        className="text-[11.5px] leading-[1.45] mb-[6px]"
        style={{
          color: "var(--sw-text-muted)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {entity.summary ?? ""}
      </div>

      <div className="flex gap-1 flex-wrap mb-[6px]">
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
        {entity.status === "confirmed" && (
          <span
            className="text-[9.5px] px-[6px] py-[1px] rounded-[3px] font-semibold"
            style={{ background: "var(--sw-bg-active)", color: "var(--sw-accent)" }}
          >
            저장됨
          </span>
        )}
      </div>

      <div className="flex gap-[10px] text-[10.5px] font-mono" style={{ color: "var(--sw-text-dim)" }}>
        <span>↔{entity.relationCount}</span>
        <span>{entity.firstChapter != null ? `${entity.firstChapter}화` : "—"}</span>
      </div>
    </div>
  );
}
