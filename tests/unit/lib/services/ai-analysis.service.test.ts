import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIAnalysisService } from "@/lib/services/ai-analysis.service";
import { ContextAssemblyService } from "@/lib/services/context-assembly.service";
import { callLLM } from "@/lib/services/llm.service";
import { createLLMUsageLogger } from "@/lib/services/llm-usage-logger.service";
import type { AssembledContext } from "@/lib/services/prompt-templates";

vi.mock("@/lib/services/context-assembly.service", () => ({
  ContextAssemblyService: vi.fn(),
}));

vi.mock("@/lib/services/llm.service", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/services/llm-usage-logger.service", () => ({
  createLLMUsageLogger: vi.fn(),
}));

const MockContextAssemblyService = vi.mocked(ContextAssemblyService);
const mockCallLLM = vi.mocked(callLLM);
const mockCreateLLMUsageLogger = vi.mocked(createLLMUsageLogger);

const defaultCtx: AssembledContext = {
  genreRules: "",
  ragContext: "",
  recentChapters: "",
  currentChapter: "주인공이 검을 뽑았다.",
  conflicts: [],
};

function mockAssemble(ctx: AssembledContext = defaultCtx) {
  const assembleMock = vi.fn(async () => ctx);
  MockContextAssemblyService.mockImplementation(
    function MockContextAssemblyServiceConstructor() {
      return { assemble: assembleMock };
    } as never
  );
  return assembleMock;
}

describe("AIAnalysisService.analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SMART_WRITER_MODEL_ANALYSIS;
    mockCreateLLMUsageLogger.mockReturnValue(vi.fn());
  });

  it("parses a clean JSON response without a rawResponse field", async () => {
    mockAssemble();
    const payload = {
      conflicts: [{ type: "설정 충돌", severity: "high", entity: "주인공", detail: "d", suggestion: "s" }],
      suggestions: [{ category: "plot", content: "c" }],
      references: [{ source: "entity", id: "e-1", title: "t", relevance: "r" }],
    };
    mockCallLLM.mockResolvedValue(JSON.stringify(payload));

    const service = new AIAnalysisService({} as never);
    const result = await service.analyze("proj-1", "ch-1", "content");

    expect(result).toEqual(payload);
    expect(result).not.toHaveProperty("rawResponse");
  });

  it("parses a response wrapped in ```json code fences", async () => {
    mockAssemble();
    const payload = { conflicts: [], suggestions: [], references: [] };
    mockCallLLM.mockResolvedValue(
      "```json\n" + JSON.stringify(payload) + "\n```"
    );

    const service = new AIAnalysisService({} as never);
    const result = await service.analyze("proj-1", "ch-1", "content");

    expect(result).toEqual(payload);
  });

  it("extracts JSON surrounded by prose text", async () => {
    mockAssemble();
    const payload = {
      conflicts: [],
      suggestions: [{ category: "style", content: "톤을 통일하세요" }],
      references: [],
    };
    mockCallLLM.mockResolvedValue(
      `분석 결과입니다.\n\n${JSON.stringify(payload)}\n\n이상입니다.`
    );

    const service = new AIAnalysisService({} as never);
    const result = await service.analyze("proj-1", "ch-1", "content");

    expect(result).toEqual(payload);
  });

  it("coerces non-array parsed fields to empty arrays", async () => {
    mockAssemble();
    mockCallLLM.mockResolvedValue(
      JSON.stringify({ conflicts: "oops", suggestions: null, references: 42 })
    );

    const service = new AIAnalysisService({} as never);
    const result = await service.analyze("proj-1", "ch-1", "content");

    expect(result).toEqual({ conflicts: [], suggestions: [], references: [] });
  });

  it("falls back to empty arrays plus rawResponse when the response is unparseable", async () => {
    mockAssemble();
    const raw = "이건 JSON이 아닙니다.";
    mockCallLLM.mockResolvedValue(raw);

    const service = new AIAnalysisService({} as never);
    const result = await service.analyze("proj-1", "ch-1", "content");

    expect(result).toEqual({
      conflicts: [],
      suggestions: [],
      references: [],
      rawResponse: raw,
    });
  });

  it("calls callLLM with the default analysis model and maxTokens 4096", async () => {
    mockAssemble();
    mockCallLLM.mockResolvedValue(
      JSON.stringify({ conflicts: [], suggestions: [], references: [] })
    );

    const service = new AIAnalysisService({} as never);
    await service.analyze("proj-1", "ch-1", "content");

    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-haiku-4.5",
        maxTokens: 4096,
      })
    );
  });

  it("creates the LLM usage logger with feature=analysis, projectId, and explicit userId", async () => {
    mockAssemble();
    mockCallLLM.mockResolvedValue(
      JSON.stringify({ conflicts: [], suggestions: [], references: [] })
    );

    const service = new AIAnalysisService({} as never);
    await service.analyze("proj-1", "ch-1", "content", { userId: "user-9" });

    expect(mockCreateLLMUsageLogger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: "proj-1",
        userId: "user-9",
        feature: "analysis",
        promptTemplateKey: "analysis.chapter",
      })
    );
  });

  it("defaults userId to null when no options are passed", async () => {
    mockAssemble();
    mockCallLLM.mockResolvedValue(
      JSON.stringify({ conflicts: [], suggestions: [], references: [] })
    );

    const service = new AIAnalysisService({} as never);
    await service.analyze("proj-1", "ch-1", "content");

    expect(mockCreateLLMUsageLogger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: null })
    );
  });

  it("assembles context with (projectId, chapterId, content) and feeds it into the LLM prompt", async () => {
    const assembleMock = mockAssemble({
      genreRules: "[로맨스물]\n- (연애) 두 사람은 이미 연인이다",
      ragContext: "1. [entity/CHARACTER] 주인공: 검사",
      recentChapters: "### Ch.1 — 시작\n옛날 옛적에",
      currentChapter: "주인공이 검을 뽑았다.",
      conflicts: [],
    });
    mockCallLLM.mockResolvedValue(
      JSON.stringify({ conflicts: [], suggestions: [], references: [] })
    );

    const service = new AIAnalysisService({} as never);
    await service.analyze("proj-1", "ch-1", "주인공이 검을 뽑았다.");

    expect(assembleMock).toHaveBeenCalledWith(
      "proj-1",
      "ch-1",
      "주인공이 검을 뽑았다."
    );

    const call = mockCallLLM.mock.calls[0][0];
    expect(typeof call.system).toBe("string");
    expect(call.system.length).toBeGreaterThan(0);
    expect(typeof call.user).toBe("string");
    expect(call.user.length).toBeGreaterThan(0);
    expect(call.user).toContain("로맨스물");
    expect(call.user).toContain("주인공이 검을 뽑았다.");
  });
});
