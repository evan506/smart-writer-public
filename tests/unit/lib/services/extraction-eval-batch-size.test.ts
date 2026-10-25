import { beforeEach, expect, it, vi } from "vitest";
import { STAGE2_EVAL_PROFILE } from "@/lib/services/entity-extraction/stage2-eval-contract";
import { buildClassificationBatchContext } from "@/lib/services/entity-extraction/classification-context";
import { EvalRequestBudget } from "../../../../scripts/ops/extraction-eval-budget";
import { LLMBudgetError } from "@/lib/services/llm-budget.service";
import type { LLMUsageMetadata } from "@/lib/services/llm.service";
const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock("@/lib/services/llm.service", () => ({ callLLM: mocks.callLLM,
  isPermanentProviderError: (e: { status?: number }) => e.status === 400 }));
import { stage2Classify } from "@/lib/services/entity-extraction/stage-llm-wrappers";

const options = { stage2EvalProfile: STAGE2_EVAL_PROFILE as typeof STAGE2_EVAL_PROFILE,
  stage2EvalBatchSize: 5 as const, stage2Concurrency: 1, maxRetries: 0 };
beforeEach(() => { mocks.callLLM.mockReset(); });
const namesFor = (count: number) => Array.from({ length: count }, (_, i) => `하린${i}`);
const textFor = (names: string[]) => names.map((name) => `${name}은 엘프 사서다. ${name}은 실제로 늑대로 변신했다.`).join("\n");
const row = (name: string) => ({ name, type: "CHARACTER", importance: "high", summary: "변신하는 엘프 사서", confidence: 0.9,
  context_snippet: `${name}은 엘프 사서다.`, facts: [
    { fact_type: "ATTRIBUTE", evidence: `${name}은 엘프 사서다.`, value: "엘프", confidence: 0.9 },
    { fact_type: "ROLE", evidence: `${name}은 엘프 사서다.`, value: "사서", confidence: 0.9 },
    { fact_type: "ABILITY", evidence: `${name}은 실제로 늑대로 변신했다.`, value: "변신", confidence: 0.9 },
  ] });

it.each([5, 6, 10, 14, 20])("splits %i candidates once in order and preserves facts and source windows", async (count) => {
  const names = namesFor(count), text = textFor(names), batches: string[][] = [];
  const onBatchComplete = vi.fn((_batch: number, candidates: string[]) => { batches.push(candidates); return vi.fn(); });
  mocks.callLLM.mockImplementation(async () => JSON.stringify({ entities: batches.at(-1)!.map(row) }));
  const result = await stage2Classify(names, text, [], { ...options, onBatchComplete });
  expect(batches.map((b) => b.length)).toEqual(Array.from({ length: Math.ceil(count / 5) }, (_, i) => Math.min(5, count - i * 5)));
  expect(batches.flat()).toEqual(names);
  expect(result).toEqual(names.map(row));
  for (const [i, [request]] of mocks.callLLM.mock.calls.entries()) {
    expect(request.user).toContain(buildClassificationBatchContext(batches[i], text).payload);
    expect(request).toMatchObject({ maxTokens: 2048, temperature: 0.1, maxRetries: 0 });
    // Per-candidate extraction does not depend on the batch size or shared representation.
    const original = buildClassificationBatchContext(names, text).snippetMap;
    for (const name of batches[i]) expect(buildClassificationBatchContext(batches[i], text).snippetMap.get(name)).toBe(original.get(name));
  }
});

it.each([undefined, STAGE2_EVAL_PROFILE] as const)("keeps ten candidates per batch when size is omitted (profile %s)", async (profile) => {
  const names = namesFor(14), batches: string[][] = [];
  mocks.callLLM.mockResolvedValue(profile ? '{"entities":[]}' : "[]");
  await stage2Classify(names, textFor(names), [], { stage2EvalProfile: profile, stage2Concurrency: 1,
    onBatchComplete: (_batch, candidates) => { batches.push(candidates); return vi.fn(); } });
  expect(batches.map((b) => b.length)).toEqual([10, 4]);
});

it("preserves the direct empty wrapper behavior; CLI separately skips empty candidates", async () => {
  mocks.callLLM.mockResolvedValue("[]");
  await expect(stage2Classify([], "", [])).resolves.toEqual([]);
  expect(mocks.callLLM).toHaveBeenCalledTimes(1);
});

it.each([{ stage2EvalBatchSize: 5 }, { ...options, stage2EvalBatchSize: 10 },
  { ...options, stage2EvalBatchSize: 0 }, { ...options, stage2EvalProfile: "other" }])
  ("rejects unsupported wrapper options before any provider call: %j", async (invalid) => {
    await expect(stage2Classify(["하린"], "하린은 엘프다.", [], invalid as never)).rejects.toThrow(/batch size|profile/);
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

it.each(["truncated", "shape", "unsupported"])("returns no partial result and stops before third batch after %s", async (kind) => {
  mocks.callLLM.mockResolvedValueOnce('{"entities":[]}');
  if (kind === "unsupported") mocks.callLLM.mockRejectedValueOnce(Object.assign(Error("schema unsupported"), { status: 400 }));
  else mocks.callLLM.mockResolvedValueOnce(kind === "shape" ? '{"entities":[{"importance":"medium"}]}' : '{"entities":[');
  const names = namesFor(14);
  await expect(stage2Classify(names, textFor(names), [], options)).rejects.toThrow();
  expect(mocks.callLLM).toHaveBeenCalledTimes(2);
});

it.each(["unknown_cost", "record_failure"])("preserves batch cost stopping on %s", async (failure) => {
  const ledger = vi.fn((event: { kind: string }) => {
    if (failure === "record_failure" && event.kind === "completed" && ledger.mock.calls.length >= 4) throw Error("disk");
  });
  const budget = new EvalRequestBudget(25, 1, ledger);
  const names = namesFor(14), sent = vi.fn();
  const metadata: LLMUsageMetadata = { provider: "openrouter", model: "mock", elapsedMs: 1,
    retryCount: 0, timedOut: false, success: true, costUsd: 0.001,
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  mocks.callLLM.mockImplementation(async (params) => {
    await params.beforeRequest(); sent();
    await params.onComplete({ ...metadata, ...(sent.mock.calls.length === 2 && failure === "unknown_cost" ? { costUsd: undefined } : {}) });
    return '{"entities":[]}';
  });
  await expect(stage2Classify(names, textFor(names), [], { ...options,
    beforeRequest: budget.beforeRequest, onComplete: budget.onComplete })).rejects.toBeInstanceOf(LLMBudgetError);
  expect(sent).toHaveBeenCalledTimes(2);
  expect(budget.snapshot.spentUsd).toBe(failure === "unknown_cost" ? 0.001 : 0.002);
  if (failure === "unknown_cost") expect(budget.snapshot.reservedUsd).toBeGreaterThan(0);
  await expect(budget.beforeRequest()).rejects.toBeInstanceOf(LLMBudgetError);
});
