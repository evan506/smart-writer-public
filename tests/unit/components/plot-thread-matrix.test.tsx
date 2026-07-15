import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlotThreadMatrix } from "@/components/planning/plot-thread/plot-thread-matrix";
import { PlotThreadInspector } from "@/components/planning/plot-thread/plot-thread-inspector";
import { PlotThreadMatrixView } from "@/components/planning/plot-thread/plot-thread-matrix-view";
import type {
  PlotThreadCell,
  PlotThreadChapterColumn,
  PlotThreadMatrix as PlotThreadMatrixModel,
} from "@/lib/services/plot-thread/read.service";
import type { SelectedCell } from "@/components/planning/plot-thread/plot-thread-matrix";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(dashboard)/projects/[id]/plot-thread-actions", () => ({
  createPlotThread: vi.fn(),
  updatePlotThread: vi.fn(),
  deletePlotThread: vi.fn(),
  linkThreadToPlanningBlock: vi.fn(),
  unlinkThreadFromPlanningBlock: vi.fn(),
  linkThreadToChapter: vi.fn(),
  unlinkThreadFromChapter: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";

const CHAPTERS: PlotThreadChapterColumn[] = [
  { id: "c1", chapterNum: 1, title: "귀환" },
  { id: "c2", chapterNum: 2, title: "밀서" },
];

function cell(
  chapterId: string,
  overrides: Partial<PlotThreadCell> = {}
): PlotThreadCell {
  return {
    chapterId,
    signal: "empty",
    manual: false,
    evidence: false,
    evidenceCount: 0,
    manualSources: [],
    evidenceSources: [],
    ...overrides,
  };
}

function matrixModel(
  overrides: Partial<PlotThreadMatrixModel> = {}
): PlotThreadMatrixModel {
  return {
    threadId: "t1",
    title: "황태자 암살 음모",
    summary: "궁정의 배후",
    rows: [
      {
        blockId: "b1",
        title: "밀서 발견",
        kind: "EVENT",
        pathLabel: "전개 / 밀서 발견",
        cells: [
          cell("c1"),
          cell("c2", {
            signal: "manual+evidence",
            manual: true,
            evidence: true,
            evidenceCount: 1,
            manualSources: [
              { kind: "card_planned_for", blockId: "b1", blockTitle: "밀서 발견" },
            ],
            evidenceSources: [
              {
                kind: "entity_mention",
                entityId: "e1",
                entityName: "카엘",
                excerpt: "밀서를 발견했다",
                factId: null,
                factValue: null,
              },
            ],
          }),
        ],
      },
    ],
    summaryRow: {
      cells: [
        cell("c1"),
        cell("c2", {
          signal: "manual",
          manual: true,
          manualSources: [
            { kind: "thread_chapter", blockId: null, blockTitle: null },
          ],
        }),
      ],
    },
    signalChapterIds: ["c2"],
    ...overrides,
  };
}

describe("PlotThreadMatrix", () => {
  it("renders summary row, card row, chapter headers, legend, and accessible cell names", () => {
    const html = renderToStaticMarkup(
      <PlotThreadMatrix
        matrix={matrixModel()}
        columns={CHAPTERS}
        totalChapterCount={2}
        showAllChapters
        onToggleShowAll={() => {}}
        selected={null}
        onSelectCell={() => {}}
      />
    );
    // summary row + card row
    expect(html).toContain("스레드 연결 회차");
    expect(html).toContain("밀서 발견");
    expect(html).toContain("전개 / 밀서 발견");
    // column header
    expect(html).toContain("귀환");
    // legend labels
    expect(html).toContain("작가 연결");
    expect(html).toContain("원문 근거");
    expect(html).toContain("연결 없음");
    // accessible cell name carries signal label, never "일치/오류"
    expect(html).toContain("aria-label=\"밀서 발견 2화: 작가 연결 · 원문 근거\"");
    expect(html).not.toContain("일치");
    expect(html).not.toContain("AI 판단");
  });

  it("shows the empty-evidence message when no columns are visible", () => {
    const html = renderToStaticMarkup(
      <PlotThreadMatrix
        matrix={matrixModel()}
        columns={[]}
        totalChapterCount={2}
        showAllChapters={false}
        onToggleShowAll={() => {}}
        selected={null}
        onSelectCell={() => {}}
      />
    );
    expect(html).toContain("불일치나 오류를 뜻하지 않습니다");
  });

  it("shows the no-links message when the thread has no card rows", () => {
    const html = renderToStaticMarkup(
      <PlotThreadMatrix
        matrix={matrixModel({ rows: [] })}
        columns={CHAPTERS}
        totalChapterCount={2}
        showAllChapters
        onToggleShowAll={() => {}}
        selected={null}
        onSelectCell={() => {}}
      />
    );
    expect(html).toContain("연결된 구상 카드가 아직 없습니다");
  });
});

describe("PlotThreadInspector", () => {
  it("prompts to select a cell when nothing is selected", () => {
    const html = renderToStaticMarkup(
      <PlotThreadInspector
        projectId={projectId}
        threadTitle="암살 음모"
        selected={null}
        onSwitchToTree={() => {}}
      />
    );
    expect(html).toContain("칸을 선택하면");
  });

  it("separates manual sources from evidence sources with excerpts and nav links", () => {
    const selected: SelectedCell = {
      rowKey: "b1",
      rowLabel: "밀서 발견",
      chapter: { id: "c2", chapterNum: 2, title: "밀서" },
      cell: cell("c2", {
        signal: "manual+evidence",
        manual: true,
        evidence: true,
        evidenceCount: 1,
        manualSources: [
          { kind: "thread_chapter", blockId: null, blockTitle: null },
          { kind: "card_planned_for", blockId: "b1", blockTitle: "밀서 발견" },
        ],
        evidenceSources: [
          {
            kind: "fact_source",
            entityId: "e1",
            entityName: "카엘",
            excerpt: "밀서 근거",
            factId: "f1",
            factValue: "궁정 정보망과 연결",
          },
        ],
      }),
    };
    const html = renderToStaticMarkup(
      <PlotThreadInspector
        projectId={projectId}
        threadTitle="암살 음모"
        selected={selected}
        onSwitchToTree={() => {}}
      />
    );
    // both manual sources rendered separately (Decision #5)
    expect(html).toContain("스레드에 회차 직접 연결");
    expect(html).toContain("구상 카드 연결: 밀서 발견");
    // evidence with fact value + excerpt
    expect(html).toContain("궁정 정보망과 연결");
    expect(html).toContain("밀서 근거");
    // nav links
    expect(html).toContain(`/projects/${projectId}/write?chapter=c2`);
    expect(html).toContain(`/projects/${projectId}/codex`);
  });
});

describe("PlotThreadMatrixView", () => {
  it("shows the empty-threads guidance and a create form when there are no threads", () => {
    const html = renderToStaticMarkup(
      <PlotThreadMatrixView
        projectId={projectId}
        threads={[]}
        chapters={CHAPTERS}
        matrices={{}}
        linkableBlocks={[]}
        onSwitchToTree={() => {}}
      />
    );
    expect(html).toContain("플롯 스레드는 작가가 이름과 범위를 정합니다");
    expect(html).toContain("플롯 스레드 추가");
  });

  it("lists threads with their connected-chapter counts", () => {
    const html = renderToStaticMarkup(
      <PlotThreadMatrixView
        projectId={projectId}
        threads={[
          {
            id: "t1",
            title: "황태자 암살 음모",
            summary: "궁정의 배후",
            position: 0,
            linkedBlockCount: 1,
            connectedChapterCount: 3,
          },
        ]}
        chapters={CHAPTERS}
        matrices={{ t1: matrixModel() }}
        linkableBlocks={[
          { id: "b9", title: "연회", kind: "SCENE", pathLabel: "전개 / 연회" },
        ]}
        onSwitchToTree={() => {}}
      />
    );
    expect(html).toContain("황태자 암살 음모");
    expect(html).toContain("3회차");
    // linkable card option present in the select
    expect(html).toContain("연회");
  });
});
