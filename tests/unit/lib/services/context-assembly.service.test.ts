import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

// RAGSearchService and ConsistencyService are classes instantiated with
// `new` inside ContextAssemblyService — mock implementations must be
// function-based (not arrow functions) so they work as constructors.
const searchMock = vi.hoisted(() => vi.fn());
const detectConflictsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/rag-search.service", () => ({
  RAGSearchService: vi.fn(function () {
    return { search: searchMock };
  }),
}));

vi.mock("@/lib/services/consistency.service", () => ({
  ConsistencyService: vi.fn(function () {
    return { detectConflicts: detectConflictsMock };
  }),
}));

import { ContextAssemblyService } from "@/lib/services/context-assembly.service";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const CHAPTER_ID = "22222222-2222-2222-2222-222222222222";
const CONTENT = "이번 화의 본문 내용입니다.";

/** Default happy-path handlers: no genre, no prior chapters, empty rag/conflicts. */
function baseHandlers() {
  return {
    projects: { data: { genre: null }, error: null },
    chapters: { data: null, error: null }, // current-chapter lookup fails -> ""
  };
}

function setupCollaborators(options?: {
  ragItems?: unknown[];
  ragThrows?: boolean;
  conflicts?: unknown[];
  conflictsThrows?: boolean;
}) {
  if (options?.ragThrows) {
    searchMock.mockRejectedValueOnce(new Error("rag search failed"));
  } else {
    searchMock.mockResolvedValueOnce({
      query: CONTENT,
      classification: { mode: "vector", confidence: 0.5, reasoning: "" },
      modesUsed: ["vector"],
      items: options?.ragItems ?? [],
      latencyMs: 1,
    });
  }

  if (options?.conflictsThrows) {
    detectConflictsMock.mockRejectedValueOnce(new Error("conflict check failed"));
  } else {
    detectConflictsMock.mockResolvedValueOnce(options?.conflicts ?? []);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ContextAssemblyService.assemble", () => {
  it("returns currentChapter as the content verbatim", async () => {
    const { client } = createSupabaseMock(baseHandlers());
    setupCollaborators();
    const service = new ContextAssemblyService(
      client as unknown as SupabaseClient<Database>
    );

    const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

    expect(result.currentChapter).toBe(CONTENT);
  });

  describe("genreRules", () => {
    it("formats '[kitName]\\n- (category) rule' lines when a genre and matching kit are found", async () => {
      const { client, calls } = createSupabaseMock({
        projects: { data: { genre: "로맨스" }, error: null },
        genre_kits: {
          data: [
            {
              name: "로맨스 킷",
              rules: [
                { category: "말투", rule: "존댓말을 유지한다" },
                { category: "구조", rule: "삼각관계를 피한다" },
              ],
              user_id: "user-1",
            },
          ],
          error: null,
        },
        chapters: { data: null, error: null },
      });
      setupCollaborators();
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.genreRules).toBe(
        "[로맨스 킷]\n- (말투) 존댓말을 유지한다\n- (구조) 삼각관계를 피한다"
      );

      const kitCall = calls.find((c) => c.table === "genre_kits");
      expect(kitCall).toBeDefined();
      expect(kitCall!.filters).toEqual(
        expect.arrayContaining([
          { method: "eq", args: ["genre_type", "로맨스"] },
          {
            method: "order",
            args: ["user_id", { ascending: false, nullsFirst: false }],
          },
          { method: "limit", args: [1] },
        ])
      );
    });

    it("returns '' when the project has no genre set", async () => {
      const { client, fromCalls } = createSupabaseMock({
        projects: { data: { genre: null }, error: null },
        chapters: { data: null, error: null },
      });
      setupCollaborators();
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.genreRules).toBe("");
      // No genre -> loadGenreRules returns early, never queries genre_kits.
      expect(fromCalls).not.toContain("genre_kits");
    });

    it("returns '' when no genre_kits rows are found", async () => {
      const { client } = createSupabaseMock({
        projects: { data: { genre: "판타지" }, error: null },
        genre_kits: { data: [], error: null },
        chapters: { data: null, error: null },
      });
      setupCollaborators();
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.genreRules).toBe("");
    });

    it("returns '' when the matched kit has null rules", async () => {
      const { client } = createSupabaseMock({
        projects: { data: { genre: "판타지" }, error: null },
        genre_kits: {
          data: [{ name: "판타지 킷", rules: null, user_id: null }],
          error: null,
        },
        chapters: { data: null, error: null },
      });
      setupCollaborators();
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.genreRules).toBe("");
    });
  });

  describe("ragContext", () => {
    it("formats items as '{n}. [source/type] title: content' truncated at 300 chars", async () => {
      const { client } = createSupabaseMock(baseHandlers());
      const longContent = "가".repeat(400);
      setupCollaborators({
        ragItems: [
          {
            id: "e1",
            source: "graph",
            type: "entity",
            title: "주인공",
            content: longContent,
            score: 1,
          },
          {
            id: "c1",
            source: "vector",
            type: "chunk",
            title: "1화 장면",
            content: "짧은 내용",
            score: 0.8,
          },
        ],
      });
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      const expected = [
        `1. [graph/entity] 주인공: ${longContent.slice(0, 300)}`,
        `2. [vector/chunk] 1화 장면: 짧은 내용`,
      ].join("\n");
      expect(result.ragContext).toBe(expected);
      expect(longContent.slice(0, 300).length).toBe(300);
    });

    it("returns '' when there are no rag items", async () => {
      const { client } = createSupabaseMock(baseHandlers());
      setupCollaborators({ ragItems: [] });
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.ragContext).toBe("");
    });

    it("returns '' when RAGSearchService.search throws", async () => {
      const { client } = createSupabaseMock(baseHandlers());
      setupCollaborators({ ragThrows: true });
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.ragContext).toBe("");
    });
  });

  describe("recentChapters", () => {
    it("returns '' when the current chapter lookup fails", async () => {
      const { client } = createSupabaseMock({
        projects: { data: { genre: null }, error: null },
        chapters: { data: null, error: null },
      });
      setupCollaborators();
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.recentChapters).toBe("");
    });

    it("orders found chapters ascending, truncates content over 500 chars with '...', and falls back title to 'Chapter {num}'", async () => {
      const ch4Content = "D".repeat(600);
      const ch3Content = "짧은내용";
      const ch2Content = "C".repeat(100);

      const { client } = createSupabaseMock({
        projects: { data: { genre: null }, error: null },
        chapters: [
          // 1st query: current chapter lookup
          { data: { chapter_num: 5 }, error: null },
          // 2nd query: prior chapters, DB-ordered descending by chapter_num
          {
            data: [
              { chapter_num: 4, title: "넷째 장", content: ch4Content },
              { chapter_num: 3, title: null, content: ch3Content },
              { chapter_num: 2, title: "둘째 장", content: ch2Content },
            ],
            error: null,
          },
        ],
      });
      setupCollaborators();
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      const expected = [
        `### Ch.2 — 둘째 장\n${ch2Content}`,
        `### Ch.3 — Chapter 3\n${ch3Content}`,
        `### Ch.4 — 넷째 장\n${ch4Content.slice(0, 500)}...`,
      ].join("\n\n");
      expect(result.recentChapters).toBe(expected);
    });
  });

  describe("conflicts", () => {
    it("passes through ConsistencyService.detectConflicts result", async () => {
      const { client } = createSupabaseMock(baseHandlers());
      const conflicts = [
        {
          conflict_type: "설정 충돌",
          detail: "머리색이 다릅니다",
          entity_id: "entity-1",
          entity_name: "주인공",
        },
      ];
      setupCollaborators({ conflicts });
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.conflicts).toEqual(conflicts);
    });

    it("returns [] when ConsistencyService.detectConflicts throws", async () => {
      const { client } = createSupabaseMock(baseHandlers());
      setupCollaborators({ conflictsThrows: true });
      const service = new ContextAssemblyService(
        client as unknown as SupabaseClient<Database>
      );

      const result = await service.assemble(PROJECT_ID, CHAPTER_ID, CONTENT);

      expect(result.conflicts).toEqual([]);
    });
  });
});
