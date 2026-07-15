import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assemblePlotThreadMatrices,
  getPlotThreadMatrixData,
  type AssembleThreadMatrixInput,
} from "@/lib/services/plot-thread/read.service";

const listApprovedCodexFactsByEntityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/canon-facts/read.service", () => ({
  listApprovedCodexFactsByEntity: listApprovedCodexFactsByEntityMock,
}));

const CHAPTERS = [
  { id: "c1", chapterNum: 1, title: "1화" },
  { id: "c2", chapterNum: 2, title: "2화" },
  { id: "c3", chapterNum: 3, title: "3화" },
];

function baseInput(
  overrides: Partial<AssembleThreadMatrixInput> = {}
): AssembleThreadMatrixInput {
  return {
    threads: [{ id: "t1", title: "암살 음모", summary: null, position: 0 }],
    chapters: CHAPTERS,
    threadBlocks: [],
    threadChapters: [],
    blocks: [],
    blockPlannedChapters: [],
    blockEntities: [],
    entityChapterEvidence: [],
    entityFactSources: [],
    ...overrides,
  };
}

describe("assemblePlotThreadMatrices", () => {
  it("marks a card-row chapter as manual from its own PLANNED_FOR link", () => {
    const matrices = assemblePlotThreadMatrices(
      baseInput({
        threadBlocks: [{ threadId: "t1", blockId: "b1", position: 0 }],
        blocks: [{ id: "b1", title: "밀서 발견", kind: "EVENT", pathLabel: "전개 / 밀서 발견" }],
        blockPlannedChapters: [{ blockId: "b1", chapterId: "c2" }],
      })
    );
    const row = matrices.t1.rows[0];
    expect(row.cells.map((c) => c.signal)).toEqual(["empty", "manual", "empty"]);
    expect(row.cells[1].manualSources).toEqual([
      { kind: "card_planned_for", blockId: "b1", blockTitle: "밀서 발견" },
    ]);
  });

  it("marks evidence cells from linked entity mentions and fact sources", () => {
    const matrices = assemblePlotThreadMatrices(
      baseInput({
        threadBlocks: [{ threadId: "t1", blockId: "b1", position: 0 }],
        blocks: [{ id: "b1", title: "카엘 의심", kind: "EVENT", pathLabel: "전환 / 카엘 의심" }],
        blockEntities: [{ blockId: "b1", entityId: "e1", entityName: "카엘" }],
        entityChapterEvidence: [
          { entityId: "e1", chapterId: "c1", excerpt: "카엘이 등장했다" },
        ],
        entityFactSources: [
          {
            entityId: "e1",
            chapterId: "c3",
            factId: "f1",
            factValue: "궁정 정보망과 연결",
            excerpt: "밀서 근거",
          },
        ],
      })
    );
    const row = matrices.t1.rows[0];
    expect(row.cells.map((c) => c.signal)).toEqual([
      "evidence",
      "empty",
      "evidence",
    ]);
    expect(row.cells[0].evidenceSources[0]).toMatchObject({
      kind: "entity_mention",
      entityName: "카엘",
      excerpt: "카엘이 등장했다",
    });
    expect(row.cells[2].evidenceSources[0]).toMatchObject({
      kind: "fact_source",
      factValue: "궁정 정보망과 연결",
    });
  });

  it("combines manual + evidence into a single manual+evidence signal", () => {
    const matrices = assemblePlotThreadMatrices(
      baseInput({
        threadBlocks: [{ threadId: "t1", blockId: "b1", position: 0 }],
        blocks: [{ id: "b1", title: "충돌", kind: "SCENE", pathLabel: "전환 / 충돌" }],
        blockPlannedChapters: [{ blockId: "b1", chapterId: "c1" }],
        blockEntities: [{ blockId: "b1", entityId: "e1", entityName: "카엘" }],
        entityChapterEvidence: [
          { entityId: "e1", chapterId: "c1", excerpt: "충돌 장면" },
        ],
      })
    );
    const cell = matrices.t1.rows[0].cells[0];
    expect(cell.signal).toBe("manual+evidence");
    expect(cell.manual).toBe(true);
    expect(cell.evidence).toBe(true);
  });

  it("summary row unions thread-level links and all card PLANNED_FOR with one marker", () => {
    const matrices = assemblePlotThreadMatrices(
      baseInput({
        threadBlocks: [{ threadId: "t1", blockId: "b1", position: 0 }],
        blocks: [{ id: "b1", title: "밀서", kind: "EVENT", pathLabel: "전개 / 밀서" }],
        // card PLANNED_FOR c2; thread-level direct link also to c2 + c3
        blockPlannedChapters: [{ blockId: "b1", chapterId: "c2" }],
        threadChapters: [
          { threadId: "t1", chapterId: "c2" },
          { threadId: "t1", chapterId: "c3" },
        ],
      })
    );
    const summary = matrices.t1.summaryRow.cells;
    expect(summary.map((c) => c.signal)).toEqual(["empty", "manual", "manual"]);
    // c2 has BOTH thread-level and card-level — one manual marker, two sources
    expect(summary[1].manual).toBe(true);
    expect(summary[1].manualSources).toEqual([
      { kind: "thread_chapter", blockId: null, blockTitle: null },
      { kind: "card_planned_for", blockId: "b1", blockTitle: "밀서" },
    ]);
    // summary row never carries evidence
    expect(summary.every((c) => c.evidence === false)).toBe(true);
  });

  it("excludes non-row-kind blocks (ROOT/CHARACTER_PLAN/PLACE_PLAN) from rows", () => {
    const matrices = assemblePlotThreadMatrices(
      baseInput({
        threadBlocks: [
          { threadId: "t1", blockId: "root", position: 0 },
          { threadId: "t1", blockId: "char", position: 1 },
          { threadId: "t1", blockId: "ep", position: 2 },
        ],
        blocks: [
          { id: "root", title: "전개", kind: "ROOT", pathLabel: "전개" },
          { id: "char", title: "주인공", kind: "CHARACTER_PLAN", pathLabel: "주인공" },
          { id: "ep", title: "1막", kind: "EPISODE", pathLabel: "1막" },
        ],
      })
    );
    expect(matrices.t1.rows.map((r) => r.blockId)).toEqual(["ep"]);
  });

  it("reports only signal-bearing chapters and leaves empty cells as empty", () => {
    const matrices = assemblePlotThreadMatrices(
      baseInput({
        threadBlocks: [{ threadId: "t1", blockId: "b1", position: 0 }],
        blocks: [{ id: "b1", title: "사건", kind: "EVENT", pathLabel: "사건" }],
        blockPlannedChapters: [{ blockId: "b1", chapterId: "c2" }],
      })
    );
    expect(matrices.t1.signalChapterIds).toEqual(["c2"]);
    expect(matrices.t1.rows[0].cells[0].signal).toBe("empty");
  });

  it("orders rows by their thread-block position", () => {
    const matrices = assemblePlotThreadMatrices(
      baseInput({
        threadBlocks: [
          { threadId: "t1", blockId: "b2", position: 1 },
          { threadId: "t1", blockId: "b1", position: 0 },
        ],
        blocks: [
          { id: "b1", title: "첫째", kind: "EVENT", pathLabel: "첫째" },
          { id: "b2", title: "둘째", kind: "EVENT", pathLabel: "둘째" },
        ],
      })
    );
    expect(matrices.t1.rows.map((r) => r.blockId)).toEqual(["b1", "b2"]);
  });
});

// ── Fetch-level batching / no-N+1 contract ──────────────────────────────────

interface MockResolver {
  (table: string, filters: Record<string, unknown>): unknown[];
}

function makeSupabase(resolver: MockResolver) {
  const fromCalls: string[] = [];
  const inCalls: Array<{ column: string; values: unknown[] }> = [];

  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      }),
      not: vi.fn(() => chain),
      order: vi.fn(() => chain),
      in: vi.fn((col: string, vals: unknown[]) => {
        inCalls.push({ column: col, values: vals });
        return chain;
      }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: resolver(table, filters), error: null })),
    };
    return chain;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return builder(table);
    }),
  };
  return { supabase, fromCalls, inCalls };
}

describe("getPlotThreadMatrixData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listApprovedCodexFactsByEntityMock.mockResolvedValue({});
  });

  it("short-circuits with no threads without querying links or entities", async () => {
    const { supabase, fromCalls } = makeSupabase((table) =>
      table === "plot_threads" ? [] : []
    );

    const result = await getPlotThreadMatrixData(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      "p1",
      CHAPTERS
    );

    expect(result.threads).toEqual([]);
    expect(result.matrices).toEqual({});
    expect(fromCalls).not.toContain("planning_links");
    expect(fromCalls).not.toContain("entities");
    expect(fromCalls).not.toContain("entity_suggestions");
  });

  it("batches entity/block lookups with .in and never queries per-cell", async () => {
    const resolver: MockResolver = (table, filters) => {
      switch (table) {
        case "plot_threads":
          return [{ id: "t1", title: "암살", summary: null, position: 0 }];
        case "plot_thread_planning_blocks":
          return [
            { plot_thread_id: "t1", planning_block_id: "b1", position: 0 },
          ];
        case "plot_thread_chapters":
          return [{ plot_thread_id: "t1", chapter_id: "c2" }];
        case "planning_blocks":
          return [
            { id: "b1", parent_id: "r1", title: "밀서", kind: "EVENT" },
            { id: "r1", parent_id: null, title: "전개", kind: "ROOT" },
          ];
        case "planning_links":
          if (filters.link_kind === "PLANNED_FOR") {
            return [{ planning_block_id: "b1", target_id: "c2" }];
          }
          return [{ planning_block_id: "b1", target_id: "e1" }];
        case "entities":
          return [{ id: "e1", name: "카엘" }];
        case "entity_suggestions":
          return [
            { matched_entity_id: "e1", chapter_id: "c1", context_snippet: "등장" },
          ];
        default:
          return [];
      }
    };
    const { supabase, fromCalls, inCalls } = makeSupabase(resolver);

    const result = await getPlotThreadMatrixData(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      "p1",
      CHAPTERS
    );

    // path label resolves through parent chain
    expect(result.matrices.t1.rows[0].pathLabel).toBe("전개 / 밀서");
    // b1 evidence at c1 (mention), manual at c2 (planned)
    const cells = result.matrices.t1.rows[0].cells;
    expect(cells[0].signal).toBe("evidence");
    expect(cells[1].signal).toBe("manual");
    // summary row marks c2 (thread-level + card-level union)
    expect(result.matrices.t1.summaryRow.cells[1].manual).toBe(true);
    expect(result.threads[0].connectedChapterCount).toBe(1);

    // No table is queried more than a small fixed number of times (no per-cell).
    const counts = fromCalls.reduce<Record<string, number>>((acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts["entity_suggestions"]).toBe(1);
    expect(counts["entities"]).toBe(1);
    expect(counts["planning_links"]).toBe(2); // chapter + entity link kinds
    // entity/block lookups went through .in (batched)
    expect(inCalls.some((c) => c.column === "id")).toBe(true);
    expect(inCalls.some((c) => c.column === "matched_entity_id")).toBe(true);
  });
});
