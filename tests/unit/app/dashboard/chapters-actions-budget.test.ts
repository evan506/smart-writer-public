import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const requireProjectOwnerMock = vi.hoisted(() => vi.fn());
const requireChapterOwnerMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const checkLLMBudgetMock = vi.hoisted(() => vi.fn());
const analyzeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProjectOwner: requireProjectOwnerMock,
  requireChapterOwner: requireChapterOwnerMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/services", () => ({
  ConsistencyService: vi.fn(),
  IndexingService: vi.fn().mockImplementation(function IndexingService() {
    return { indexChapterWithExtraction: vi.fn() };
  }),
  AIAnalysisService: vi.fn().mockImplementation(function AIAnalysisService() {
    return { analyze: analyzeMock };
  }),
  checkLLMBudget: checkLLMBudgetMock,
  LLM_BUDGET_BLOCKED_MESSAGE:
    "이 프로젝트의 AI 사용 한도에 도달했습니다. 한도가 초기화된 후 다시 시도해 주세요.",
}));

// Chainable Supabase mock for the `chapters` table update used by saveChapter.
function makeClient() {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => Promise.resolve({ error: null })),
  };
  const client = { from: vi.fn(() => chain) };
  return client;
}

const projectId = "11111111-1111-4111-8111-111111111111";
const chapterId = "22222222-2222-4222-8222-222222222222";

async function importActions() {
  return import("@/app/(dashboard)/projects/[id]/chapters-actions");
}

describe("chapters-actions LLM budget guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireChapterOwnerMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      projectId,
    });
    createClientMock.mockResolvedValue(makeClient());
  });

  it("saveChapter returns budgetBlocked and skips after() when over budget", async () => {
    checkLLMBudgetMock.mockResolvedValue({ allowed: false, reason: "monthly" });

    const { saveChapter } = await importActions();
    const result = await saveChapter(chapterId, projectId, "제목", "본문 내용");

    expect(result).toEqual({ error: null, budgetBlocked: true });
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}`);
  });

  it("saveChapter schedules after() and reports budgetBlocked false when under budget", async () => {
    checkLLMBudgetMock.mockResolvedValue({ allowed: true, reason: null });

    const { saveChapter } = await importActions();
    const result = await saveChapter(chapterId, projectId, "제목", "본문 내용");

    expect(result).toEqual({ error: null, budgetBlocked: false });
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("saveChapter does not check budget or schedule after() when content is empty", async () => {
    const { saveChapter } = await importActions();
    const result = await saveChapter(chapterId, projectId, "제목", null);

    expect(result).toEqual({ error: null, budgetBlocked: false });
    expect(checkLLMBudgetMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("saveChapter does not check budget or schedule after() when skipExtraction is set", async () => {
    checkLLMBudgetMock.mockResolvedValue({ allowed: true, reason: null });

    const { saveChapter } = await importActions();
    const result = await saveChapter(chapterId, projectId, "제목", "본문 내용", {
      skipExtraction: true,
    });

    expect(result).toEqual({ error: null, budgetBlocked: false });
    expect(checkLLMBudgetMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("analyzeChapter returns the budget-blocked message and does not run analysis when over budget", async () => {
    checkLLMBudgetMock.mockResolvedValue({ allowed: false, reason: "daily" });

    const { analyzeChapter } = await importActions();
    const result = await analyzeChapter(chapterId, projectId, "본문 내용");

    expect(result).toEqual({
      error:
        "이 프로젝트의 AI 사용 한도에 도달했습니다. 한도가 초기화된 후 다시 시도해 주세요.",
      result: null,
    });
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("analyzeChapter runs analysis when under budget", async () => {
    checkLLMBudgetMock.mockResolvedValue({ allowed: true, reason: null });
    analyzeMock.mockResolvedValue({ conflicts: [], suggestions: [] });

    const { analyzeChapter } = await importActions();
    const result = await analyzeChapter(chapterId, projectId, "본문 내용");

    expect(result.error).toBeNull();
    expect(analyzeMock).toHaveBeenCalledTimes(1);
  });
});
