import type { PlanningBlockKind } from "@/types";

// V3.3 matrix rows are restricted to cross-cutting narrative card kinds.
// ROOT is structurally rejected by the DB trigger; CHARACTER_PLAN / PLACE_PLAN
// are intentionally excluded from V3.3 and kept as future auxiliary-context
// candidates. This allowlist is enforced again in the server action so it can
// be relaxed later without a migration.
export const PLOT_THREAD_ROW_KINDS = [
  "EPISODE",
  "CHAPTER",
  "SCENE",
  "EVENT",
  "PROMISE",
] as const satisfies ReadonlyArray<Exclude<PlanningBlockKind, "ROOT">>;

export type PlotThreadRowKind = (typeof PLOT_THREAD_ROW_KINDS)[number];

export function isPlotThreadRowKind(
  kind: string
): kind is PlotThreadRowKind {
  return (PLOT_THREAD_ROW_KINDS as ReadonlyArray<string>).includes(kind);
}

// Cell signal — author manual link vs. existing evidence are shown in parallel,
// never synthesized into a single "truth" state. There is no automatic
// "review/drift" cell in V3.3.
export type PlotThreadCellSignal =
  | "empty"
  | "manual"
  | "evidence"
  | "manual+evidence";

export const PLOT_THREAD_SIGNAL_LABELS: Record<PlotThreadCellSignal, string> = {
  empty: "연결 없음",
  manual: "작가 연결",
  evidence: "원문 근거",
  "manual+evidence": "작가 연결 · 원문 근거",
};

export const PLOT_THREAD_LEGEND: ReadonlyArray<{
  signal: Exclude<PlotThreadCellSignal, "manual+evidence">;
  label: string;
  description: string;
}> = [
  {
    signal: "manual",
    label: "작가 연결",
    description: "작가가 회차를 직접 연결했습니다.",
  },
  {
    signal: "evidence",
    label: "원문 근거",
    description: "연결한 작품 기억의 원문 근거가 있습니다.",
  },
  {
    signal: "empty",
    label: "연결 없음",
    description: "표시할 연결이나 근거가 없습니다. 오류가 아닙니다.",
  },
];

// Korean UI vocabulary. Forbidden words (일치 / 실패 / 자동 확인 / AI 판단) are
// intentionally absent.
export const PLOT_THREAD_COPY = {
  sectionEyebrow: "플롯 스레드",
  matrixTitle: "플롯 스레드 × 회차",
  summaryRowLabel: "스레드 연결 회차",
  newThread: "플롯 스레드 추가",
  emptyThreads:
    "플롯 스레드는 작가가 이름과 범위를 정합니다. 먼저 스레드를 추가한 뒤 구상 카드와 회차를 연결하세요.",
  emptyLinks:
    "이 스레드에 연결된 구상 카드가 아직 없습니다. 구상 카드를 연결하면 행으로 표시됩니다.",
  emptyEvidenceCell:
    "이 칸에는 표시할 연결이나 원문 근거가 없습니다. 불일치나 오류를 뜻하지 않습니다.",
  showAllChapters: "전체 회차 보기",
  showSignalChapters: "연결·근거 회차만",
  boundaryNotice:
    "플롯 스레드 보기는 탐색용입니다. 원고나 작품 기억을 자동으로 바꾸지 않습니다.",
} as const;
