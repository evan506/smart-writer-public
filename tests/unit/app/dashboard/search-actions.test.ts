import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const requireProjectOwnerMock = vi.hoisted(() => vi.fn());
const checkLLMBudgetMock = vi.hoisted(() => vi.fn());
const ragSearchServiceMock = vi.hoisted(() => vi.fn());
const ragSearchInstanceSearchMock = vi.hoisted(() => vi.fn());
const canonQAServiceMock = vi.hoisted(() => vi.fn());
const canonQAInstanceAskMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProjectOwner: requireProjectOwnerMock,
}));

vi.mock("@/lib/services", () => ({
  RAGSearchService: ragSearchServiceMock,
  CanonQAService: canonQAServiceMock,
  checkLLMBudget: checkLLMBudgetMock,
  LLM_BUDGET_BLOCKED_MESSAGE:
    "이 프로젝트의 AI 사용 한도에 도달했습니다. 한도가 초기화된 후 다시 시도해 주세요.",
}));

const projectId = "project-1";

function makeClient() {
  return {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
  };
}

async function importActions() {
  return import("@/app/(dashboard)/projects/[id]/search/actions");
}

describe("search server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createClientMock.mockResolvedValue(makeClient());
    requireProjectOwnerMock.mockResolvedValue({ ok: true, userId: "user-1" });
    ragSearchServiceMock.mockImplementation(function RAGSearchService() {
      return { search: ragSearchInstanceSearchMock };
    });
    canonQAServiceMock.mockImplementation(function CanonQAService() {
      return { ask: canonQAInstanceAskMock };
    });
  });

  describe("ragSearch", () => {
    it("returns an error for an empty query without checking ownership or calling the service", async () => {
      const { ragSearch } = await importActions();
      const result = await ragSearch(projectId, "   ");

      expect(result).toEqual({ error: "검색어를 입력해주세요.", result: null });
      expect(requireProjectOwnerMock).not.toHaveBeenCalled();
      expect(ragSearchServiceMock).not.toHaveBeenCalled();
    });

    it("returns the ownership error when the caller doesn't own the project", async () => {
      requireProjectOwnerMock.mockResolvedValue({
        ok: false,
        error: "권한이 없거나 존재하지 않는 프로젝트입니다",
      });

      const { ragSearch } = await importActions();
      const result = await ragSearch(projectId, "리엔");

      expect(result).toEqual({
        error: "권한이 없거나 존재하지 않는 프로젝트입니다",
        result: null,
      });
      expect(ragSearchServiceMock).not.toHaveBeenCalled();
    });

    it("returns the service result on the success path", async () => {
      const fakeResult = { mode: "graph", entities: [], chapters: [] };
      ragSearchInstanceSearchMock.mockResolvedValue(fakeResult);

      const { ragSearch } = await importActions();
      const result = await ragSearch(projectId, "리엔");

      expect(result).toEqual({ error: null, result: fakeResult });
      expect(ragSearchInstanceSearchMock).toHaveBeenCalledWith(projectId, "리엔");
    });
  });

  describe("askCanonQuestion", () => {
    it("returns an error for an empty question without checking ownership or budget", async () => {
      const { askCanonQuestion } = await importActions();
      const result = await askCanonQuestion(projectId, "   ");

      expect(result).toEqual({ error: "질문을 입력해주세요.", result: null });
      expect(requireProjectOwnerMock).not.toHaveBeenCalled();
      expect(checkLLMBudgetMock).not.toHaveBeenCalled();
    });

    it("returns the ownership error when the caller doesn't own the project", async () => {
      requireProjectOwnerMock.mockResolvedValue({
        ok: false,
        error: "권한이 없거나 존재하지 않는 프로젝트입니다",
      });

      const { askCanonQuestion } = await importActions();
      const result = await askCanonQuestion(projectId, "리엔은 누구야?");

      expect(result).toEqual({
        error: "권한이 없거나 존재하지 않는 프로젝트입니다",
        result: null,
      });
      expect(checkLLMBudgetMock).not.toHaveBeenCalled();
      expect(canonQAServiceMock).not.toHaveBeenCalled();
    });

    it("returns the budget-blocked message and never constructs or calls CanonQAService when over budget", async () => {
      checkLLMBudgetMock.mockResolvedValue({ allowed: false, reason: "monthly" });

      const { askCanonQuestion } = await importActions();
      const result = await askCanonQuestion(projectId, "리엔은 누구야?");

      expect(result).toEqual({
        error:
          "이 프로젝트의 AI 사용 한도에 도달했습니다. 한도가 초기화된 후 다시 시도해 주세요.",
        result: null,
      });
      expect(canonQAServiceMock).not.toHaveBeenCalled();
      expect(canonQAInstanceAskMock).not.toHaveBeenCalled();
    });

    it("calls CanonQAService.ask with projectId/question/userId when under budget", async () => {
      checkLLMBudgetMock.mockResolvedValue({ allowed: true, reason: null });
      const fakeResult = { answer: "리엔은 주인공이다.", citations: [] };
      canonQAInstanceAskMock.mockResolvedValue(fakeResult);

      const { askCanonQuestion } = await importActions();
      const result = await askCanonQuestion(projectId, "리엔은 누구야?");

      expect(result).toEqual({ error: null, result: fakeResult });
      expect(canonQAInstanceAskMock).toHaveBeenCalledWith({
        projectId,
        question: "리엔은 누구야?",
        userId: "user-1",
      });
    });
  });
});
