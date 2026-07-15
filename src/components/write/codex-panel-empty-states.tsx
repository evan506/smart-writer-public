import { BookOpen, Loader2 } from "lucide-react";

export function CodexLoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2
        className="size-5 animate-spin"
        style={{ color: "var(--sw-text-muted)" }}
      />
    </div>
  );
}

export function CodexEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
      <BookOpen
        className="size-10"
        style={{ color: "var(--sw-text-muted)", opacity: 0.4 }}
      />
      <p className="text-sm" style={{ color: "var(--sw-text-muted)" }}>
        아직 작가 승인된 작품 기억이 없습니다.
      </p>
      <p
        className="text-xs"
        style={{ color: "var(--sw-text-muted)", opacity: 0.7 }}
      >
        [확인] 탭에서 원문 근거를 확인하고 승인하면 여기에 쌓입니다.
      </p>
    </div>
  );
}
