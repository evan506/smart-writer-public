import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { IndexingService } from "@/lib/services/indexing.service";

vi.mock("@/lib/services/chunking.service", () => ({
  chunkChapter: vi.fn(),
}));

vi.mock("@/lib/services/embedding.service", () => ({
  embedTexts: vi.fn(),
}));

vi.mock("@/lib/services/mention.service", () => ({
  MentionService: vi.fn(function () {
    return { extractMentions: vi.fn().mockResolvedValue([]) };
  }),
}));

vi.mock("@/lib/services/analysis-job.service", () => ({
  AnalysisJobService: vi.fn(function () {
    return {};
  }),
}));

vi.mock("@/lib/services/entity-extraction.service", () => ({
  EntityExtractionService: vi.fn(),
}));

import { chunkChapter } from "@/lib/services/chunking.service";
import { embedTexts } from "@/lib/services/embedding.service";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const CHAPTER_ID = "22222222-2222-2222-2222-222222222222";

type PreviousChunkRow = { content: string; embedding: string | null };

function createSupabaseMock(previousChunks: PreviousChunkRow[]) {
  const insertedPayloads: Array<Record<string, unknown>[]> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== "chunks") throw new Error(`unexpected table: ${table}`);
      return {
        select: vi.fn((columns: string) => {
          if (columns === "content, embedding") {
            return {
              eq: vi.fn().mockResolvedValue({ data: previousChunks, error: null }),
            };
          }
          throw new Error(`unexpected select: ${columns}`);
        }),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
        insert: vi.fn((payload: Record<string, unknown>[]) => {
          insertedPayloads.push(payload);
          return {
            select: vi.fn().mockResolvedValue({
              data: payload.map((row, i) => ({
                id: `chunk-${i}`,
                content: row.content,
              })),
              error: null,
            }),
          };
        }),
      };
    }),
  };

  return {
    supabase: supabase as unknown as SupabaseClient<Database>,
    insertedPayloads,
  };
}

describe("IndexingService embedding reuse", () => {
  beforeEach(() => {
    vi.mocked(chunkChapter).mockReset();
    vi.mocked(embedTexts).mockReset();
  });

  it("skips embedding entirely when all chunk contents are unchanged", async () => {
    vi.mocked(chunkChapter).mockReturnValue([
      { type: "SCENE", content: "장면 하나", position: 0 },
      { type: "SCENE", content: "장면 둘", position: 1 },
    ]);
    vi.mocked(embedTexts).mockResolvedValue([]);

    const { supabase, insertedPayloads } = createSupabaseMock([
      { content: "장면 하나", embedding: "[0.1]" },
      { content: "장면 둘", embedding: "[0.2]" },
    ]);

    const service = new IndexingService(supabase);
    const result = await service.indexChapter(CHAPTER_ID, PROJECT_ID, "본문");

    expect(embedTexts).toHaveBeenCalledWith([], expect.anything());
    expect(insertedPayloads[0].map((r) => r.embedding)).toEqual([
      "[0.1]",
      "[0.2]",
    ]);
    expect(result.chunkCount).toBe(2);
  });

  it("embeds only chunks whose content changed and reuses the rest", async () => {
    vi.mocked(chunkChapter).mockReturnValue([
      { type: "SCENE", content: "장면 하나", position: 0 },
      { type: "SCENE", content: "새 장면", position: 1 },
    ]);
    vi.mocked(embedTexts).mockResolvedValue([[0.9, 0.9]]);

    const { supabase, insertedPayloads } = createSupabaseMock([
      { content: "장면 하나", embedding: "[0.1]" },
      { content: "사라진 장면", embedding: "[0.3]" },
    ]);

    const service = new IndexingService(supabase);
    await service.indexChapter(CHAPTER_ID, PROJECT_ID, "본문");

    expect(embedTexts).toHaveBeenCalledWith(["새 장면"], expect.anything());
    expect(insertedPayloads[0].map((r) => r.embedding)).toEqual([
      "[0.1]",
      JSON.stringify([0.9, 0.9]),
    ]);
  });

  it("embeds everything on first index (no previous chunks)", async () => {
    vi.mocked(chunkChapter).mockReturnValue([
      { type: "SCENE", content: "장면 하나", position: 0 },
    ]);
    vi.mocked(embedTexts).mockResolvedValue([[0.5]]);

    const { supabase, insertedPayloads } = createSupabaseMock([]);

    const service = new IndexingService(supabase);
    await service.indexChapter(CHAPTER_ID, PROJECT_ID, "본문");

    expect(embedTexts).toHaveBeenCalledWith(["장면 하나"], expect.anything());
    expect(insertedPayloads[0][0].embedding).toBe(JSON.stringify([0.5]));
  });

  it("ignores previous rows without a stored embedding", async () => {
    vi.mocked(chunkChapter).mockReturnValue([
      { type: "SCENE", content: "장면 하나", position: 0 },
    ]);
    vi.mocked(embedTexts).mockResolvedValue([[0.7]]);

    const { supabase, insertedPayloads } = createSupabaseMock([
      { content: "장면 하나", embedding: null },
    ]);

    const service = new IndexingService(supabase);
    await service.indexChapter(CHAPTER_ID, PROJECT_ID, "본문");

    expect(embedTexts).toHaveBeenCalledWith(["장면 하나"], expect.anything());
    expect(insertedPayloads[0][0].embedding).toBe(JSON.stringify([0.7]));
  });
});
