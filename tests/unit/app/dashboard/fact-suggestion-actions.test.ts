import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const requireProjectOwnerMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const listPendingFactSuggestionsMock = vi.hoisted(() => vi.fn());
const approveFactSuggestionMock = vi.hoisted(() => vi.fn());
const supersedeFactSuggestionMock = vi.hoisted(() => vi.fn());
const dismissFactSuggestionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProjectOwner: requireProjectOwnerMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  AIAnalysisService: vi.fn(),
  AnalysisJobService: vi.fn(),
  ConsistencyService: vi.fn(),
  IndexingService: vi.fn(),
  embedText: vi.fn(),
}));

vi.mock("@/lib/services/entity-extraction.service", () => ({
  EntityExtractionService: vi.fn(),
}));

vi.mock("@/lib/services/canon-facts/suggestions.service", () => ({
  approveFactSuggestion: approveFactSuggestionMock,
  dismissFactSuggestion: dismissFactSuggestionMock,
  listPendingFactSuggestions: listPendingFactSuggestionsMock,
  supersedeFactSuggestion: supersedeFactSuggestionMock,
}));

describe("fact suggestion server actions", () => {
  const client = { from: vi.fn() };
  const projectId = "project-1";
  const suggestionId = "suggestion-1";
  const conflictingFactId = "fact-old";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createClientMock.mockResolvedValue(client);
    requireProjectOwnerMock.mockResolvedValue({ ok: true });
  });

  it("does not read fact suggestions when project ownership fails", async () => {
    requireProjectOwnerMock.mockResolvedValue({ ok: false, error: "권한이 없습니다" });

    const { getFactSuggestions } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );

    const result = await getFactSuggestions(projectId);

    expect(result).toEqual({ error: "권한이 없습니다", suggestions: [] });
    expect(requireProjectOwnerMock).toHaveBeenCalledWith(client, projectId);
    expect(listPendingFactSuggestionsMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("passes owned project context to fact approval and revalidates the project layout", async () => {
    approveFactSuggestionMock.mockResolvedValue({
      error: null,
      factId: "fact-1",
      mode: "created",
    });

    const { confirmFactSuggestion } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );

    const result = await confirmFactSuggestion(suggestionId, projectId);

    expect(result).toEqual({ error: null, factId: "fact-1", mode: "created" });
    expect(approveFactSuggestionMock).toHaveBeenCalledWith(
      client,
      suggestionId,
      projectId
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/projects/${projectId}`,
      "layout"
    );
  });

  it("passes conflicting fact id only through the explicit supersede action", async () => {
    supersedeFactSuggestionMock.mockResolvedValue({
      error: null,
      factId: "fact-new",
      supersededFactId: conflictingFactId,
      mode: "superseded",
    });

    const { supersedePendingFactSuggestion } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );

    const result = await supersedePendingFactSuggestion(
      suggestionId,
      projectId,
      conflictingFactId
    );

    expect(result).toEqual({
      error: null,
      factId: "fact-new",
      supersededFactId: conflictingFactId,
      mode: "superseded",
    });
    expect(supersedeFactSuggestionMock).toHaveBeenCalledWith(
      client,
      suggestionId,
      projectId,
      conflictingFactId
    );
    expect(approveFactSuggestionMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/projects/${projectId}`,
      "layout"
    );
  });

  it("does not revalidate when fact supersede service validation fails", async () => {
    supersedeFactSuggestionMock.mockResolvedValue({
      error: "같은 항목과 설정 키의 기존 설정만 대체할 수 있습니다",
    });

    const { supersedePendingFactSuggestion } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );

    const result = await supersedePendingFactSuggestion(
      suggestionId,
      projectId,
      conflictingFactId
    );

    expect(result).toEqual({
      error: "같은 항목과 설정 키의 기존 설정만 대체할 수 있습니다",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("passes owned project context to fact dismissal and revalidates after success", async () => {
    dismissFactSuggestionMock.mockResolvedValue({ error: null });

    const { dismissPendingFactSuggestion } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );

    const result = await dismissPendingFactSuggestion(suggestionId, projectId);

    expect(result).toEqual({ error: null });
    expect(dismissFactSuggestionMock).toHaveBeenCalledWith(
      client,
      suggestionId,
      projectId
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/projects/${projectId}`,
      "layout"
    );
  });

  describe("confirmFactSuggestionBatch", () => {
    it("does not process any suggestion when project ownership fails", async () => {
      requireProjectOwnerMock.mockResolvedValue({ ok: false, error: "권한이 없습니다" });

      const { confirmFactSuggestionBatch } = await import(
        "@/app/(dashboard)/projects/[id]/suggestion-actions"
      );

      const result = await confirmFactSuggestionBatch(projectId, ["fact-1", "fact-2"]);

      expect(result).toEqual({ error: "권한이 없습니다", confirmedCount: 0, skipped: [] });
      expect(approveFactSuggestionMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("confirms every suggestion in the batch and revalidates once", async () => {
      approveFactSuggestionMock.mockResolvedValue({ error: null, factId: "fact-x", mode: "created" });

      const { confirmFactSuggestionBatch } = await import(
        "@/app/(dashboard)/projects/[id]/suggestion-actions"
      );

      const result = await confirmFactSuggestionBatch(projectId, ["fact-1", "fact-2", "fact-3"]);

      expect(result).toEqual({ error: null, confirmedCount: 3, skipped: [] });
      expect(approveFactSuggestionMock).toHaveBeenCalledTimes(3);
      expect(approveFactSuggestionMock).toHaveBeenNthCalledWith(1, client, "fact-1", projectId);
      expect(approveFactSuggestionMock).toHaveBeenNthCalledWith(2, client, "fact-2", projectId);
      expect(approveFactSuggestionMock).toHaveBeenNthCalledWith(3, client, "fact-3", projectId);
      expect(revalidatePathMock).toHaveBeenCalledTimes(1);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}`, "layout");
    });

    it("collects individual failures as skipped without aborting the rest of the batch", async () => {
      approveFactSuggestionMock
        .mockResolvedValueOnce({ error: null, factId: "fact-x", mode: "created" })
        .mockResolvedValueOnce({ error: "이미 처리된 설정 후보입니다" })
        .mockResolvedValueOnce({ error: null, factId: "fact-z", mode: "source_added" });

      const { confirmFactSuggestionBatch } = await import(
        "@/app/(dashboard)/projects/[id]/suggestion-actions"
      );

      const result = await confirmFactSuggestionBatch(projectId, ["fact-1", "fact-2", "fact-3"]);

      expect(result).toEqual({
        error: null,
        confirmedCount: 2,
        skipped: [{ id: "fact-2", reason: "이미 처리된 설정 후보입니다" }],
      });
      expect(approveFactSuggestionMock).toHaveBeenCalledTimes(3);
      expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    });
  });
});
