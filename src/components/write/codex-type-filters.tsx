import { ENTITY_TYPE_KEYS, TYPE_LABELS, getTypeColor } from "./codex-panel-constants";

export function CodexTypeFilters({
  totalCount,
  typeCounts,
  typeFilter,
  onTypeFilterChange,
}: {
  totalCount: number;
  typeCounts: Record<string, number>;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1">
      <TypeFilterButton
        active={typeFilter === "ALL"}
        label="전체"
        count={totalCount}
        onClick={() => onTypeFilterChange("ALL")}
      />
      {ENTITY_TYPE_KEYS.map((key) => {
        const count = typeCounts[key] ?? 0;
        if (!count) return null;
        const active = typeFilter === key;

        return (
          <TypeFilterButton
            key={key}
            active={active}
            label={TYPE_LABELS[key] ?? key}
            count={count}
            color={getTypeColor(key).color}
            onClick={() => onTypeFilterChange(active ? "ALL" : key)}
          />
        );
      })}
    </div>
  );
}

function TypeFilterButton({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-colors"
      style={{
        background: active ? "var(--sw-accent-bg)" : "transparent",
        border: `1px solid ${
          active ? "var(--sw-accent-border)" : "var(--sw-border-default)"
        }`,
        color: active ? "var(--sw-accent)" : "var(--sw-text-muted)",
      }}
    >
      {color && <span className="size-[5px] rounded-full" style={{ background: color }} />}
      {label}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "9.5px",
          opacity: 0.7,
        }}
      >
        {count}
      </span>
    </button>
  );
}
