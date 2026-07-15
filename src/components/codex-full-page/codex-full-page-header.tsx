import type { ReactNode } from "react";
import { Globe, LayoutGrid, List, Plus, Search } from "lucide-react";
import { TYPE_GROUPS } from "./constants";
import type { SortOption } from "./types";

interface CodexFullPageHeaderProps {
  projectTitle: string;
  totalChapters: number;
  unmatchedSuggestionCount: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  typeFilter: string | null;
  onTypeFilterChange: (value: string | null) => void;
  statusFilter: "review" | "duplicate" | null;
  onStatusFilterChange: (value: "review" | "duplicate" | null) => void;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  viewMode: "list" | "card";
  onViewModeChange: (value: "list" | "card") => void;
  totalEntityCount: number;
  filteredEntityCount: number;
  typeCounts: Record<string, number>;
  reviewCount: number;
  duplicateCount: number;
  onGraphOpen: () => void;
  onCreateOpen: () => void;
}

export function CodexFullPageHeader({
  projectTitle,
  totalChapters,
  unmatchedSuggestionCount,
  searchQuery,
  onSearchQueryChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  totalEntityCount,
  filteredEntityCount,
  typeCounts,
  reviewCount,
  duplicateCount,
  onGraphOpen,
  onCreateOpen,
}: CodexFullPageHeaderProps) {
  return (
    <div
      className="flex-shrink-0 px-6 pt-4"
      style={{
        borderBottom: "1px solid var(--sw-border-subtle)",
        background: "var(--sw-bg-surface)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-[10px]">
          <h1 className="text-xl font-bold tracking-tight">작품 기억</h1>
          <span className="text-[11px]" style={{ color: "var(--sw-text-ghost)" }}>
            {projectTitle} · {totalChapters > 0 ? `${totalChapters}화까지의 세계관` : "세계관 관리"}
          </span>
          {unmatchedSuggestionCount > 0 && (
            <span className="text-[11px] font-bold" style={{ color: "var(--sw-warning)" }}>
              확인 필요 {unmatchedSuggestionCount}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button className="codex-btn codex-btn-ghost" onClick={onGraphOpen}>
            <Globe size={12} />
            관계 미리보기
          </button>
          <button className="codex-btn codex-btn-primary" onClick={onCreateOpen}>
            <Plus size={12} />
            항목 추가
          </button>
        </div>
      </div>

      <div className="flex items-center gap-[10px] flex-wrap">
        <div
          className="flex items-center gap-[7px] px-3 py-[6px] rounded-[10px] w-[260px] transition-colors"
          style={{
            background: "var(--sw-bg-card)",
            border: "1px solid var(--sw-border-subtle)",
          }}
        >
          <Search size={13} style={{ color: "var(--sw-text-ghost)" }} />
          <input
            type="text"
            placeholder="인물, 장소, 설정으로 검색..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="bg-transparent border-none outline-none text-[12.5px] w-full"
            style={{ color: "var(--sw-text-primary)" }}
          />
        </div>

        <div className="flex gap-[5px]">
          <FilterChip
            active={typeFilter === null && statusFilter === null}
            onClick={() => {
              onTypeFilterChange(null);
              onStatusFilterChange(null);
            }}
          >
            전체 <ChipCount>{totalEntityCount}</ChipCount>
          </FilterChip>
          {TYPE_GROUPS.map((group) => (
            <FilterChip
              key={group.key}
              active={typeFilter === group.key}
              onClick={() => {
                onTypeFilterChange(typeFilter === group.key ? null : group.key);
                onStatusFilterChange(null);
              }}
            >
              <span
                className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                style={{ background: group.color }}
              />
              {group.label} <ChipCount>{typeCounts[group.key] ?? 0}</ChipCount>
            </FilterChip>
          ))}
        </div>

        <span
          className="w-px h-[18px] flex-shrink-0 mx-[3px]"
          style={{ background: "var(--sw-border-subtle)" }}
        />

        <div className="flex gap-[5px]">
          <button
            onClick={() => {
              onStatusFilterChange(statusFilter === "review" ? null : "review");
              onTypeFilterChange(null);
            }}
            className={`codex-chip ${
              statusFilter === "review"
                ? "codex-chip-review-active"
                : reviewCount > 0
                  ? "codex-chip-review"
                  : ""
            }`}
          >
            {reviewCount > 0 && <span className="codex-pulse-dot" />}
            확인 필요 <ChipCount>{reviewCount}</ChipCount>
          </button>
          <FilterChip
            active={statusFilter === "duplicate"}
            onClick={() => {
              onStatusFilterChange(statusFilter === "duplicate" ? null : "duplicate");
              onTypeFilterChange(null);
            }}
          >
            이름 확인 <ChipCount>{duplicateCount}</ChipCount>
          </FilterChip>
        </div>
      </div>

      <div
        className="flex items-center justify-between mt-[10px] py-[10px]"
        style={{ borderTop: "1px solid var(--sw-border-subtle)" }}
      >
        <div className="flex items-center gap-[14px]">
          <div className="flex items-center gap-[6px]">
            <span className="text-[11px]" style={{ color: "var(--sw-text-ghost)" }}>
              정렬
            </span>
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as SortOption)}
              className="text-[11.5px] px-2 py-[3px] rounded-md cursor-pointer outline-none"
              style={{
                background: "var(--sw-bg-card)",
                border: "1px solid var(--sw-border-subtle)",
                color: "var(--sw-text-muted)",
                fontFamily: "inherit",
              }}
            >
              <option value="relations">관계 많은 순</option>
              <option value="recent">최근 등장순</option>
              <option value="name">이름순 (ㄱ→ㅎ)</option>
              <option value="chapter">첫 등장 화수순</option>
            </select>
          </div>
          <span className="text-[11px] font-mono" style={{ color: "var(--sw-text-ghost)" }}>
            {filteredEntityCount}건 표시
          </span>
        </div>

        <div
          className="flex gap-[2px] p-[2px] rounded-md"
          style={{
            background: "var(--sw-bg-card)",
            border: "1px solid var(--sw-border-subtle)",
          }}
        >
          <ViewToggleBtn active={viewMode === "list"} onClick={() => onViewModeChange("list")}>
            <List size={11} /> 리스트
          </ViewToggleBtn>
          <ViewToggleBtn active={viewMode === "card"} onClick={() => onViewModeChange("card")}>
            <LayoutGrid size={11} /> 카드
          </ViewToggleBtn>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="codex-chip"
      style={
        active
          ? {
              background: "var(--sw-bg-active)",
              borderColor: "var(--sw-border-focus)",
              color: "var(--sw-accent)",
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function ChipCount({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10.5px] opacity-70">{children}</span>;
}

function ViewToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-[10px] py-[3px] rounded text-[11.5px] cursor-pointer border-none transition-all"
      style={{
        background: active ? "var(--sw-bg-active)" : "transparent",
        color: active
          ? "var(--sw-text-primary)"
          : "var(--sw-text-ghost)",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
