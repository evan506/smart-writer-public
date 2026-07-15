import { CodexDetailPanel } from "./codex-detail-panel";
import { TYPE_LABELS, getTypeColor } from "./codex-panel-constants";
import type { CodexFieldValue, EnrichedEntity } from "./codex-panel-types";

export function CodexEntityList({
  entities,
  selectedEntity,
  typeFilter,
  detailRef,
  isPending,
  onGraphOpen,
  onSelectEntity,
  onCloseDetail,
  onFieldSave,
  onDeleteLink,
  onDeleteEntity,
  onSelectChapter,
}: {
  entities: EnrichedEntity[];
  selectedEntity: EnrichedEntity | null;
  typeFilter: string;
  detailRef: React.RefObject<HTMLDivElement | null>;
  isPending: boolean;
  onGraphOpen: () => void;
  onSelectEntity: (entity: EnrichedEntity | null) => void;
  onCloseDetail: () => void;
  onFieldSave: (entityId: string, field: string, value: CodexFieldValue) => void;
  onDeleteLink: (linkId: string, entityId: string) => void;
  onDeleteEntity: (entityId: string) => void;
  onSelectChapter?: (chapterId: string) => void;
}) {
  return (
    <div
      className="flex-1 overflow-y-auto -mx-2.5 px-2.5 sw-scrollbar-surface"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: "var(--sw-border-hover) var(--sw-bg-surface)",
      }}
    >
      <div className="flex items-center justify-between px-1 py-1.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.5px]"
          style={{ color: "var(--sw-text-muted)" }}
        >
          {typeFilter === "ALL" ? "전체" : TYPE_LABELS[typeFilter] ?? typeFilter}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[9.5px]"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--sw-text-muted)",
              opacity: 0.6,
            }}
          >
            {entities.length}
          </span>
          <button
            onClick={onGraphOpen}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              color: "var(--sw-text-muted)",
              border: "1px solid var(--sw-border-default)",
            }}
            title="관계 미리보기"
          >
            관계 미리보기
          </button>
        </div>
      </div>

      {entities.length === 0 ? (
        <p className="py-8 text-center text-xs" style={{ color: "var(--sw-text-muted)" }}>
          일치하는 항목이 없습니다.
        </p>
      ) : (
        <div className="space-y-px">
          {entities.map((entity) => {
            const typeColor = getTypeColor(entity.type);
            const isActive = entity.id === selectedEntity?.id;
            const initial = entity.name[0] || "?";

            return (
              <div key={entity.id}>
                <button
                  onClick={() => onSelectEntity(isActive ? null : entity)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all"
                  style={{
                    background: isActive ? "var(--sw-accent-bg)" : "transparent",
                  }}
                >
                  <div
                    className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: typeColor.bg, color: typeColor.color }}
                  >
                    {initial}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate text-xs font-semibold"
                        style={{ color: "var(--sw-text-primary)" }}
                      >
                        {entity.name}
                      </span>
                      <span
                        className="shrink-0 rounded-[3px] px-1.5 text-[9px] font-semibold uppercase tracking-[0.2px]"
                        style={{ background: typeColor.bg, color: typeColor.color }}
                      >
                        {TYPE_LABELS[entity.type] ?? entity.type}
                      </span>
                    </div>
                    {entity.summary && !isActive && (
                      <div
                        className="mt-px truncate text-[10px]"
                        style={{ color: "var(--sw-text-muted)" }}
                      >
                        {entity.summary}
                      </div>
                    )}
                  </div>

                  {entity.links.length > 0 && (
                    <span
                      className="shrink-0 text-[10px]"
                      style={{
                        color: "var(--sw-text-muted)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      ↔{entity.links.length}
                    </span>
                  )}

                  <span
                    className="shrink-0 text-[11px] transition-transform"
                    style={{
                      color: "var(--sw-text-muted)",
                      transform: isActive ? "rotate(90deg)" : undefined,
                    }}
                  >
                    ›
                  </span>
                </button>

                {isActive && (
                  <div ref={detailRef}>
                    <CodexDetailPanel
                      entity={entity}
                      onClose={onCloseDetail}
                      onFieldSave={(field, value) => onFieldSave(entity.id, field, value)}
                      onDeleteLink={(linkId) => onDeleteLink(linkId, entity.id)}
                      onDelete={() => onDeleteEntity(entity.id)}
                      onSelectChapter={onSelectChapter}
                      isPending={isPending}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
