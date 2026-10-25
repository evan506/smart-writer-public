// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSuggestionsMock = vi.hoisted(() => vi.fn());
const getSuggestionCountMock = vi.hoisted(() => vi.fn());
const getExtractionSummaryMock = vi.hoisted(() => vi.fn());
const getLatestAnalysisJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(dashboard)/projects/[id]/suggestion-actions", () => ({
  getSuggestions: getSuggestionsMock,
  getSuggestionCount: getSuggestionCountMock,
  getExtractionSummary: getExtractionSummaryMock,
}));

vi.mock("@/app/(dashboard)/projects/[id]/analysis-actions", () => ({
  getLatestAnalysisJob: getLatestAnalysisJobMock,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useSuggestionPolling } from "@/components/entity-suggestion-panel/use-suggestion-polling";
import { POLL_INTERVAL, POLL_MAX_DURATION } from "@/components/entity-suggestion-panel/constants";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const CHAPTER_ID = "22222222-2222-2222-2222-222222222222";

function summaryWith(autoConfirmed: number, pending = 0) {
  return {
    error: null,
    autoConfirmedEntityCount: autoConfirmed,
    autoConfirmedRelationCount: 0,
    pendingCount: pending,
    confirmedNames: autoConfirmed > 0 ? ["세라핀"] : [],
  };
}

describe("useSuggestionPolling — job-tracked termination", () => {
  const refreshFactSuggestions = vi.fn().mockResolvedValue(0);
  const refreshAliasTargets = vi.fn().mockResolvedValue(undefined);
  const setSuggestions = vi.fn();
  const setCount = vi.fn();

  function renderPolling(saveSignal = 1) {
    return renderHook(() =>
      useSuggestionPolling({
        projectId: PROJECT_ID,
        chapterId: CHAPTER_ID,
        saveSignal,
        count: 0,
        setCount,
        setSuggestions,
        refreshAliasTargets,
        refreshFactSuggestions,
      })
    );
  }

  async function tick() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    getSuggestionsMock.mockResolvedValue({ error: null, suggestions: [] });
    getSuggestionCountMock.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps polling after interim auto-confirms while the job is RUNNING", async () => {
    // Regression: early auto-confirms used to stop polling before fact
    // suggestions were written, freezing the panel on a partial snapshot.
    getLatestAnalysisJobMock.mockResolvedValue({ job: { status: "RUNNING" } });
    getExtractionSummaryMock.mockResolvedValue(summaryWith(2));

    renderPolling();

    await tick(); // interim signal arrives, must NOT terminate polling
    const jobChecksAfterInterim = getLatestAnalysisJobMock.mock.calls.length;
    await tick();

    expect(getLatestAnalysisJobMock.mock.calls.length).toBeGreaterThan(
      jobChecksAfterInterim
    );
  });

  it("refreshes fact suggestions again when the job reaches DONE", async () => {
    getLatestAnalysisJobMock
      .mockResolvedValueOnce({ job: { status: "RUNNING" } })
      .mockResolvedValue({ job: { status: "DONE" } });
    getExtractionSummaryMock.mockResolvedValue(summaryWith(2));
    refreshFactSuggestions.mockResolvedValue(5);

    renderPolling();

    await tick(); // RUNNING + interim refresh
    await tick(); // DONE → final refresh

    // Interim refresh once + DONE refresh once
    expect(refreshFactSuggestions.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not repeat interim refreshes when the summary snapshot is unchanged", async () => {
    getLatestAnalysisJobMock.mockResolvedValue({ job: { status: "RUNNING" } });
    getExtractionSummaryMock.mockResolvedValue(summaryWith(2));

    renderPolling();

    await tick();
    await tick();
    await tick();

    // Same snapshot every tick → only the first interim tick refreshes
    expect(refreshFactSuggestions).toHaveBeenCalledTimes(1);
  });

  it("stops and surfaces failure when the job is FAILED", async () => {
    getLatestAnalysisJobMock.mockResolvedValue({ job: { status: "FAILED" } });
    getExtractionSummaryMock.mockResolvedValue(summaryWith(0));

    const { result } = renderPolling();

    await tick();

    expect(result.current.analysisFailed).toBe(true);
    expect(getSuggestionsMock).toHaveBeenCalled();
    expect(refreshFactSuggestions).toHaveBeenCalled();
    expect(refreshAliasTargets).toHaveBeenCalled();
    const jobChecks = getLatestAnalysisJobMock.mock.calls.length;
    await tick();
    expect(getLatestAnalysisJobMock.mock.calls.length).toBe(jobChecks);
  });
  it("restores failure and refreshes partial results once on reload without starting polling", async () => {
    getLatestAnalysisJobMock.mockResolvedValue({ job: { status: "FAILED" } });
    const partial = [{ id: "partial-candidate" }];
    getSuggestionsMock.mockResolvedValue({ error: null, suggestions: partial });
    const { result } = renderPolling(0);
    await act(async () => {});
    expect(result.current.analysisFailed).toBe(true);
    expect(setSuggestions).toHaveBeenCalledWith(partial);
    expect(refreshFactSuggestions).toHaveBeenCalledTimes(1);
    expect(refreshAliasTargets).toHaveBeenCalledTimes(1);
    await tick();
    expect(getLatestAnalysisJobMock).toHaveBeenCalledTimes(1);
  });

  it("treats the polling ceiling as delay, not successful empty completion", async () => {
    getLatestAnalysisJobMock.mockResolvedValue({ job: { status: "RUNNING" } });
    getExtractionSummaryMock.mockResolvedValue(summaryWith(0));
    const { result } = renderPolling();
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MAX_DURATION + POLL_INTERVAL); });
    expect(result.current.analyzing).toBe(false);
    expect(result.current.analysisDelayed).toBe(true);
    expect(result.current.analysisFailed).toBe(false);
    expect(result.current.analysisCompletedWithoutResults).toBe(false);
    const checks = getLatestAnalysisJobMock.mock.calls.length;
    await tick();
    expect(getLatestAnalysisJobMock).toHaveBeenCalledTimes(checks);
  });

  it("ignores a late terminal response after the polling ceiling", async () => {
    let resolveJob!: (value: unknown) => void;
    getLatestAnalysisJobMock.mockReturnValue(new Promise((resolve) => { resolveJob = resolve; }));
    const { result } = renderPolling();
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MAX_DURATION + POLL_INTERVAL); });
    await act(async () => { resolveJob({ job: { status: "FAILED" } }); });
    expect(result.current.analysisDelayed).toBe(true);
    expect(result.current.analysisFailed).toBe(false);
    expect(getSuggestionsMock).not.toHaveBeenCalled();
  });

  it("ignores a previous chapter's in-flight status on navigation", async () => {
    let resolveOldJob!: (value: unknown) => void;
    getLatestAnalysisJobMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveOldJob = resolve; }))
      .mockResolvedValue({ job: null });
    const { result, rerender } = renderHook(({ chapterId }) => useSuggestionPolling({
      projectId: PROJECT_ID, chapterId, saveSignal: 0, count: 0,
      setCount, setSuggestions, refreshAliasTargets, refreshFactSuggestions,
    }), { initialProps: { chapterId: CHAPTER_ID } });
    rerender({ chapterId: "other-chapter" });
    await act(async () => { resolveOldJob({ job: { status: "FAILED" } }); });
    expect(result.current.analysisFailed).toBe(false);
    expect(getSuggestionsMock).not.toHaveBeenCalled();
    expect(getLatestAnalysisJobMock).toHaveBeenCalledTimes(2);
  });

  it("reads a newly entered chapter once even when the previous save signal remains positive", async () => {
    getLatestAnalysisJobMock.mockResolvedValue({ job: null });
    const { rerender } = renderHook(({ chapterId }) => useSuggestionPolling({
      projectId: PROJECT_ID, chapterId, saveSignal: 1, count: 0,
      setCount, setSuggestions, refreshAliasTargets, refreshFactSuggestions,
    }), { initialProps: { chapterId: CHAPTER_ID } });
    rerender({ chapterId: "other-chapter" });
    await act(async () => {});
    await tick();
    expect(getLatestAnalysisJobMock).toHaveBeenCalledTimes(1);
    expect(getLatestAnalysisJobMock).toHaveBeenCalledWith(PROJECT_ID, "other-chapter");
  });

  it("does not claim successful completion when the DONE result refresh fails", async () => {
    getLatestAnalysisJobMock.mockResolvedValue({ job: { status: "DONE" } });
    getSuggestionsMock.mockRejectedValueOnce(new Error("read unavailable"));
    const { result } = renderPolling();
    await tick();
    expect(result.current.analysisDelayed).toBe(true);
    expect(result.current.analysisCompletedWithoutResults).toBe(false);
    expect(refreshFactSuggestions).toHaveBeenCalled();
    expect(refreshAliasTargets).toHaveBeenCalled();
  });

});
