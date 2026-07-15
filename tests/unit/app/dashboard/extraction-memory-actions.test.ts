import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const requireProjectOwnerMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const checkLLMBudgetMock = vi.hoisted(() => vi.fn());
const createDistillationDepsMock = vi.hoisted(() => vi.fn());
const runExtractionDistillationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProjectOwner: requireProjectOwnerMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/services", () => ({
  checkLLMBudget: checkLLMBudgetMock,
  LLM_BUDGET_BLOCKED_MESSAGE:
    "이 프로젝트의 AI 사용 한도에 도달했습니다. 한도가 초기화된 후 다시 시도해 주세요.",
}));

// generateExtractionProposals is the only export under test here; the rest
// of the module's imports below are only stubbed so the module can load.
vi.mock("@/lib/services/extraction-memory/panel.service", () => ({
  loadExtractionMemoryPanel: vi.fn(),
  loadExtractionMetrics: vi.fn(),
}));

vi.mock("@/lib/services/extraction-memory/write.service", () => ({
  clearGenreOverride: vi.fn(),
  deleteRule: vi.fn(),
  overrideGenreRule: vi.fn(),
  removeExcludedTerm: vi.fn(),
  setRuleStatus: vi.fn(),
}));

vi.mock("@/lib/services/extraction-memory/distillation.service", () => ({
  createDistillationDeps: createDistillationDepsMock,
  runExtractionDistillation: runExtractionDistillationMock,
}));

const projectId = "project-1";
const fakeSupabaseClient = { from: vi.fn() };
const fakeDeps = { fake: "distillation-deps" };

async function importActions() {
  return import("@/app/(dashboard)/projects/[id]/extraction-memory-actions");
}

describe("extraction-memory-actions: generateExtractionProposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createClientMock.mockResolvedValue(fakeSupabaseClient);
    createDistillationDepsMock.mockReturnValue(fakeDeps);
  });

  it("returns the ownership error and proposed: 0 without checking budget or running distillation", async () => {
    requireProjectOwnerMock.mockResolvedValue({
      ok: false,
      error: "권한이 없거나 존재하지 않는 프로젝트입니다",
    });

    const { generateExtractionProposals } = await importActions();
    const result = await generateExtractionProposals(projectId);

    expect(result).toEqual({
      error: "권한이 없거나 존재하지 않는 프로젝트입니다",
      proposed: 0,
    });
    expect(checkLLMBudgetMock).not.toHaveBeenCalled();
    expect(runExtractionDistillationMock).not.toHaveBeenCalled();
  });

  it("returns the budget-blocked message and never runs distillation when over budget", async () => {
    requireProjectOwnerMock.mockResolvedValue({ ok: true, userId: "user-1" });
    checkLLMBudgetMock.mockResolvedValue({ allowed: false, reason: "daily" });

    const { generateExtractionProposals } = await importActions();
    const result = await generateExtractionProposals(projectId);

    expect(result).toEqual({
      error:
        "이 프로젝트의 AI 사용 한도에 도달했습니다. 한도가 초기화된 후 다시 시도해 주세요.",
      proposed: 0,
    });
    expect(runExtractionDistillationMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("builds deps via createDistillationDeps, runs distillation, and revalidates on success", async () => {
    requireProjectOwnerMock.mockResolvedValue({ ok: true, userId: "user-1" });
    checkLLMBudgetMock.mockResolvedValue({ allowed: true, reason: null });
    runExtractionDistillationMock.mockResolvedValue({ proposed: 3, error: null });

    const { generateExtractionProposals } = await importActions();
    const result = await generateExtractionProposals(projectId);

    expect(createDistillationDepsMock).toHaveBeenCalledWith(fakeSupabaseClient, {
      projectId,
      userId: "user-1",
    });
    expect(runExtractionDistillationMock).toHaveBeenCalledWith(projectId, fakeDeps);
    expect(result).toEqual({ error: null, proposed: 3, skippedReason: null });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}`, "layout");
  });

  it("propagates a skippedReason from the distillation outcome without treating it as an error", async () => {
    requireProjectOwnerMock.mockResolvedValue({ ok: true, userId: "user-1" });
    checkLLMBudgetMock.mockResolvedValue({ allowed: true, reason: null });
    runExtractionDistillationMock.mockResolvedValue({
      proposed: 0,
      error: null,
      skippedReason: "too_few_dismissals",
    });

    const { generateExtractionProposals } = await importActions();
    const result = await generateExtractionProposals(projectId);

    expect(result).toEqual({
      error: null,
      proposed: 0,
      skippedReason: "too_few_dismissals",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}`, "layout");
  });

  it("returns the outcome error and does not revalidate when distillation fails", async () => {
    requireProjectOwnerMock.mockResolvedValue({ ok: true, userId: "user-1" });
    checkLLMBudgetMock.mockResolvedValue({ allowed: true, reason: null });
    runExtractionDistillationMock.mockResolvedValue({
      proposed: 0,
      error: "distillation LLM failed",
    });

    const { generateExtractionProposals } = await importActions();
    const result = await generateExtractionProposals(projectId);

    expect(result).toEqual({ error: "distillation LLM failed", proposed: 0 });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
