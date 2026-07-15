import { PLANNING_STATUS_LABELS } from "@/lib/planning/constants";
import type { PlanningBlock, PlanningBlockStatus } from "@/types";
import { getPlanningKindLabel } from "./format";

export function PlanningColumn({
  title,
  description,
  cards,
  parent,
  selectedId,
  childrenByParent,
  onSelect,
}: {
  title: string;
  description: string;
  cards: PlanningBlock[];
  parent: PlanningBlock | null;
  selectedId: string | null;
  childrenByParent: Map<string, PlanningBlock[]>;
  onSelect: (block: PlanningBlock) => void;
}) {
  return (
    <section className="rounded-lg border border-sw-border-default bg-sw-bg-elevated p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="mt-1 text-[11px] leading-4 text-sw-text-muted">
            {description}
          </p>
        </div>
        <span className="rounded-full border border-sw-border-default bg-sw-bg-surface px-2 py-1 text-[10px] font-bold text-sw-text-muted">
          {cards.length}
        </span>
      </div>

      <div className="grid gap-2">
        {cards.map((card) => {
          const selected = selectedId === card.id;
          const childrenCount = childrenByParent.get(card.id)?.length ?? 0;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(card)}
              aria-pressed={selected}
              className="relative min-h-[88px] rounded-md border p-3 pl-4 text-left transition hover:border-sw-accent-border hover:bg-sw-accent-bg"
              style={{
                background: selected ? "var(--sw-accent-bg)" : "var(--sw-bg-surface)",
                borderColor: selected
                  ? "var(--sw-accent-border)"
                  : "var(--sw-border-default)",
                boxShadow: selected
                  ? "0 10px 24px rgba(63, 45, 23, 0.1)"
                  : "none",
              }}
            >
              {selected && (
                <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-sw-accent" />
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-sw-accent">
                  {getPlanningKindLabel(card)}
                </span>
                {selected && (
                  <span className="rounded-full border border-sw-accent-border px-1.5 py-0.5 text-[10px] font-bold text-sw-accent">
                    선택됨
                  </span>
                )}
              </div>
              <p className="truncate text-sm font-bold">{card.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-sw-text-muted">
                {card.summary || "아직 짧은 설명이 없습니다."}
              </p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-sw-text-ghost">
                <span>{PLANNING_STATUS_LABELS[card.status as PlanningBlockStatus]}</span>
                <span>하위 {childrenCount}</span>
              </div>
            </button>
          );
        })}

        {cards.length === 0 && (
          <div className="rounded-md border border-dashed border-sw-border-default bg-sw-bg-surface px-3 py-4 text-xs leading-5 text-sw-text-muted">
            {parent
              ? `${parent.title} 아래에 아직 구체화 카드가 없습니다. 오른쪽 패널에서 필요한 만큼만 추가하세요.`
              : "기본 4블록을 불러오지 못했습니다."}
          </div>
        )}
      </div>
    </section>
  );
}
