import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMUsageCallback } from "@/lib/services/llm.service";
import type { LLMProviderRouting } from "@/lib/services/llm-models";

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock("@/lib/services/llm-budget.service", () => ({ LLMBudgetError: class extends Error {} }));
vi.mock("@/lib/services/llm.service", () => ({
  callLLM: mocks.callLLM,
  isPermanentProviderError: () => false,
}));

import {
  stage1ExtractNouns,
  stage2Classify,
  stage3ExtractRelations,
} from "@/lib/services/entity-extraction/stage-llm-wrappers";

const content = "리엔은 친구 카엘과 함께 서고로 갔다.";
const routing: LLMProviderRouting = {
  only: ["anthropic"],
  allow_fallbacks: false,
  max_price: { prompt: 1, completion: 5, request: 0 },
};
const options = { maxRetries: 0, providerRouting: routing };
const candidates = Array.from({ length: 41 }, (_, index) => `인물${index}`);

beforeEach(() => mocks.callLLM.mockReset().mockResolvedValue("[]"));

describe("opt-in extraction evaluation controls", () => {
  it("leaves retry/routing defaults untouched for all product stages", async () => {
    await stage1ExtractNouns(content, []);
    await stage2Classify(["리엔"], content, []);
    await stage3ExtractRelations([
      { name: "리엔", type: "CHARACTER" },
      { name: "카엘", type: "CHARACTER" },
    ], content, []);
    expect(mocks.callLLM).toHaveBeenCalledTimes(3);
    for (const [params] of mocks.callLLM.mock.calls) {
      expect(params).not.toHaveProperty("maxRetries");
      expect(params).not.toHaveProperty("provider");
      expect(params).toMatchObject({ temperature: 0.1, cacheSystemPrompt: true });
    }
  });

  it("forwards zero retries and exact routing for stage 1 and a single stage 2 batch", async () => {
    await stage1ExtractNouns(content, [], options);
    await stage2Classify(["리엔"], content, [], options);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    for (const [params] of mocks.callLLM.mock.calls) {
      expect(params.maxRetries).toBe(0);
      expect(params.provider).toBe(routing);
    }
  });

  it.each([
    [undefined, 4],
    [1, 1],
  ])("keeps default concurrency or serializes opted-in batches (%s)", async (stage2Concurrency, expectedPeak) => {
    let inFlight = 0;
    let peak = 0;
    mocks.callLLM.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return "[]";
    });
    await stage2Classify(candidates, candidates.join(" "), [], {
      ...options,
      ...(stage2Concurrency !== undefined ? { stage2Concurrency } : {}),
    });
    expect(peak).toBe(expectedPeak);
    expect(inFlight).toBe(0);
    expect(mocks.callLLM).toHaveBeenCalledTimes(5);
    for (const [params] of mocks.callLLM.mock.calls) {
      expect(params.maxRetries).toBe(0);
      expect(params.provider).toBe(routing);
    }
  });

  it("retains the stage 3 single minimal-prompt retry", async () => {
    mocks.callLLM.mockResolvedValueOnce("invalid JSON").mockResolvedValueOnce("[]");
    await stage3ExtractRelations([
      { name: "리엔", type: "CHARACTER" },
      { name: "카엘", type: "CHARACTER" },
    ], content, []);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    for (const [params] of mocks.callLLM.mock.calls) {
      expect(params).not.toHaveProperty("maxRetries");
      expect(params).not.toHaveProperty("provider");
    }
  });
});

it.each([
  ["broken", "array_parse", undefined],
  ['[{"name":"리엔"}]', "shape", "[0].type"],
  ['[{"name":"리엔","type":"CHARACTER","importance":"high","summary":"","confidence":1,"facts":[{"fact_type":"ROLE","value":"사서","evidence":null}]}]', "shape", "[0].facts[0].evidence"],
  ["[]", "valid", undefined],
])("distinguishes validation outcomes without changing acceptance: %s", async (raw, outcome, fieldPath) => {
  mocks.callLLM.mockResolvedValue(raw);
  const onValidation = vi.fn();
  const result = stage2Classify(["리엔"], content, [], { onValidation });
  if (outcome === "valid") await expect(result).resolves.toEqual([]);
  else await expect(result).rejects.toThrow("invalid response");
  expect(onValidation).toHaveBeenCalledWith(expect.objectContaining({ stage: "stage2", batch: 1, candidates: ["리엔"], outcome,
    ...(fieldPath ? { fieldPath } : {}) }));
});

it("preserves first-batch evidence and stops before a third serial batch", async () => {
  const diagnostics: unknown[] = [];
  mocks.callLLM.mockResolvedValueOnce("[]").mockResolvedValueOnce("broken");
  await expect(stage2Classify(candidates, candidates.join(" "), [], {
    stage2Concurrency: 1, onValidation: (d) => { diagnostics.push(d); },
  })).rejects.toThrow("invalid response");
  expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  expect(diagnostics).toMatchObject([{ batch: 1, outcome: "valid" }, { batch: 2, outcome: "array_parse" }]);
});

it("keeps a compact 10-candidate response and three directly supported facts intact", async () => {
  const names = Array.from({ length: 10 }, (_, i) => `인물${i}`);
  const source = names.map(name => `${name}은 엘프 사서이며 변신마법을 쓴다.`).join(" ");
  const entities = names.map(name => ({ name, type: "CHARACTER", sub_type: "named",
    importance: "high", summary: "변신마법을 쓰는 엘프 사서", confidence: 0.9,
    context_snippet: `${name}은 엘프 사서이며 변신마법을 쓴다.`,
    facts: [
      { fact_type: "ATTRIBUTE", value: "엘프", evidence: `${name}은 엘프 사서이며 변신마법을 쓴다.`, confidence: 0.95 },
      { fact_type: "ROLE", value: "사서", evidence: `${name}은 엘프 사서이며 변신마법을 쓴다.`, confidence: 0.85 },
      { fact_type: "ABILITY", value: "변신마법", evidence: `${name}은 엘프 사서이며 변신마법을 쓴다.`, confidence: 0.8 },
    ],
  }));
  mocks.callLLM.mockResolvedValue(JSON.stringify(entities));
  await expect(stage2Classify(names, source, [])).resolves.toEqual(entities);
  expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  expect(mocks.callLLM.mock.calls[0][0]).toMatchObject({ maxTokens: 2048, temperature: 0.1 });
});

it("uses batch-local shared references without changing concurrency or diagnostics", async () => {
  const names = Array.from({ length: 14 }, (_, i) => `공유인물${i}`);
  const source = `${names.join("과 ")}은 사서다. ${"각자 원문을 읽고 기록했다. ".repeat(14)}`;
  const onBatchComplete = vi.fn<(batch: number, candidates: string[]) => LLMUsageCallback>(() => vi.fn<LLMUsageCallback>());
  const onValidation = vi.fn();
  await stage2Classify(names, source, [], { stage2EvalProfile: "stage2-compact-v3", stage2Concurrency: 1, onBatchComplete, onValidation });
  expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  expect(onBatchComplete.mock.calls.map(([batch, batchNames]) => ({ batch, names: batchNames })))
    .toEqual([{ batch: 1, names: names.slice(0, 10) }, { batch: 2, names: names.slice(10) }]);
  expect(onValidation.mock.calls.map(([d]) => [d.batch, d.outcome])).toEqual([[1, "valid"], [2, "valid"]]);
  for (let i = 0; i < 2; i++) {
    const { user } = mocks.callLLM.mock.calls[i][0];
    const payload = user.split("<candidate_snippets>\n")[1].split("\n</candidate_snippets>")[0];
    const data = JSON.parse(payload.slice(payload.indexOf("\n") + 1));
    expect(data.candidates.map((c: { name: string }) => c.name)).toEqual(i ? names.slice(10) : names.slice(0, 10));
    expect(data.windows[0].id).toBe(1);
  }
});

it("diagnostics and budget controls alone keep narrow inline product input", async () => {
  const source = "리엔은 사서다. 시장 사람들은 책을 읽었다.";
  await stage2Classify(["리엔"], source, [], { ...options, captureResponseDiagnostics: true, onValidation: vi.fn() });
  const { user, system } = mocks.callLLM.mock.calls[0][0];
  expect(user).toContain('- **리엔**\n  "리엔은 사서다."');
  expect(user).not.toContain("시장 사람들은 책을 읽었다.");
  expect(user).not.toContain("window_ids");
  expect(system).not.toContain("출력 계약:");
});
