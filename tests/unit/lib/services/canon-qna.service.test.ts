import { beforeEach, describe, expect, it, vi } from "vitest";
const budgetGuardMock = vi.hoisted(() => vi.fn(() => vi.fn(async () => {})));
vi.mock("@/lib/services/llm-budget.service", () => ({ createLLMBudgetGuard: budgetGuardMock }));
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
  const search = vi.fn(async () => ({ query: "질문", classification: { mode: "hybrid" }, modesUsed: ["vector"], items, latencyMs: 12 }));
  MockRAGSearchService.mockImplementation(
    function MockRAGSearchServiceConstructor() {
      return {
        search,
      };
    } as never
  );
  return search;
}

function mockSearchService(chapters: unknown[]) {
  const searchChaptersBm25 = vi.fn(async () => chapters);
  MockSearchService.mockImplementation(
    function MockSearchServiceConstructor() {
      return {
        searchChaptersBm25,
      };
    } as never
  );
  return searchChaptersBm25;
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
      sanitizeCanonQAAnswer("**확인된 설정:**\n- 리엔는 영주입니다. [2]\n\n\n**원문에서 드러난 태도:**")
    ).toBe("이번 근거로 확인됨:\n- 리엔는 영주입니다.\n\n원문에서 드러난 태도:");
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
    const result = await service.ask({ projectId: "project-1", question: "리엔가 누구야?" });

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      question: "리엔가 누구야?",
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
        content: "리엔는 왕 앞에 섰다.",
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
        content: "리엔는 다른 처분을 받게 되었다.",
        score: 0.7,
        metadata: { chapterNum: 2 },
      },
      {
        id: "chunk-3",
        source: "bm25",
        type: "chunk",
        title: "자칭 마왕을 주웠다 (3)",
        content: "미라는 리엔를 오해했다.",
        score: 0.6,
        metadata: { chapterNum: 3 },
      },
    ]);
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "partial",
        answer: "**확인된 설정:**\n- 리엔는 왕 앞에 섰습니다. [1]\n확인 불가:\n- 최종 처분",
        citation_indexes: [1, 2, 3, 4],
      })
    );

    const service = new CanonQAService(createSupabaseMock());
    const result = await service.ask({
      projectId: "project-1",
      question: "리엔가 누구야?",
      userId: "user-1",
    });

    expect(result.status).toBe("partial");
    expect(result.answer).toBe(
      "이번 근거로 확인됨:\n- 리엔는 왕 앞에 섰습니다.\n이번 근거로는 답하기 어려움:\n- 최종 처분"
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
        content: "세란은 다시 등장했다.",
        score: 0.7,
        metadata: { chapterNum: 2 },
      },
    ]);
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "이번 근거로 확인됨:\n- 세란의 첫 확인된 언급은 1화입니다.",
        citation_indexes: [1],
      })
    );

    const service = new CanonQAService(
      createSupabaseMock({
        entities: [
          {
            id: "entity-rikel",
            name: "세란",
            type: "CHARACTER",
            summary: "마족으로 언급되는 인물",
            aliases: ["세란라"],
          },
        ],
        mentions: [
          {
            chunk_id: "chunk-first",
            count: 1,
            chunks: {
              id: "chunk-first",
              content: "세란은 조용히 모습을 드러냈다.",
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
      question: "세란의 첫 등장은 언제였지?",
    });

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      id: "entity-context:entity-rikel",
      label: "승인된 Codex",
      title: "세란 작품 기억 컨텍스트",
      metadata: { entityType: "CHARACTER", entityIds: ["entity-rikel"] },
    });
    expect(result.citations[0].metadata).not.toHaveProperty("chapterId");
    expect(result.citations[0].metadata).not.toHaveProperty("chapterNum");
    expect(mockCallLLM.mock.calls[0][0].user).toContain('대상 항목 ID: ["entity-rikel"]');
    expect(result.citations[0].content).toContain("첫 확인된 언급: 1화");
    expect(result.citations[0].content).toContain("첫 언급 근거:");
    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.stringContaining("세란 작품 기억 컨텍스트"),
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
        answer: "이번 근거로 확인됨:\n- 리엔는 변방 마을의 영주입니다.",
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
        content: `${"패딩".repeat(150)}리엔는 말도 안되는 누명으로 좌천된 채 변방으로 쫓겨났다${"패딩".repeat(150)}`,
        rank: 0.5,
      },
    ]);
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "이번 근거로 확인됨:\n- 리엔는 좌천되었습니다.",
        citation_indexes: [1],
      })
    );

    const service = new CanonQAService(createSupabaseMock({ entities: [] }));
    const result = await service.ask({
      projectId: "project-1",
      question: "리엔가 좌천된 이유가 뭐야?",
    });

    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const promptArg = mockCallLLM.mock.calls[0]?.[0] as { user: string };
    expect(promptArg.user).toContain("좌천");
    expect(promptArg.user).toContain("회차 ID: chapter-5");
    expect(promptArg.user).toContain("회차: 5화");
    expect(result.citations[0]).toMatchObject({ metadata: { chapterId: "chapter-5", chapterNum: 5 } });
    expect(result.citations.some((citation) => citation.type === "chapter")).toBe(true);
  });

  it.each(["identical", "whitespace-only"])("dedups a long keyword chapter passage against a %s RAG item", async (variant) => {
    const introduction = "도입문장".repeat(60);
    const sharedContent = `${introduction}문 앞에서 경비병이 기다렸다.`;
    const duplicateContent = variant === "identical"
      ? sharedContent
      : `  ${introduction}문  앞에서\n경비병이\t기다렸다.  `;
    mockRAGSearch([
      {
        id: "chunk-dup",
        source: "vector",
        type: "chunk",
        title: "중복 근거",
        content: duplicateContent,
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
        answer: "테스트 응답",
        citation_indexes: [1],
      })
    );

    const service = new CanonQAService(createSupabaseMock({ entities: [] }));
    const result = await service.ask({
      projectId: "project-1",
      question: "성문 변화는?",
    });

    const promptArg = mockCallLLM.mock.calls[0]?.[0] as { user: string };
    const occurrences = promptArg.user.split(sharedContent).length - 1;
    expect(occurrences).toBe(1);
    expect([...promptArg.user.matchAll(/^제목: (.*)$/gm)].map((match) => match[1])).toEqual(["5화"]);
    expect(result.citations.map((citation) => citation.id)).toEqual(["chapter-5"]);
  });
});

it("forwards the owner through Q&A retrieval and protects the answer boundary", async () => {
  const search = mockRAGSearch([{ id: "e-1", source: "bm25", type: "entity", title: "리엔", content: "기사", score: 1 }]);
  mockSearchService([]);
  mockCallLLM.mockResolvedValue('{"status":"answered","answer":"기사","citation_indexes":[1]}');
  const client = createSupabaseMock({});
  await new CanonQAService(client).ask({ projectId: "project-1", question: "리엔에 대해 설명해줘", userId: "owner-1" });
  expect(search).toHaveBeenCalledWith("project-1", "리엔에 대해 설명해줘", { userId: "owner-1", propagateBudgetErrors: true });
  expect(budgetGuardMock).toHaveBeenCalledWith(client, { projectId: "project-1", userId: "owner-1" });
  expect(mockCallLLM.mock.calls.at(-1)?.[0].beforeRequest).toEqual(expect.any(Function));
});


describe("QA keyword retrieval contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApprovedCodexFactsByEntity.mockResolvedValue({});
    mockRAGSearch([]);
  });

  it("uses base tokens in one request while retaining stem matching and later outcomes", async () => {
    const search = mockSearchService([{
      id: "chapter-outcome", chapter_num: 1, title: "결과",
      content: `${"A".repeat(300)}좌천되었다${"B".repeat(300)}취소되지 않았다.${"C".repeat(700)}`, rank: 1,
    }]);
    mockCallLLM.mockResolvedValue('{"status":"answered","answer":"취소되지 않았다.","citation_indexes":[1]}');
    await new CanonQAService(createSupabaseMock()).ask({ projectId: "project-1", question: "좌천된 이유는?" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("project-1", "좌천된", 4, { wordSimilarityThreshold: 0.25 });
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockCallLLM.mock.calls[0][0].user).toContain("취소되지 않았다.");
    expect(mockCallLLM.mock.calls[0][0].maxTokens).toBe(700);
  });

  it.each(["empty", "error"])("does not retry a %s retrieval", async (mode) => {
    const search = mockSearchService([]);
    if (mode === "error") search.mockRejectedValueOnce(new Error("offline failure"));
    await new CanonQAService(createSupabaseMock()).ask({ projectId: "project-1", question: "튀르아의 늑대 권속은 어디에서 등장하나요?" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("project-1", "등장하나요 튀르아 늑대 권속", 4, { wordSimilarityThreshold: 0.25 });
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

describe("QA evidence metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApprovedCodexFactsByEntity.mockResolvedValue({});
    mockSearchService([]);
    mockCallLLM.mockResolvedValue('{"status":"partial","answer":"원문에서 확인한 내용입니다.","citation_indexes":[1]}');
  });

  it("keeps source coordinates and mention links in model input and returned citations", async () => {
    const metadata = { chapterId: "chapter-source", chunkPosition: 0, entityIds: ["entity-king", "entity-servant"], chunkType: "scene" };
    mockRAGSearch([{
      id: "chunk-source", source: "vector", type: "chunk", title: "Chunk #0",
      content: "경비병은 왕의 종복이 돌아오지 않았다고 추측했다.", score: 0.8, metadata,
    }]);

    const result = await new CanonQAService(createSupabaseMock()).ask({ projectId: "project-1", question: "누가 돌아왔는지 알려주세요" });
    const prompt = mockCallLLM.mock.calls[0][0];
    expect(prompt.user).toContain("근거 ID: chunk-source");
    expect(prompt.user).toContain("회차 ID: chapter-source");
    expect(prompt.user).toContain("원문 조각 순서(0부터): 0");
    expect(prompt.user).toContain('색인된 언급 항목 ID: ["entity-king","entity-servant"]');
    expect(prompt.user).not.toContain("회차: 0화");
    expect(prompt.system).toContain("인물 태그는 색인된 언급 연결이며, 그 인물이 행위자라는 판정이나 사실 확정이 아닙니다.");
    expect(result.citations[0]).toMatchObject({ id: "chunk-source", label: "원문 근거", metadata });
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(prompt.maxTokens).toBe(700);
  });

  it("does not invent absent source metadata for legacy results", async () => {
    mockRAGSearch([{ id: "legacy", source: "vector", type: "chunk", title: "과거 발췌", content: "출처 위치가 없는 원문.", score: 1 }]);
    const result = await new CanonQAService(createSupabaseMock()).ask({ projectId: "project-1", question: "원문을 확인해 주세요" });
    const prompt = mockCallLLM.mock.calls[0][0].user;
    expect(prompt).toContain("근거 ID: legacy");
    expect(prompt).not.toMatch(/회차 ID:|회차:|원문 조각 순서\(0부터\):|색인된 언급 항목 ID:/);
    expect(result.citations[0]).not.toHaveProperty("metadata");
  });

  it("bounds mention IDs in the model input without discarding citation provenance", async () => {
    const entityIds = Array.from({ length: 10 }, (_, i) => `entity-${i + 1}`);
    mockRAGSearch([{ id: "many-links", source: "vector", type: "chunk", title: "여러 인물이 등장한 원문", content: "여러 사람이 이야기를 나눴다.", score: 1, metadata: { entityIds } }]);
    const result = await new CanonQAService(createSupabaseMock()).ask({ projectId: "project-1", question: "무슨 이야기를 나눴나요" });
    const prompt = mockCallLLM.mock.calls[0][0].user;
    expect(prompt).toContain('"entity-8"');
    expect(prompt).not.toContain('"entity-9"');
    expect(prompt).toContain("(외 2개)");
    expect(result.citations[0].metadata?.entityIds).toEqual(entityIds);
  });
});

describe("QA evidence deduplication contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApprovedCodexFactsByEntity.mockResolvedValue({});
    mockRAGSearch([]);
    mockSearchService([]);
    mockCallLLM.mockResolvedValue(JSON.stringify({
      status: "answered",
      answer: "테스트 응답",
      citation_indexes: [1, 2],
    }));
  });

  it("preserves different outcomes after the same long introduction across retrieval sources", async () => {
    const introduction = "도입문장".repeat(60);
    mockSearchService([{
      id: "chapter-open", chapter_num: 1, title: "열린 성문",
      content: `${introduction}문은 열렸다.`, rank: 1,
    }]);
    mockRAGSearch([{
      id: "chunk-closed", source: "vector", type: "chunk", title: "닫힌 성문",
      content: `${introduction}문은 열리지 않았다.`, score: 1,
    }]);

    const result = await new CanonQAService(createSupabaseMock()).ask({
      projectId: "project-1", question: "성문 변화는?",
    });

    const prompt = mockCallLLM.mock.calls[0][0].user;
    expect(prompt).toContain("문은 열렸다.");
    expect(prompt).toContain("문은 열리지 않았다.");
    expect([...prompt.matchAll(/^제목: (.*)$/gm)].map((match) => match[1])).toEqual(["열린 성문", "닫힌 성문"]);
    expect(result.citations.map((citation) => citation.id)).toEqual(["chapter-open", "chunk-closed"]);
  });

  it("keeps the first matching type and id while preserving the same id with a different type", async () => {
    mockRAGSearch([
      { id: "shared", source: "vector", type: "chunk", title: "첫 원문", content: "첫 번째 기록.", score: 1 },
      { id: "shared", source: "vector", type: "chunk", title: "후속 원문", content: "다른 후속 기록.", score: 1 },
      { id: "shared", source: "bm25", type: "entity", title: "별도 설정", content: "별도 설정 기록.", score: 1 },
    ]);

    const result = await new CanonQAService(createSupabaseMock()).ask({
      projectId: "project-1", question: "성문 변화는?",
    });

    const prompt = mockCallLLM.mock.calls[0][0].user;
    expect([...prompt.matchAll(/^제목: (.*)$/gm)].map((match) => match[1])).toEqual(["첫 원문", "별도 설정"]);
    expect(prompt).toContain("첫 번째 기록.");
    expect(prompt).toContain("별도 설정 기록.");
    expect(prompt).not.toContain("다른 후속 기록.");
    expect(result.citations.map(({ type, id }) => [type, id])).toEqual([["chunk", "shared"], ["entity", "shared"]]);
  });

  it("preserves overlapping passages of different lengths in source order within six evidence slots", async () => {
    const shortPassage = `${"도입문장".repeat(60)}첫 구간.`;
    mockSearchService([{
      id: "chapter-short", chapter_num: 1, title: "짧은 발췌",
      content: shortPassage, rank: 1,
    }]);
    mockRAGSearch([
      {
        id: "chunk-long", source: "vector", type: "chunk", title: "긴 발췌",
        content: `${shortPassage}추가 행동이 이어졌다.`, score: 1,
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `chunk-${index + 1}`, source: "vector", type: "chunk", title: `별도 근거 ${index + 1}`,
        content: `독립 사건 ${index + 1}: 경비병이 이동했다.`, score: 1,
      })),
    ]);

    await new CanonQAService(createSupabaseMock()).ask({
      projectId: "project-1", question: "성문 변화는?",
    });

    const prompt = mockCallLLM.mock.calls[0][0].user;
    expect([...prompt.matchAll(/^제목: (.*)$/gm)].map((match) => match[1])).toEqual([
      "짧은 발췌", "긴 발췌", "별도 근거 1", "별도 근거 2", "별도 근거 3", "별도 근거 4",
    ]);
    expect(prompt).toContain("추가 행동이 이어졌다.");
    for (const index of [5, 6, 7]) {
      expect(prompt).not.toContain(`독립 사건 ${index}:`);
    }
  });

  it("preserves evidence and output limits without adding retrieval or answer calls", async () => {
    const characters = ["가", "나", "다", "라", "마", "바"];
    const search = mockRAGSearch(characters.map((character, index) => ({
      id: `chunk-${index}`, source: "vector", type: "chunk", title: `긴 근거 ${index}`,
      content: `${character.repeat(899)}끝넘침표식`, score: 1,
    })));
    const keywordSearch = mockSearchService([]);
    const client = createSupabaseMock();

    await new CanonQAService(client).ask({
      projectId: "project-1", question: "성문 변화는?", userId: "owner-1",
    });

    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const prompt = mockCallLLM.mock.calls[0][0];
    expect([...prompt.user.matchAll(/^내용: (.*)$/gm)].map((match) => match[1])).toEqual(
      characters.map((character) => `${character.repeat(899)}끝...`)
    );
    expect(prompt.user).not.toContain("넘침표식");
    expect(prompt.maxTokens).toBe(700);
    expect(prompt.beforeRequest).toEqual(expect.any(Function));
    expect(prompt.onComplete).toEqual(expect.any(Function));
    expect(budgetGuardMock).toHaveBeenCalledWith(client, { projectId: "project-1", userId: "owner-1" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("project-1", "성문 변화는?", { userId: "owner-1", propagateBudgetErrors: true });
    expect(keywordSearch).toHaveBeenCalledTimes(1);
    expect(keywordSearch).toHaveBeenCalledWith("project-1", "성문 변화", 4, { wordSimilarityThreshold: 0.25 });
  });
});

 describe("QA canonical-name snippet routing", () => {
  it.each([true, false])("reuses one entity read and only prioritizes canonical question names (canonical=%s)", async (canonical) => {
    vi.clearAllMocks();
    mockListApprovedCodexFactsByEntity.mockResolvedValue({});
    mockRAGSearch([]);
    mockSearchService([{
      id: "joint-scene", chapter_num: 1, title: "장면",
      content: `${"A".repeat(300)}날개 하피${"B".repeat(500)}서아${"C".repeat(50)}민호${"D".repeat(210)}결말은 부정됐다.${"E".repeat(500)}`, rank: 1,
    }]);
    const client = createSupabaseMock({ entities: [
      { id: "one", name: "서아", type: "CHARACTER", summary: "", aliases: [] },
      { id: "two", name: canonical ? "민호" : "칼리", type: "CHARACTER", summary: "", aliases: canonical ? [] : ["민호"] },
    ] });
    mockCallLLM.mockResolvedValue('{"status":"partial","answer":"제공 근거만 확인합니다.","citation_indexes":[1]}');
    await new CanonQAService(client).ask({ projectId: "project-1", question: "날개 하피 서아 민호" });
    const from = (client as unknown as { from: ReturnType<typeof vi.fn> }).from;
    expect(from.mock.calls.filter(([table]) => table === "entities")).toHaveLength(1);
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const user = mockCallLLM.mock.calls[0][0].user;
    expect(user.includes("결말은 부정됐다")).toBe(canonical);
  });
});
