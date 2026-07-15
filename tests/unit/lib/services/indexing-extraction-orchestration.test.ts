import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const jobServiceMock = vi.hoisted(() => ({
  createJob: vi.fn(),
  markRunning: vi.fn(),
  markDone: vi.fn(),
  markFailed: vi.fn(),
}));

const extractAndSuggestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/chunking.service", () => ({
  chunkChapter: vi.fn(() => [
    { type: "SCENE", content: "장면", position: 0 },
  ]),
}));

vi.mock("@/lib/services/embedding.service", () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1]]),
}));

vi.mock("@/lib/services/mention.service", () => ({
  MentionService: vi.fn(function () {
    return { extractMentions: vi.fn().mockResolvedValue([]) };
  }),
}));

vi.mock("@/lib/services/analysis-job.service", () => ({
  AnalysisJobService: vi.fn(function () {
    return jobServiceMock;
  }),
}));

vi.mock("@/lib/services/entity-extraction.service", () => ({
  EntityExtractionService: vi.fn(function () {
    return { extractAndSuggest: extractAndSuggestMock };
  }),
}));

import { IndexingService } from "@/lib/services/indexing.service";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const CHAPTER_ID = "22222222-2222-2222-2222-222222222222";
const JOB_ID = "job-1";

function createSupabaseMock(options?: {
  deleteError?: string;
  // Successive chapter content re-reads used by the stale-save follow-up loop.
  // Each read shifts one value; when exhausted, null (unreadable → no follow-up).
  chapterReads?: Array<string | null>;
}) {
  const chapterReads = [...(options?.chapterReads ?? [])];
  return {
    from: vi.fn((table: string) => {
      if (table === "chapters") {
        const content = chapterReads.length > 0 ? chapterReads.shift()! : null;
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: content === null ? null : { content },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table !== "chunks") throw new Error(`unexpected table: ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            error: options?.deleteError
              ? { message: options.deleteError }
              : null,
          }),
        })),
        insert: vi.fn((payload: Array<Record<string, unknown>>) => ({
          select: vi.fn().mockResolvedValue({
            data: payload.map((row, i) => ({
              id: `chunk-${i}`,
              content: row.content,
            })),
            error: null,
          }),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("IndexingService.indexChapterWithExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobServiceMock.createJob.mockResolvedValue({
      jobId: JOB_ID,
      alreadyRunning: false,
    });
    jobServiceMock.markRunning.mockResolvedValue(undefined);
    jobServiceMock.markDone.mockResolvedValue(undefined);
    jobServiceMock.markFailed.mockResolvedValue(undefined);
    extractAndSuggestMock.mockResolvedValue({
      suggestionCount: 2,
      relationSuggestionCount: 1,
      factSuggestionCount: 3,
    });
  });

  it("skips the run entirely when another job is already active", async () => {
    jobServiceMock.createJob.mockResolvedValue({
      jobId: JOB_ID,
      alreadyRunning: true,
    });
    const supabase = createSupabaseMock();

    const service = new IndexingService(supabase);
    const result = await service.indexChapterWithExtraction(
      CHAPTER_ID,
      PROJECT_ID,
      "본문"
    );

    expect(result).toEqual({
      chunkCount: 0,
      mentionCount: 0,
      suggestionCount: 0,
      relationSuggestionCount: 0,
      factSuggestionCount: 0,
    });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(jobServiceMock.markRunning).not.toHaveBeenCalled();
  });

  it("marks the job DONE with counts on success", async () => {
    const service = new IndexingService(createSupabaseMock());
    const result = await service.indexChapterWithExtraction(
      CHAPTER_ID,
      PROJECT_ID,
      "본문"
    );

    expect(jobServiceMock.markRunning).toHaveBeenCalledWith(JOB_ID);
    expect(jobServiceMock.markDone).toHaveBeenCalledWith(JOB_ID, {
      entityCount: 2,
      relationCount: 1,
      suggestionCount: 6,
    });
    expect(jobServiceMock.markFailed).not.toHaveBeenCalled();
    expect(result.suggestionCount).toBe(2);
    expect(result.factSuggestionCount).toBe(3);
  });

  it("marks FAILED without rethrowing when extraction fails (indexing kept)", async () => {
    extractAndSuggestMock.mockRejectedValue(new Error("extraction boom"));
    const service = new IndexingService(createSupabaseMock());

    const result = await service.indexChapterWithExtraction(
      CHAPTER_ID,
      PROJECT_ID,
      "본문"
    );

    expect(jobServiceMock.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      "extraction: extraction boom"
    );
    expect(jobServiceMock.markDone).not.toHaveBeenCalled();
    // Chunks/mentions already indexed are kept; counts report zero suggestions.
    expect(result.chunkCount).toBe(1);
    expect(result.suggestionCount).toBe(0);
  });

  it("marks FAILED and rethrows when core indexing fails", async () => {
    const service = new IndexingService(
      createSupabaseMock({ deleteError: "delete blew up" })
    );

    await expect(
      service.indexChapterWithExtraction(CHAPTER_ID, PROJECT_ID, "본문")
    ).rejects.toThrow("chunk cleanup failed: delete blew up");

    expect(jobServiceMock.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.stringContaining("indexing: chunk cleanup failed")
    );
    expect(extractAndSuggestMock).not.toHaveBeenCalled();
  });

  it("re-extracts the latest content once when the chapter changed mid-run", async () => {
    // First job runs on the original save; a second save landed while it ran
    // (skipped as alreadyRunning), leaving newer content the loop must catch.
    jobServiceMock.createJob
      .mockResolvedValueOnce({ jobId: JOB_ID, alreadyRunning: false })
      .mockResolvedValueOnce({ jobId: "job-2", alreadyRunning: false });
    // Read 1: content changed → follow-up. Read 2: unchanged → stop.
    const service = new IndexingService(
      createSupabaseMock({ chapterReads: ["최신 본문", "최신 본문"] })
    );

    await service.indexChapterWithExtraction(CHAPTER_ID, PROJECT_ID, "옛 본문");

    // Extraction ran twice: original content, then the newer content.
    expect(extractAndSuggestMock).toHaveBeenCalledTimes(2);
    expect(extractAndSuggestMock.mock.calls[0][2]).toBe("옛 본문");
    expect(extractAndSuggestMock.mock.calls[1][2]).toBe("최신 본문");
    expect(jobServiceMock.markDone).toHaveBeenCalledTimes(2);
    expect(jobServiceMock.markRunning).toHaveBeenNthCalledWith(1, JOB_ID);
    expect(jobServiceMock.markRunning).toHaveBeenNthCalledWith(2, "job-2");
  });

  it("caps follow-up re-extraction at MAX_STALE_FOLLOWUPS when content keeps changing", async () => {
    jobServiceMock.createJob.mockResolvedValue({
      jobId: "job-n",
      alreadyRunning: false,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Every re-read differs → would loop forever without the cap.
    const service = new IndexingService(
      createSupabaseMock({
        chapterReads: ["v2", "v3", "v4", "v5", "v6", "v7"],
      })
    );

    await service.indexChapterWithExtraction(CHAPTER_ID, PROJECT_ID, "v1");

    // 1 initial + 3 bounded follow-ups.
    expect(extractAndSuggestMock).toHaveBeenCalledTimes(1 + 3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("still changing after 3 follow-ups")
    );
    warnSpy.mockRestore();
  });

  it("defers to the newer run when a follow-up job is already claimed", async () => {
    jobServiceMock.createJob
      .mockResolvedValueOnce({ jobId: JOB_ID, alreadyRunning: false })
      .mockResolvedValueOnce({ jobId: "job-2", alreadyRunning: true });
    const service = new IndexingService(
      createSupabaseMock({ chapterReads: ["최신 본문"] })
    );

    await service.indexChapterWithExtraction(CHAPTER_ID, PROJECT_ID, "옛 본문");

    // Content changed, but a newer run owns it → we do not double-extract.
    expect(extractAndSuggestMock).toHaveBeenCalledTimes(1);
    expect(jobServiceMock.markRunning).toHaveBeenCalledTimes(1);
  });

  it("collapses multiple mid-run saves into a single follow-up on the latest content", async () => {
    // Several saves (v2, v3, v4) all landed and committed while the first job
    // ran; each was skipped as alreadyRunning. The loop re-reads CURRENT stored
    // content, which is already the latest (v4) — so it converges in ONE
    // follow-up, not one pass per intermediate version.
    jobServiceMock.createJob
      .mockResolvedValueOnce({ jobId: JOB_ID, alreadyRunning: false })
      .mockResolvedValueOnce({ jobId: "job-2", alreadyRunning: false });
    const service = new IndexingService(
      createSupabaseMock({ chapterReads: ["v4", "v4"] })
    );

    await service.indexChapterWithExtraction(CHAPTER_ID, PROJECT_ID, "v1");

    // Exactly one follow-up, and it processed the latest content (not v2/v3).
    expect(extractAndSuggestMock).toHaveBeenCalledTimes(2);
    expect(extractAndSuggestMock.mock.calls[1][2]).toBe("v4");
    expect(jobServiceMock.markRunning).toHaveBeenCalledTimes(2);
  });

  it("still runs the stale follow-up after an extraction failure", async () => {
    // Intended behaviour: a FAILED extraction must not swallow the fact that
    // newer content is waiting — the follow-up loop still fires and can succeed.
    jobServiceMock.createJob
      .mockResolvedValueOnce({ jobId: JOB_ID, alreadyRunning: false })
      .mockResolvedValueOnce({ jobId: "job-2", alreadyRunning: false });
    extractAndSuggestMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        suggestionCount: 5,
        relationSuggestionCount: 0,
        factSuggestionCount: 0,
      });
    const service = new IndexingService(
      createSupabaseMock({ chapterReads: ["최신 본문", "최신 본문"] })
    );

    const result = await service.indexChapterWithExtraction(
      CHAPTER_ID,
      PROJECT_ID,
      "옛 본문"
    );

    // First run failed (job-1), follow-up ran on the newer content and DONE.
    expect(extractAndSuggestMock).toHaveBeenCalledTimes(2);
    expect(jobServiceMock.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      "extraction: boom"
    );
    expect(jobServiceMock.markDone).toHaveBeenCalledWith("job-2", {
      entityCount: 5,
      relationCount: 0,
      suggestionCount: 5,
    });
    // Return value reflects the successful follow-up, not the failed first run.
    expect(result.suggestionCount).toBe(5);
  });
});
