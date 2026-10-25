import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paid: vi.fn(),
  guard: vi.fn(),
  embeddingContext: vi.fn(),
  guardContext: vi.fn(),
  BudgetError: class extends Error {},
}));
vi.mock("@/lib/services/llm-budget.service", () => ({
  LLMBudgetError: mocks.BudgetError,
  createLLMBudgetGuard: (_client: unknown, context: unknown) => {
    mocks.guardContext(context);
    return mocks.guard;
  },
}));
vi.mock("@/lib/services/llm.service", () => ({
  callLLM: async (params: { beforeRequest?: () => Promise<void> }) => {
    await params.beforeRequest?.();
    return mocks.paid();
  },
  isPermanentProviderError: () => false,
}));
vi.mock("@/lib/services/embedding.service", () => ({
  embedText: async (_text: string, options: { beforeRequest?: () => Promise<void> }) => {
    await options.beforeRequest?.();
    return mocks.paid();
  },
}));
vi.mock("@/lib/services/budgeted-embedding", () => ({
  createBudgetedEmbeddingOptions: (_client: unknown, context: unknown) => {
    mocks.embeddingContext(context);
    return { beforeRequest: mocks.guard };
  },
}));
import {
  stage1ExtractNouns,
  stage2Classify,
  stage3ExtractRelations,
} from "@/lib/services/entity-extraction/stage-llm-wrappers";
import { createDistillationDeps, runExtractionDistillation } from "@/lib/services/extraction-memory/distillation.service";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockReset().mockResolvedValue(undefined);
  mocks.paid.mockReset().mockResolvedValue("[]");
});
const known = [
  { name: "리엔", type: "CHARACTER" as const, aliases: [] },
  { name: "카엘", type: "CHARACTER" as const, aliases: [] },
];
const content = "리엔은 친구 카엘과 함께 서고로 갔다.";

describe("extraction paid boundaries", () => {
  it.each(["stage1", "stage2", "stage3"])("propagates %s budget rejection without a paid request", async (stage) => {
    const blocked = new mocks.BudgetError("blocked");
    mocks.guard.mockRejectedValue(blocked);
    const options = { beforeRequest: mocks.guard };
    const task = stage === "stage1"
      ? stage1ExtractNouns(content, [], options)
      : stage === "stage2"
        ? stage2Classify(["리엔"], content, [], options)
        : stage3ExtractRelations(known, content, [], options);
    await expect(task).rejects.toBe(blocked);
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("checks the budget again before a relation parse retry", async () => {
    const blocked = new mocks.BudgetError("blocked on retry");
    mocks.guard.mockResolvedValueOnce(undefined).mockRejectedValueOnce(blocked);
    mocks.paid.mockResolvedValueOnce("unparseable");
    await expect(stage3ExtractRelations(known, content, [], {
      beforeRequest: mocks.guard,
    })).rejects.toBe(blocked);
    expect(mocks.guard).toHaveBeenCalledTimes(2);
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });

  it("blocks memory distillation without invoking the paid request", async () => {
    const { client } = createSupabaseMock({});
    mocks.guard.mockRejectedValue(new mocks.BudgetError("cannot verify"));
    const deps = createDistillationDeps(client as never, { projectId: "p1", userId: "owner-1" });
    const outcome = await runExtractionDistillation("p1", {
      ...deps,
      loadRecentDismissedNames: async () => ["a", "b", "c", "d"],
      loadApprovedEntityNames: async () => [],
      loadExistingRuleKeys: async () => new Set(),
    });
    expect(outcome).toEqual({ proposed: 0, error: "cannot verify" });
    expect(mocks.guardContext).toHaveBeenCalledWith({ projectId: "p1", userId: "owner-1" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
});
