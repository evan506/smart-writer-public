import { Search, X } from "lucide-react";

export function CodexPanelSearch({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="relative shrink-0">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2"
        style={{ color: "var(--sw-text-muted)" }}
      />
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="인물, 장소, 설정 검색..."
        className="h-[30px] w-full rounded-md pl-7 pr-3 text-xs outline-none transition-colors"
        style={{
          background: "var(--sw-bg-raised)",
          border: "1px solid var(--sw-border-default)",
          color: "var(--sw-text-primary)",
        }}
      />
      {search && (
        <button
          onClick={() => onSearchChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2"
          style={{ color: "var(--sw-text-muted)" }}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
