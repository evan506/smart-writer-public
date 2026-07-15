"use client";

import { useMemo } from "react";
import { ChevronDown, Layers3, Link2, Unlink } from "lucide-react";
import type { CodexFact } from "@/lib/services/canon-facts/read.service";
import type { PlanningLinkedEntity } from "@/lib/services/planning/read.service";
import type { PendingAction } from "./types";
import { formatCanonFactLabel, formatEntityType } from "./format";
import { PlanningDropdown } from "./planning-dropdown";

export function LinkedMemorySection({
  selectedIsRoot,
  availableEntities,
  linkedEntities,
  factsByEntityId,
  entityReferenceId,
  setEntityReferenceId,
  isPending,
  pendingAction,
  onLink,
  onUnlink,
}: {
  selectedIsRoot: boolean;
  availableEntities: PlanningLinkedEntity[];
  linkedEntities: PlanningLinkedEntity[];
  factsByEntityId: Record<string, CodexFact[]>;
  entityReferenceId: string;
  setEntityReferenceId: (entityId: string) => void;
  isPending: boolean;
  pendingAction: PendingAction;
  onLink: () => void;
  onUnlink: (entityId: string) => void;
}) {
  const entityDropdownOptions = useMemo(
    () => [
      {
        value: "",
        label:
          availableEntities.length === 0
            ? "연결할 작품 기억이 없습니다"
            : "작품 기억 선택",
        disabled: true,
      },
      ...availableEntities.map((entity) => ({
        value: entity.id,
        label: `${entity.name} · ${formatEntityType(entity.type)}`,
      })),
    ],
    [availableEntities]
  );
  const approvedFactCount = linkedEntities.reduce(
    (count, entity) => count + (factsByEntityId[entity.id]?.length ?? 0),
    0
  );

  return (
    <details className="group rounded-md border border-sw-border-default bg-sw-bg-elevated p-3 shadow-[0_8px_20px_rgba(61,43,22,0.04)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-bold text-sw-text-primary outline-none focus-visible:ring-2 focus-visible:ring-sw-border-focus [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Layers3 className="size-4 text-sw-accent" />
          연결된 작품 기억
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] font-bold text-sw-text-muted">
          {linkedEntities.length > 0
            ? `${linkedEntities.length}개 연결 · 승인 설정 ${approvedFactCount}개`
            : "선택 사항"}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="mt-3 grid gap-3 border-t border-sw-border-subtle pt-3">
        {selectedIsRoot && (
          <p className="rounded-md border border-sw-border-subtle bg-sw-bg-surface px-3 py-2 text-xs leading-5 text-sw-text-muted">
            기본 4블록은 큰 구조를 잡는 영역입니다. 작품 기억 연결은 하위 구상
            카드에서 사용하세요.
          </p>
        )}

        {!selectedIsRoot && linkedEntities.length === 0 && (
          <p className="text-xs leading-5 text-sw-text-muted">
            연결된 작품 기억이 없습니다. 필요한 경우 기존 Codex 항목을 직접
            연결하세요.
          </p>
        )}

        {linkedEntities.map((entity) => {
          const facts = factsByEntityId[entity.id] ?? [];
          return (
            <div
              key={entity.id}
              className="rounded-md border border-sw-accent-border bg-sw-accent-bg p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-sw-accent">
                    <Layers3 className="size-3.5" />
                    작품 기억 연결
                  </div>
                  <p className="truncate text-sm font-bold text-sw-text-primary">
                    {entity.name}
                  </p>
                  <p className="mt-1 text-xs text-sw-text-muted">
                    {formatEntityType(entity.type)}
                    {entity.summary ? ` · ${entity.summary}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onUnlink(entity.id)}
                  disabled={isPending}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-sw-border-default bg-sw-bg-surface px-2 text-xs font-bold text-sw-text-muted hover:border-sw-danger hover:text-sw-danger disabled:opacity-60"
                >
                  <Unlink className="size-3.5" />
                  {pendingAction === "unlink" ? "해제 중" : "해제"}
                </button>
              </div>

              <div className="mt-3 rounded-md border border-sw-border-subtle bg-sw-bg-surface p-3">
                <div className="mb-2 text-[11px] font-bold text-sw-text-muted">
                  승인된 설정
                </div>
                {facts.length === 0 ? (
                  <p className="text-xs leading-5 text-sw-text-muted">
                    아직 이 작품 기억에 연결된 승인 설정이 없습니다.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {facts.slice(0, 4).map((fact) => (
                      <div
                        key={fact.id}
                        className="rounded-md border border-sw-border-subtle bg-sw-bg-elevated px-3 py-2"
                      >
                        <p className="text-xs font-bold text-sw-text-primary">
                          {formatCanonFactLabel(fact)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-sw-text-muted">
                          {fact.value}
                        </p>
                      </div>
                    ))}
                    {facts.length > 4 && (
                      <p className="text-xs font-semibold text-sw-text-muted">
                        외 {facts.length - 4}개 승인 설정이 더 있습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {!selectedIsRoot && (
          <div className="grid gap-2">
            <PlanningDropdown
              ariaLabel="연결할 작품 기억"
              value={entityReferenceId}
              onChange={setEntityReferenceId}
              options={entityDropdownOptions}
              disabled={availableEntities.length === 0 || isPending}
              compact
            />
            <button
              type="button"
              onClick={onLink}
              disabled={!entityReferenceId || isPending}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-sw-border-default bg-sw-bg-surface px-3 text-sm font-bold text-sw-text-primary hover:border-sw-accent-border hover:text-sw-accent disabled:opacity-60"
            >
              <Link2 className="size-4" />
              {pendingAction === "link" ? "연결 중" : "작품 기억 연결"}
            </button>
            <p className="text-xs leading-5 text-sw-text-muted">
              연결은 참조용입니다. 구상, 원고, canon은 자동 변경되지 않습니다.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
