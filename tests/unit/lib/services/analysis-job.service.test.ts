import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_JOB_STALE_TIMEOUT_MS,
  AnalysisJobService,
} from "@/lib/services/analysis-job.service";

type QueryResult = { data?: unknown; error?: { code?: string; message: string } | null };

function query(result: QueryResult) {
  const chain = {
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: vi.fn((resolve: (value: QueryResult) => unknown) => resolve(result)),
  };
  return chain;
}

describe("AnalysisJobService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a queued job when no active job exists", async () => {
    const staleCleanup = query({ data: [], error: null });
    const jobs = query({ data: { id: "job-1" }, error: null });
    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(staleCleanup)
        .mockReturnValueOnce(jobs),
    };

    const result = await new AnalysisJobService(supabase as never).createJob(
      "project-1",
      "chapter-1"
    );

    expect(result).toEqual({ jobId: "job-1", alreadyRunning: false });
    expect(supabase.from).toHaveBeenCalledWith("analysis_jobs");
    expect(staleCleanup.update).toHaveBeenCalledWith({
      status: "FAILED",
      error: "stale_timeout",
      finished_at: "2026-05-21T12:00:00.000Z",
    });
    expect(staleCleanup.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-05-21T11:50:00.000Z"
    );
    expect(jobs.insert).toHaveBeenCalledWith({
      project_id: "project-1",
      chapter_id: "chapter-1",
      status: "QUEUED",
    });
  });

  it("treats active-job unique violations as an already-running extraction", async () => {
    const staleCleanup = query({ data: [], error: null });
    const insertJob = query({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const secondStaleCleanup = query({ data: [], error: null });
    const activeJob = query({ data: { id: "active-job" }, error: null });
    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(staleCleanup)
        .mockReturnValueOnce(insertJob)
        .mockReturnValueOnce(secondStaleCleanup)
        .mockReturnValueOnce(activeJob),
    };

    const result = await new AnalysisJobService(supabase as never).createJob(
      "project-1",
      "chapter-1"
    );

    expect(result).toEqual({ jobId: "active-job", alreadyRunning: true });
    expect(activeJob.eq).toHaveBeenCalledWith("chapter_id", "chapter-1");
    expect(activeJob.in).toHaveBeenCalledWith("status", ["QUEUED", "RUNNING"]);
    expect(activeJob.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("expires stale active jobs as failed", async () => {
    const jobs = query({ data: [{ id: "stale-1" }, { id: "stale-2" }], error: null });
    const supabase = {
      from: vi.fn(() => jobs),
    };

    const result = await new AnalysisJobService(supabase as never).expireStaleJobs(
      "project-1",
      "chapter-1"
    );

    expect(result).toBe(2);
    expect(jobs.update).toHaveBeenCalledWith({
      status: "FAILED",
      error: "stale_timeout",
      finished_at: "2026-05-21T12:00:00.000Z",
    });
    expect(jobs.eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(jobs.eq).toHaveBeenCalledWith("chapter_id", "chapter-1");
    expect(jobs.in).toHaveBeenCalledWith("status", ["QUEUED", "RUNNING"]);
    expect(jobs.lt).toHaveBeenCalledWith(
      "created_at",
      new Date(Date.now() - ANALYSIS_JOB_STALE_TIMEOUT_MS).toISOString()
    );
    expect(jobs.select).toHaveBeenCalledWith("id");
  });

  it("recovers from a duplicate insert when stale cleanup clears the active job", async () => {
    const firstCleanup = query({ data: [], error: null });
    const duplicateInsert = query({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const secondCleanup = query({ data: [{ id: "stale-job" }], error: null });
    const retryInsert = query({ data: { id: "new-job" }, error: null });
    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(firstCleanup)
        .mockReturnValueOnce(duplicateInsert)
        .mockReturnValueOnce(secondCleanup)
        .mockReturnValueOnce(retryInsert),
    };

    const result = await new AnalysisJobService(supabase as never).createJob(
      "project-1",
      "chapter-1"
    );

    expect(result).toEqual({ jobId: "new-job", alreadyRunning: false });
    expect(retryInsert.insert).toHaveBeenCalledWith({
      project_id: "project-1",
      chapter_id: "chapter-1",
      status: "QUEUED",
    });
  });

  it("truncates failed job errors before persisting", async () => {
    const jobs = query({ data: null, error: null });
    const supabase = {
      from: vi.fn(() => jobs),
    };
    const longError = "x".repeat(2100);

    await new AnalysisJobService(supabase as never).markFailed("job-1", longError);

    const updateCalls = jobs.update.mock.calls as unknown as unknown[][];
    const updatePayload = updateCalls[0]?.[0] as
      | { status: string; error: string; finished_at: string }
      | undefined;
    expect(updatePayload).toBeDefined();
    if (!updatePayload) return;
    expect(updatePayload.status).toBe("FAILED");
    expect(updatePayload.error).toHaveLength(2000);
    expect(updatePayload.finished_at).toEqual(expect.any(String));
    expect(jobs.eq).toHaveBeenCalledWith("id", "job-1");
  });
});
