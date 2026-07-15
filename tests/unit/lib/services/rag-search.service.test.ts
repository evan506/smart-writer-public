import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

// SearchService and GraphRAGService are classes instantiated with `new`
// inside RAGSearchService's constructor — mock implementations must be
// function-based (not arrow functions) so they work as constructors.
// query-router.ts and qa-keywords.ts are left REAL (pure functions) so the
// mode-selection and snippet-windowing logic under test is genuine.
const searchEntitiesBm25Mock = vi.hoisted(() => vi.fn());
const searchChaptersBm25Mock = vi.hoisted(() => vi.fn());
const matchChunksMock = vi.hoisted(() => vi.fn());
const findRelatedEntitiesMock = vi.hoisted(() => vi.fn());
const embedTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/search.service", () => ({
  SearchService: vi.fn(function () {
    return {
      searchEntitiesBm25: searchEntitiesBm25Mock,
      searchChaptersBm25: searchChaptersBm25Mock,
      matchChunks: matchChunksMock,
    };
  }),
}));

vi.mock("@/lib/services/graph-rag.service", () => ({
  GraphRAGService: vi.fn(function () {
    return { findRelatedEntities: findRelatedEntitiesMock };
  }),
}));

vi.mock("@/lib/services/embedding.service", () => ({
  embedText: embedTextMock,
}));

vi.mock("@/lib/services/llm-usage-logger.service", () => ({
  createLLMUsageLogger: vi.fn(() => vi.fn()),
}));

import { RAGSearchService } from "@/lib/services/rag-search.service";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

/** Short (<=8 char) query — classifyQuery routes this to bm25-only. */
const BM25_ONLY_QUERY = "리엔 위치";

/**
 * Long query containing a GRAPH_KEYWORDS hit ("관계") and no VECTOR_KEYWORDS
 * hit — classifyQuery routes this to graph mode, selectModes -> [graph, bm25].
 */
const GRAPH_QUERY = "리엔과 세력의 관계에 대해 자세히 알려주세요";

/**
 * Long query with no GRAPH_KEYWORDS or VECTOR_KEYWORDS hits — classifyQuery
 * falls through to the default "vector" branch, selectModes -> [vector, bm25].
 */
const VECTOR_QUERY = "주인공이 마지막에 어떤 선택을 하게 되는지 알고 싶어요";

function entityRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "entity-default",
    name: "기본 엔티티",
    type: "CHARACTER",
    description: "기본 설명",
    rank: 0.5,
    settings: null,
    ...overrides,
  };
}

function chapterRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "chapter-default",
    chapter_num: 1,
    title: "1화",
    content: "본문",
    summary: null,
    rank: 0.5,
    ...overrides,
  };
}

function buildService() {
  const { client } = createSupabaseMock({});
  return new RAGSearchService(client as unknown as SupabaseClient<Database>);
}

beforeEach(() => {
  vi.clearAllMocks();
  searchEntitiesBm25Mock.mockResolvedValue([]);
  searchChaptersBm25Mock.mockResolvedValue([]);
  matchChunksMock.mockResolvedValue([]);
  findRelatedEntitiesMock.mockResolvedValue([]);
  embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
});

describe("RAGSearchService.search", () => {
  it("bm25-only mode: maps entities and chapters to RAGResultItem", async () => {
    const filler = "이야기가 계속 이어진다. ".repeat(20); // >400 chars of padding
    searchEntitiesBm25Mock.mockResolvedValue([
      entityRow({
        id: "e1",
        name: "리엔",
        description: "주인공 리엔의 정보",
        rank: 0.9,
      }),
    ]);
    searchChaptersBm25Mock.mockResolvedValue([
      chapterRow({
        id: "c1",
        title: "1화",
        chapter_num: 1,
        content: `${filler}리엔이 위치를 확인했다.${filler}`,
        rank: 0.5,
      }),
    ]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, BM25_ONLY_QUERY);

    expect(result.modesUsed).toEqual(["bm25"]);

    const entityItem = result.items.find((i) => i.type === "entity");
    expect(entityItem).toBeDefined();
    expect(entityItem?.source).toBe("bm25");
    expect(entityItem?.content).toBe("주인공 리엔의 정보"); // entity content = description

    const chapterItem = result.items.find((i) => i.type === "chapter");
    expect(chapterItem).toBeDefined();
    expect(chapterItem?.source).toBe("bm25");
    expect(chapterItem?.content.length).toBeGreaterThan(0);
    expect(chapterItem?.content).toContain("리엔"); // windowed around the keyword hit

    expect(result.classification.mode).toBe("bm25");
    expect(typeof result.classification.confidence).toBe("number");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("dedups an id returned by both graph and bm25 modes, keeping the graph copy", async () => {
    searchEntitiesBm25Mock.mockImplementation(
      async (_projectId: string, _query: string, limit: number) => {
        if (limit === 5) {
          // graph-seed search
          return [entityRow({ id: "seed-1", name: "리엔", rank: 0.9 })];
        }
        // bm25 mode's own entity search — same id as the graph-expanded entity
        return [
          entityRow({
            id: "e1",
            name: "리엔(BM25)",
            description: "리엔 설명",
            rank: 0.6,
          }),
        ];
      }
    );
    findRelatedEntitiesMock.mockResolvedValue([
      {
        entity_id: "e1",
        entity_name: "리엔",
        entity_type: "CHARACTER",
        relation_type: "ALLY",
        path: ["seed-1", "e1"],
        depth: 1,
        cumulative_weight: 0.9,
      },
    ]);
    searchChaptersBm25Mock.mockResolvedValue([]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, GRAPH_QUERY);

    const matches = result.items.filter((i) => i.id === "e1");
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("graph"); // graph mode's item wins (pushed first)
  });

  it("rerank: exact full-query match boost (+0.3) flips a lower-ranked item above a higher-ranked one", async () => {
    const query = "마법검사";
    searchEntitiesBm25Mock.mockResolvedValue([
      entityRow({
        id: "a1",
        name: "이름없음",
        description: "관련없는 내용입니다",
        rank: 1.0, // higher raw score, no match
      }),
      entityRow({
        id: "b1",
        name: "마법검사",
        description: "주인공은 마법검사이다", // contains the exact query string
        rank: 0.7, // lower raw score
      }),
    ]);
    searchChaptersBm25Mock.mockResolvedValue([]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, query);

    expect(result.items[0].id).toBe("b1"); // 0.7 + 0.3 exact + 0.1 term = 1.1
    expect(result.items[1].id).toBe("a1"); // stays at 1.0, no boosts
    expect(result.items[0].score).toBeCloseTo(1.1, 5);
    expect(result.items[1].score).toBeCloseTo(1.0, 5);
  });

  it("rerank: per-term boost (+0.1 per matched term, no exact-phrase match) flips ordering", async () => {
    const query = "칼든 기사"; // two >=2-char terms, <=8 chars total -> bm25-only
    searchEntitiesBm25Mock.mockResolvedValue([
      entityRow({
        id: "a2",
        name: "무관 인물",
        description: "평범한 마을 사람 이야기",
        rank: 1.0, // higher raw score, matches neither term
      }),
      entityRow({
        id: "b2",
        name: "용맹한 전사",
        // contains both terms, but NOT the contiguous exact phrase "칼든 기사"
        description: "그는 칼든 용사였고 뛰어난 기사였다",
        rank: 0.85,
      }),
    ]);
    searchChaptersBm25Mock.mockResolvedValue([]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, query);

    expect(result.items[0].id).toBe("b2"); // 0.85 + 0.1 + 0.1 = 1.05
    expect(result.items[1].id).toBe("a2"); // stays at 1.0
    expect(result.items[0].score).toBeCloseTo(1.05, 5);
    expect(result.items[1].score).toBeCloseTo(1.0, 5);
  });

  it("caps results at top 8 even when more items are returned", async () => {
    const query = "테스트카운트"; // <=8 chars -> bm25-only
    searchEntitiesBm25Mock.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) =>
        entityRow({
          id: `e${i}`,
          name: `엔티티${i}`,
          description: "설명",
          rank: 1 - i * 0.05,
        })
      )
    );
    searchChaptersBm25Mock.mockResolvedValue([]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, query);

    expect(result.items.length).toBe(8);
  });

  it("partial failure: a rejected mode is excluded from modesUsed but other modes still return", async () => {
    embedTextMock.mockRejectedValue(new Error("embedding service down"));
    searchEntitiesBm25Mock.mockResolvedValue([
      entityRow({ id: "e1", name: "생존 엔티티", description: "설명", rank: 0.5 }),
    ]);
    searchChaptersBm25Mock.mockResolvedValue([]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, VECTOR_QUERY);

    expect(result.modesUsed).toEqual(["bm25"]); // "vector" excluded
    expect(matchChunksMock).not.toHaveBeenCalled(); // never reached — embedText threw first
    expect(result.items.some((i) => i.id === "e1")).toBe(true);
  });

  it("vector+bm25 mode maps chunk items, and classification/latencyMs pass through", async () => {
    matchChunksMock.mockResolvedValue([
      {
        id: "chunk-1",
        chapter_id: "ch1",
        content: "청크 내용입니다",
        entity_tags: null,
        position: 2,
        similarity: 0.77,
        summary: null,
        type: "scene",
      },
    ]);
    searchEntitiesBm25Mock.mockResolvedValue([]);
    searchChaptersBm25Mock.mockResolvedValue([]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, VECTOR_QUERY);

    expect(result.modesUsed).toEqual(["vector", "bm25"]);

    const chunkItem = result.items.find((i) => i.type === "chunk");
    expect(chunkItem).toBeDefined();
    expect(chunkItem?.source).toBe("vector");
    expect(chunkItem?.title).toBe("Chunk #2");
    expect(chunkItem?.content).toBe("청크 내용입니다");
    expect(chunkItem?.score).toBeCloseTo(0.77, 5);

    expect(result.classification.mode).toBe("vector");
    expect(typeof result.classification.confidence).toBe("number");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("graph seed fallback: empty full-query seed search falls back to per-term search with Korean particles stripped", async () => {
    searchEntitiesBm25Mock.mockImplementation(
      async (_projectId: string, query: string, limit: number) => {
        if (limit === 5) {
          if (query === GRAPH_QUERY) return []; // full-query seed search: no hit
          if (query === "리엔") return [entityRow({ id: "seed-1", name: "리엔", rank: 0.7 })];
          return [];
        }
        return []; // bm25 mode's own entity search
      }
    );
    findRelatedEntitiesMock.mockResolvedValue([
      {
        entity_id: "rel-1",
        entity_name: "동료엔티티",
        entity_type: "CHARACTER",
        relation_type: "ALLY",
        path: ["seed-1", "rel-1"],
        depth: 1,
        cumulative_weight: 0.8,
      },
    ]);
    searchChaptersBm25Mock.mockResolvedValue([]);

    const service = buildService();
    const result = await service.search(PROJECT_ID, GRAPH_QUERY);

    // Scope to limit=5 calls only (the graph-seed search) — the bm25 mode
    // also calls searchEntitiesBm25 concurrently with limit=10, and its
    // interleaving with the seed-search's per-term loop is not guaranteed,
    // so we filter it out rather than asserting on raw call order.
    const seedCalls = searchEntitiesBm25Mock.mock.calls.filter(
      (call: unknown[]) => call[2] === 5
    );
    expect(seedCalls.length).toBeGreaterThan(1);
    expect(seedCalls[0][1]).toBe(GRAPH_QUERY); // first: full query, unstripped
    expect(seedCalls[1][1]).toBe("리엔"); // second: "리엔은" with the "는" particle stripped

    expect(result.items.some((i) => i.id === "rel-1" && i.source === "graph")).toBe(
      true
    );
  });
});
