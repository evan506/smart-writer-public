import { getTypeColor } from "./codex-panel-constants";
import type { EnrichedEntity } from "./codex-panel-types";

export function CodexRecentEntities({
  entities,
  onSelectEntity,
}: {
  entities: EnrichedEntity[];
  onSelectEntity: (entity: EnrichedEntity) => void;
}) {
  if (entities.length === 0) return null;

  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between px-1 py-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.5px]"
          style={{ color: "var(--sw-text-muted)" }}
        >
          최근 등장
        </span>
        <span
          className="text-[9.5px]"
          style={{
            color: "var(--sw-text-muted)",
            fontFamily: "'JetBrains Mono', monospace",
            opacity: 0.6,
          }}
        >
          이번 화 기준
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 py-1">
        {entities.map((entity) => {
          const typeColor = getTypeColor(entity.type);

          return (
            <button
              key={entity.id}
              onClick={() => onSelectEntity(entity)}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all"
              style={{
                background: "var(--sw-bg-raised)",
                border: "1px solid var(--sw-border-default)",
                color: "var(--sw-text-secondary)",
              }}
            >
              <span className="size-1.5 rounded-full" style={{ background: typeColor.color }} />
              {entity.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
