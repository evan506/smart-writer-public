import type { ReactNode } from "react";
import { CodexEntityCard } from "./codex-entity-card";
import { CodexEntityRow } from "./codex-entity-row";
import type { EnrichedEntity } from "./types";

interface CodexEntityGroup {
  key: string;
  types: readonly string[];
  label: string;
  color: string;
  entities: EnrichedEntity[];
}

interface CodexEntityListProps {
  filteredEntities: EnrichedEntity[];
  groupedEntities: CodexEntityGroup[];
  viewMode: "list" | "card";
  searchQuery: string;
  typeFilter: string | null;
  statusFilter: "review" | "duplicate" | null;
  selectedEntityId: string | null;
  onEntityClick: (entityId: string) => void;
}

export function CodexEntityList({
  filteredEntities,
  groupedEntities,
  viewMode,
  searchQuery,
  typeFilter,
  statusFilter,
  selectedEntityId,
  onEntityClick,
}: CodexEntityListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-5 min-w-0 sw-scrollbar">
      {filteredEntities.length === 0 ? (
        <div
          className="flex items-center justify-center h-40 text-[13px]"
          style={{ color: "var(--sw-text-ghost)" }}
        >
          {searchQuery || typeFilter || statusFilter
            ? "검색 결과가 없습니다"
            : "아직 작가 승인된 작품 기억이 없습니다. 후보 검토함에서 원문 근거를 확인하고 승인해 주세요."}
        </div>
      ) : (
        groupedEntities.map((group) => (
          <div key={group.key} className="mb-[6px]">
            {viewMode === "list" && (
              <div
                className="flex items-center gap-[10px] px-[10px] pt-[10px] pb-[6px] sticky top-0 z-[1]"
                style={{
                  borderBottom: "1px solid var(--sw-border-subtle)",
                  background: "var(--sw-bg-base)",
                }}
              >
                <div
                  className="flex-1 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-[7px]"
                  style={{ color: "var(--sw-text-dim)" }}
                >
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: group.color }} />
                  {group.label} · {group.entities.length}
                </div>
                <ColHeader width={180} align="left">태그</ColHeader>
                <ColHeader width={50}>관계</ColHeader>
                <ColHeader width={44}>등장</ColHeader>
                <ColHeader width={64}>상태</ColHeader>
              </div>
            )}

            {viewMode === "list" && (
              <div>
                {group.entities.map((entity) => (
                  <CodexEntityRow
                    key={entity.id}
                    entity={entity}
                    isSelected={entity.id === selectedEntityId}
                    onClick={() => onEntityClick(entity.id)}
                  />
                ))}
              </div>
            )}

            {viewMode === "card" && (
              <>
                <div
                  className="flex items-center gap-[7px] px-[10px] pt-[10px] pb-[6px]"
                  style={{ color: "var(--sw-text-ghost)" }}
                >
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: group.color }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {group.label} · {group.entities.length}
                  </span>
                </div>
                <div
                  className="grid gap-2 pt-2"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}
                >
                  {group.entities.map((entity) => (
                    <CodexEntityCard
                      key={entity.id}
                      entity={entity}
                      isSelected={entity.id === selectedEntityId}
                      onClick={() => onEntityClick(entity.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function ColHeader({
  width,
  align = "right",
  children,
}: {
  width: number;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div
      className={`text-[10px] font-medium tracking-wide flex-shrink-0 ${align === "right" ? "text-right" : "text-left"}`}
      style={{ width, color: "var(--sw-text-dim)" }}
    >
      {children}
    </div>
  );
}
