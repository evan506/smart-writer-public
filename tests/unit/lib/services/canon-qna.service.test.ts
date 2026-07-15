import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CanonQAService,
  parseCanonQAResponse,
  sanitizeCanonQAAnswer,
} from "@/lib/services/canon-qna.service";
import { callLLM } from "@/lib/services/llm.service";
import { RAGSearchService } from "@/lib/services/rag-search.service";
import { SearchService } from "@/lib/services/search.service";
import { listApprovedCodexFactsByEntity } from "@/lib/services/canon-facts/read.service";

vi.mock("@/lib/services/llm.service", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/services/llm-usage-logger.service", () => ({
  createLLMUsageLogger: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/services/rag-search.service", () => ({
  RAGSearchService: vi.fn(),
}));

vi.mock("@/lib/services/search.service", () => ({
  SearchService: vi.fn(),
}));

vi.mock("@/lib/services/canon-facts/read.service", () => ({
  listApprovedCodexFactsByEntity: vi.fn(async () => ({})),
}));

const mockCallLLM = vi.mocked(callLLM);
const MockRAGSearchService = vi.mocked(RAGSearchService);
const MockSearchService = vi.mocked(SearchService);
const mockListApprovedCodexFactsByEntity = vi.mocked(listApprovedCodexFactsByEntity);

function mockRAGSearch(items: unknown[]) {
  MockRAGSearchService.mockImplementation(
    function MockRAGSearchServiceConstructor() {
      return {
        search: vi.fn(async () => ({
          query: "리엔이 누구야?",
          classification: { mode: "hybrid", intent: "entity_lookup" },
          modesUsed: ["vector"],
          items,
          latencyMs: 12,
        })),
      };
    } as never
  );
}

function mockSearchService(chapters: unknown[]) {
  MockSearchService.mockImplementation(
    function MockSearchServiceConstructor() {
      return {
        searchChaptersBm25: vi.fn(async () => chapters),
      };
    } as never
  );
}

function createSupabaseMock({
  entities = [],
  mentions = [],
}: {
  entities?: unknown[];
  mentions?: unknown[];
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "entities") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: entities, error: null })),
          })),
        };
      }

      if (table === "mentions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: mentions, error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as never;
}

describe("parseCanonQAResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApprovedCodexFactsByEntity.mockResolvedValue({});
  });

  it("accepts answered responses only when they cite available evidence", () => {
    const parsed = parseCanonQAResponse(
      JSON.stringify({
        status: "answered",
        answer: "확인된 설정입니다.",
        citation_indexes: [1, 2, 2, 3],
      }),
      3
    );

    expect(parsed).toEqual({
      status: "answered",
      answer: "확인된 설정입니다.",
      citationIndexes: [1, 2, 3],
    });
  });

  it("accepts partial responses with usable citations", () => {
    const parsed = parseCanonQAResponse(
      JSON.stringify({
        status: "partial",
        answer: "일부만 확인됩니다.",
        citation_indexes: [1],
      }),
      2
    );

    expect(parsed).toEqual({
      status: "partial",
      answer: "일부만 확인됩니다.",
      citationIndexes: [1],
    });
  });

  it("downgrades answers without usable citations to insufficient evidence", () => {
    const parsed = parseCanonQAResponse(
      JSON.stringify({
        status: "answered",
        answer: "근거 없이 답했습니다.",
        citation_indexes: [4],
      }),
      2
    );

    expect(parsed).toEqual({
      status: "insufficient_evidence",
      answer: null,
      citationIndexes: [],
    });
  });

  it("treats non-json model output as insufficient evidence", () => {
    const parsed = parseCanonQAResponse("아마 그런 것 같습니다.", 2);

    expect(parsed).toEqual({
      status: "insufficient_evidence",
      answer: null,
      citationIndexes: [],
    });
  });

  it("removes markdown emphasis and inline citation markers from answers", () => {
    expect(
      sanitizeCanonQAAnswer("**확인된 설정:**\n- 리엔은 영주입니다. [2]\n\n\n**원문에서 드러난 태도:**")
    ).toBe("이번 근거로 확인됨:\n- 리엔은 영주입니다.\n\n원문에서 드러난 태도:");
  });

  it("normalizes unsupported absolute section labels to evidence-scoped labels", () => {
    expect(sanitizeCanonQAAnswer("확인 불가:\n- 누명의 구체 내용")).toBe(
      "이번 근거로는 답하기 어려움:\n- 누명의 구체 내용"
    );
  });
});

describe("CanonQAService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchService([]);
  });

  it("returns insufficient evidence without calling the LLM when search has no usable content", async () => {
    mockRAGSearch([
      {
        id: "empty",
        source: "vector",
        type: "chunk",
        title: "빈 근거",
        content: "   ",
        score: 0.2,
      },
    ]);

    const service = new CanonQAService(createSupabaseMock());
    const result = await service.ask({ projectId: "project-1", question: "리엔이 누구야?" });

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      question: "리엔이 누구야?",
      answer: "현재 승인된 작품 기억과 원문 근거만으로는 확인할 수 없습니다.",
      status: "insufficient_evidence",
      citations: [],
    });
  });

  it("sanitizes partial answers and limits returned citations to three evidence items", async () => {
    mockRAGSearch([
      {
        id: "chunk-1",
        source: "vector",
        type: "chunk",
        title: "자칭 마왕을 주웠다 (1)",
        content: "리엔은 왕 앞에 섰다.",
        score: 0.9,
        metadata: { chapterNum: 1 },
      },
      {
        id: "entity-1",
        source: "bm25",
        type: "entity",
        title: "리엔 하르트",
        content: "리엔 하르트는 누명을 받은 인물이다.",
        score: 0.8,
      },
      {
        id: "chunk-2",
        source: "vector",
        type: "chunk",
        title: "자칭 마왕을 주웠다 (2)",
        content: "리엔은 다른 처분을 받게 되었다.",
        score: 0.7,
        metadata: { chapterNum: 2 },
      },
      {
        id: "chunk-3",
        source: "bm25",
        type: "chunk",
        title: "자칭 마왕을 주웠다 (3)",
        content: "미라는 리엔을 오해했다.",
        score: 0.6,
        metadata: { chapterNum: 3 },
      },
    ]);
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "partial",
        answer: "**확인된 설정:**\n- 리엔은 왕 앞에 섰습니다. [1]\n확인 불가:\n- 최종 처분",
        citation_indexes: [1, 2, 3, 4],
      })
    );

    const service = new CanonQAService(createSupabaseMock());
    const result = await service.ask({
      projectId: "project-1",
      question: "리엔이 누구야?",
      userId: "user-1",
    });

    expect(result.status).toBe("partial");
    expect(result.answer).toBe(
      "이번 근거로 확인됨:\n- 리엔은 왕 앞에 섰습니다.\n이번 근거로는 답하기 어려움:\n- 최종 처분"
    );
    expect(result.citations).toHaveLength(3);
    expect(result.citations.map((citation) => citation.label)).toEqual([
      "1화 원문",
      "승인된 Codex",
      "2화 원문",
    ]);
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
  });

  it("prepends resolved entity mention context to Q&A evidence", async () => {
    mockRAGSearch([
      {
        id: "chunk-1",
        source: "vector",
        type: "chunk",
        title: "자칭 마왕을 주웠다 (2)",
        content: "리켈은 다시 등장했다.",
        score: 0.7,
        metadata: { chapterNum: 2 },
      },
    ]);
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "이번 근거로 확인됨:\n- 리켈의 첫 확인된 언급은 1화입니다.",
        citation_indexes: [1],
      })
    );

    const service = new CanonQAService(
      createSupabaseMock({
        entities: [
          {
            id: "entity-rikel",
            name: "리켈",
            type: "CHARACTER",
            summary: "마족으로 언급되는 인물",
            aliases: ["리켈라"],
          },
        ],
        mentions: [
          {
            chunk_id: "chunk-first",
            count: 1,
            chunks: {
              id: "chunk-first",
              content: "리켈은 조용히 모습을 드러냈다.",
              position: 0,
              chapter_id: "chapter-1",
              chapters: {
                id: "chapter-1",
                title: "자칭 마왕을 주웠다 (1)",
                chapter_num: 1,
                project_id: "project-1",
              },
            },
          },
        ],
      })
    );

    const result = await service.ask({
      projectId: "project-1",
      question: "리켈의 첫 등장은 언제였지?",
    });

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      id: "entity-context:entity-rikel",
      label: "승인된 Codex",
      title: "리켈 작품 기억 컨텍스트",
    });
    expect(result.citations[0].content).toContain("첫 확인된 언급: 1화");
    expect(result.citations[0].content).toContain("첫 언급 근거:");
    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.stringContaining("리켈 작품 기억 컨텍스트"),
      })
    );
  });

  it("adds approved canon facts to Q&A evidence without mutating canon", async () => {
    mockRAGSearch([]);
    mockListApprovedCodexFactsByEntity.mockResolvedValue({
      "entity-dino": [
        {
          id: "fact-1",
          entityId: "entity-dino",
          factType: "ROLE",
          factKey: "title",
          value: "변방 마을의 영주",
          status: "APPROVED",
          confidence: 0.9,
          establishedChapterId: "chapter-1",
          establishedChapterNum: 1,
          approvedAt: "2026-05-26T00:00:00.000Z",
          sources: [
            {
              id: "source-1",
              chapterId: "chapter-1",
              chapterNum: 1,
              chapterTitle: "자칭 마왕을 주웠다",
              chunkId: "chunk-1",
              evidenceKind: "DIRECT",
              evidenceText: "전방의 아무 마을에나 가서 영주나 하라.",
            },
          ],
        },
      ],
    });
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "이번 근거로 확인됨:\n- 리엔은 변방 마을의 영주입니다.",
        citation_indexes: [1],
      })
    );

    const supabase = createSupabaseMock({
      entities: [
        {
          id: "entity-dino",
          name: "리엔",
          type: "CHARACTER",
          summary: "누명을 받은 인물",
          aliases: [],
        },
      ],
    }) as unknown as { from: ReturnType<typeof vi.fn> };
    const service = new CanonQAService(supabase as never);

    const result = await service.ask({
      projectId: "project-1",
      question: "리엔의 직책은 뭐야?",
    });

    expect(result.status).toBe("answered");
    expect(result.citations[0]).toMatchObject({
      id: "entity-context:entity-dino",
      label: "승인된 Codex",
      title: "리엔 작품 기억 컨텍스트",
    });
    expect(result.citations[0].content).toContain("승인된 세부 설정:");
    expect(result.citations[0].content).toContain("ROLE:title: 변방 마을의 영주");
    expect(result.citations[0].content).toContain("전방의 아무 마을에나 가서 영주나 하라.");
    expect(mockListApprovedCodexFactsByEntity).toHaveBeenCalledWith(
      supabase,
      "project-1",
      ["entity-dino"]
    );
    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.stringContaining("승인된 세부 설정: - ROLE:title: 변방 마을의 영주"),
      })
    );
    expect(supabase.from).toHaveBeenCalledWith("entities");
    expect(supabase.from).toHaveBeenCalledWith("mentions");
  });

  it("reaches a keyword-matched chapter passage for questions with no entity name", async () => {
    mockRAGSearch([]);
    mockSearchService([
      {
        id: "chapter-5",
        chapter_num: 5,
        title: "5화",
        content: `${"패딩".repeat(150)}리엔은 말도 안되는 누명으로 좌천된 채 변방으로 쫓겨났다${"패딩".repeat(150)}`,
        rank: 0.5,
      },
    ]);
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "이번 근거로 확인됨:\n- 리엔은 좌천되었습니다.",
        citation_indexes: [1],
      })
    );

    const service = new CanonQAService(createSupabaseMock({ entities: [] }));
    const result = await service.ask({
      projectId: "project-1",
      question: "리엔이 좌천된 이유가 뭐야?",
    });

    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const promptArg = mockCallLLM.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("좌천");
    expect(result.citations.some((citation) => citation.type === "chapter")).toBe(true);
  });

  it("dedups a keyword chapter passage against an identical RAG item", async () => {
    const sharedContent = "리엔은 좌천된 채 변방으로 쫓겨났다.";
    mockRAGSearch([
      {
        id: "chunk-dup",
        source: "vector",
        type: "chunk",
        title: "중복 근거",
        content: sharedContent,
        score: 0.5,
      },
    ]);
    mockSearchService([
      {
        id: "chapter-5",
        chapter_num: 5,
        title: "5화",
        content: sharedContent,
        rank: 0.4,
      },
    ]);
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "이번 근거로 확인됨:\n- 리엔은 좌천되었습니다.",
        citation_indexes: [1],
      })
    );

    const service = new CanonQAService(createSupabaseMock({ entities: [] }));
    const result = await service.ask({
      projectId: "project-1",
      question: "리엔이 좌천된 이유가 뭐야?",
    });

    const promptArg = mockCallLLM.mock.calls[0]?.[0] as { user: string };
    const occurrences = promptArg.user.split(sharedContent).length - 1;
    expect(occurrences).toBe(1);
    expect(result.citations).toHaveLength(1);
  });
});
