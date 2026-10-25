import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: vi.fn(),
  BudgetError: class extends Error {},
  PermanentError: class extends Error {},
}));
vi.mock("@/lib/services/llm-budget.service", () => ({ LLMBudgetError: mocks.BudgetError }));
vi.mock("@/lib/services/llm.service", () => ({
  callLLM: async (params: {
    beforeRequest?: () => Promise<void>;
    onComplete?: (usage: unknown) => Promise<void>;
  }) => {
    await params.beforeRequest?.();
    const raw = await mocks.provider();
    await params.onComplete?.({ success: true, costUSD: 0.01 });
    return raw;
  },
  isPermanentProviderError: (error: unknown) => error instanceof mocks.PermanentError,
}));
import {
  stage1ExtractNouns,
  stage2Classify,
  stage3ExtractRelations,
} from "@/lib/services/entity-extraction/stage-llm-wrappers";
import { ExtractionStageError } from "@/lib/services/entity-extraction/stage-error";

const known = [
  { name: "리엔", type: "CHARACTER" },
  { name: "카엘", type: "CHARACTER" },
];
const content = "리엔은 친구 카엘과 함께 서고로 갔다.";
const entity = {
  name: "리엔", type: "CHARACTER", importance: "high", summary: "카엘의 친구",
  confidence: 0.99, context_snippet: content,
};
const relation = {
  from_name: "리엔", to_name: "카엘", relation_type: "ALLY", direction: "BI",
  weight: 0.9, context_snippet: content,
};
type Stage = "stage1" | "stage2" | "stage3";
const stages: Stage[] = ["stage1", "stage2", "stage3"];
function run(stage: Stage, options = {}) {
  if (stage === "stage1") return stage1ExtractNouns(content, [], options);
  if (stage === "stage2") return stage2Classify(["리엔"], content, [], options);
  return stage3ExtractRelations(known, content, [], options);
}

beforeEach(() => {
  mocks.provider.mockReset().mockResolvedValue("[]");
});

describe("extraction response failures", () => {
  it.each(stages)("treats a valid empty %s response as success without retry", async (stage) => {
    await expect(run(stage)).resolves.toEqual([]);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });

  it("accepts valid nouns and source-backed relations", async () => {
    mocks.provider.mockResolvedValueOnce('["리엔", "카엘"]');
    await expect(run("stage1")).resolves.toEqual(["리엔", "카엘"]);
    mocks.provider.mockResolvedValueOnce(JSON.stringify([relation]));
    await expect(run("stage3")).resolves.toEqual([relation]);
    expect(mocks.provider).toHaveBeenCalledTimes(2);
  });

  it("treats empty classification batches as a successful empty run", async () => {
    const candidates = Array.from({ length: 11 }, (_, index) => `인물${index}`);
    await expect(stage2Classify(candidates, candidates.join(" "), [])).resolves.toEqual([]);
    expect(mocks.provider).toHaveBeenCalledTimes(2);
  });

  it.each(stages)("reports unrecoverable %s JSON with its stage", async (stage) => {
    mocks.provider.mockResolvedValue('[{"name":"리엔"');
    await expect(run(stage)).rejects.toMatchObject({
      name: "ExtractionStageError", stage, message: `${stage}: invalid response`,
    });
    expect(mocks.provider).toHaveBeenCalledTimes(stage === "stage3" ? 2 : 1);
  });

  it("does not harvest quoted nouns out of a broken or non-array response", async () => {
    mocks.provider.mockResolvedValue('분석 실패: "리엔"');
    await expect(run("stage1")).rejects.toBeInstanceOf(ExtractionStageError);
  });

  it.each([
    ["stage1", '["리엔", null]'],
    ["stage2", JSON.stringify([entity, { name: "카엘", type: "CHARACTER" }])],
    ["stage2", JSON.stringify([{ ...entity, confidence: "0.99" }])],
    ["stage2", JSON.stringify([{ ...entity, context_snippet: 12 }])],
    ["stage2", JSON.stringify([{ ...entity, facts: [{ value: "설정" }] }])],
    ["stage3", JSON.stringify([relation, { from_name: "리엔" }])],
    ["stage3", JSON.stringify([{ ...relation, weight: 1.1 }])],
  ] as [Stage, string][])("fails the entire %s response on invalid required shape: %s", async (stage, raw) => {
    mocks.provider.mockResolvedValue(raw);
    await expect(run(stage)).rejects.toMatchObject({ stage, message: `${stage}: invalid response` });
  });

  it("keeps existing Korean quote repair for a valid classification", async () => {
    mocks.provider.mockResolvedValue(`[
  {
    "name": "리엔",
    "type": "CHARACTER",
    "importance": "high",
    "summary": "카엘이 "친구"라고 부르는 인물",
    "confidence": 0.99
  }
]`);
    await expect(run("stage2")).resolves.toEqual([
      expect.objectContaining({ name: "리엔", summary: "카엘이 '친구'라고 부르는 인물", context_snippet: content }),
    ]);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });

  it.each(stages)("does not turn transient %s provider failures into empty success", async (stage) => {
    const cause = new Error("temporary provider failure");
    mocks.provider.mockRejectedValue(cause);
    await expect(run(stage)).rejects.toMatchObject({ stage, cause, message: `${stage}: request failed` });
    expect(mocks.provider).toHaveBeenCalledTimes(stage === "stage3" ? 2 : 1);
  });

  it.each(stages)("preserves a permanent %s provider failure and does not retry", async (stage) => {
    const error = new mocks.PermanentError("unauthorized");
    mocks.provider.mockRejectedValue(error);
    await expect(run(stage)).rejects.toBe(error);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });

  it("recovers relations through the existing single minimal-prompt retry", async () => {
    mocks.provider.mockResolvedValueOnce("broken").mockResolvedValueOnce(JSON.stringify([relation]));
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    await expect(run("stage3", { beforeRequest })).resolves.toEqual([relation]);
    expect(beforeRequest).toHaveBeenCalledTimes(2);
    expect(mocks.provider).toHaveBeenCalledTimes(2);
  });

  it("keeps successful provider accounting even when response interpretation fails", async () => {
    mocks.provider.mockResolvedValue("broken");
    const onComplete = vi.fn().mockResolvedValue(undefined);
    await expect(run("stage2", { onComplete })).rejects.toMatchObject({ stage: "stage2" });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ success: true, costUSD: 0.01 });
  });

  it("drains started Stage2 calls and stops scheduling after a batch fails, without retries", async () => {
    let releaseStarted!: () => void;
    const pending = new Promise<string>((resolve) => { releaseStarted = () => resolve("[]"); });
    mocks.provider.mockResolvedValueOnce("broken").mockImplementation(() => pending);
    const candidates = Array.from({ length: 60 }, (_, index) => `인물${index}`);
    const onComplete = vi.fn().mockResolvedValue(undefined);
    let settled = false;
    const task = stage2Classify(candidates, candidates.join(" "), [], { onComplete });
    const outcome = task.catch((error: unknown) => { settled = true; return error; });
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mocks.provider).toHaveBeenCalledTimes(4);
    expect(settled).toBe(false);
    releaseStarted();
    await expect(outcome).resolves.toMatchObject({ stage: "stage2" });
    expect(mocks.provider).toHaveBeenCalledTimes(4);
    expect(onComplete).toHaveBeenCalledTimes(4);
  });
});
