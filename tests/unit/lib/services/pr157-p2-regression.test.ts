import { beforeEach, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/services/llm.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/llm.service")>();
  return { ...actual, callLLM: (params: Parameters<typeof actual.callLLM>[0]) =>
    actual.callLLM({ ...params, client: provider as never }) };
});
import { stage2Classify } from "@/lib/services/entity-extraction/stage-llm-wrappers";
import { STAGE2_EVAL_PROFILE } from "@/lib/services/entity-extraction/stage2-eval-contract";
import { normalizeClassifiedEntitiesForRunner } from "@/lib/services/entity-extraction/runner";
import { runEval } from "@/lib/services/extraction-eval/runner";
import { EvalRequestBudget } from "../../../../scripts/ops/extraction-eval-budget";
import { createEvalDiagnostics } from "../../../../scripts/ops/extraction-eval-diagnostics";
const completion = (raw: string, finish: string, cost: number | undefined = 0.001) => ({ id: "mock-response",
  choices: [{ message: { content: raw }, finish_reason: finish }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost } });
const person = { name: "북부 종복", type: "CHARACTER", sub_type: "unnamed", importance: "high",
  summary: "검을 든 종복", confidence: 0.9 };
const source = "북부 종복이 검을 들었다. 마을 사람들은 시장으로 향했다.";
beforeEach(() => { provider.create.mockReset(); });

it.each([undefined, "stage2-compact-v3", STAGE2_EVAL_PROFILE] as const)("keeps individual CHARACTER for profile %s", async profile => {
  for (const context of [undefined, "", "원문에 없는 인용"]) {
    provider.create.mockClear();
  const rows = [{ ...person, ...(context !== undefined ? { context_snippet: context } : {}) }];
  provider.create.mockResolvedValue(completion(JSON.stringify(profile === STAGE2_EVAL_PROFILE ? { entities: rows } : rows), "stop"));
  const classified = await stage2Classify([person.name], source, [], { stage2EvalProfile: profile });
  expect(classified[0].context_snippet).toBe("북부 종복이 검을 들었다.");
  expect(normalizeClassifiedEntitiesForRunner(classified, source)[0]).toMatchObject({ type: "CHARACTER", sub_type: "unnamed" });
  const content = provider.create.mock.calls[0][0].messages[1].content;
  if (profile) expect(content).toContain("마을 사람들은 시장으로 향했다.");
  else expect(content).not.toContain("마을 사람들은 시장으로 향했다.");
  }
});

it("preserves valid model-provided context", async () => {
  const context_snippet = "북부 종복이 검을 들었다.";
  provider.create.mockResolvedValue(completion(JSON.stringify([{ ...person, context_snippet }]), "stop"));
  expect((await stage2Classify([person.name], source, []))[0].context_snippet).toBe(context_snippet);
});

it("still normalizes an explicitly plural group", async () => {
  const text = "북부 종복들이 검을 들었다. 마을 사람들은 시장으로 향했다.";
  provider.create.mockResolvedValue(completion(JSON.stringify([person]), "stop"));
  const classified = await stage2Classify([person.name], text, []);
  expect(classified[0].context_snippet).toBe("북부 종복들이 검을 들었다.");
  expect(normalizeClassifiedEntitiesForRunner(classified, text)[0]).toMatchObject({ type: "CONCEPT", sub_type: "role" });
});

it.each(['{"entities":[]}', JSON.stringify({ entities: [{ ...person, context_snippet: "북부 종복이 검을 들었다." }] })])
  ("aborts valid JSON + length after cost/raw without adopting a partial batch: %s", async raw => {
    provider.create.mockResolvedValue(completion(raw, "length"));
    const events: string[] = [], save = vi.fn(() => { events.push("raw"); });
    const budget = new EvalRequestBudget(25, 1, event => {
      if (event.kind === "completed") events.push("cost");
      if (event.kind === "stopped") events.push("stop");
    });
    const diagnostics = createEvalDiagnostics("mock-stage2", budget.onComplete, save, reason => budget.stop(reason));
    const scenarios = ["first", "next"].map(id => ({ id, source: "synthetic", chapterText: source,
      shouldExtract: [person.name], shouldNotExtract: [] }));
    const names = [person.name, ...Array.from({ length: 13 }, (_, i) => `사서${i}`)];
    const run = await runEval({ runId: "offline", startedAt: "offline", tier: "smoke", stopOnFailure: true,
      shouldStop: () => budget.reason, scenarios,
      extract: async text => ({ names: (await stage2Classify(names, text, [], { stage2EvalProfile: STAGE2_EVAL_PROFILE,
        stage2EvalBatchSize: 5, maxRetries: 0, stage2Concurrency: 1, beforeRequest: budget.beforeRequest,
        ...diagnostics })).map(e => e.name) }) });
    expect(run.status).toBe("aborted");
    expect(run.results).toHaveLength(1);
    expect(run.results[0].environmentFailure).toBe(true);
    expect(run.results[0]).toMatchObject({ score: 0, tp: 0, fp: 0 });
    expect(run.unexecutedScenarioIds).toEqual(["next"]);
    expect(events).toEqual(["cost", "raw", "stop"]);
    expect(budget.snapshot).toMatchObject({ attempts: 1, spentUsd: 0.001, reservedUsd: 0 });
    expect(budget.reason).toBe("provider output reached length limit");
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("mock-stage2-batch1-response.json", expect.objectContaining({
      responseDiagnostics: { raw, finishReason: "length" } }));
    await expect(budget.beforeRequest()).rejects.toThrow("length");
  });

it("keeps stop responses and product default length handling unchanged", async () => {
  provider.create.mockResolvedValue(completion(JSON.stringify([person]), "length"));
  expect(await stage2Classify([person.name], source, [])).toHaveLength(1);
  provider.create.mockResolvedValue(completion(JSON.stringify({ entities: [person] }), "stop"));
  const budget = new EvalRequestBudget(25, 1, () => {});
  const diagnostics = createEvalDiagnostics("mock", budget.onComplete, vi.fn(), reason => budget.stop(reason));
  expect(await stage2Classify([person.name], source, [], { stage2EvalProfile: STAGE2_EVAL_PROFILE,
    beforeRequest: budget.beforeRequest, ...diagnostics })).toHaveLength(1);
  expect(budget.reason).toBeUndefined();
});

it("preserves unknown-cost priority and raw recording on length", async () => {
  const response = completion('{"entities":[]}', "length");
  delete (response.usage as { cost?: number }).cost;
  provider.create.mockResolvedValue(response);
  const budget = new EvalRequestBudget(25, 1, () => {}), save = vi.fn();
  const diagnostics = createEvalDiagnostics("mock", budget.onComplete, save, reason => budget.stop(reason));
  await expect(stage2Classify([person.name], source, [], { stage2EvalProfile: STAGE2_EVAL_PROFILE,
    beforeRequest: budget.beforeRequest, ...diagnostics })).rejects.toThrow("unknown cost");
  expect(save).toHaveBeenCalledTimes(1);
  expect(budget.snapshot.reservedUsd).toBeGreaterThan(0);
  expect(budget.reason).toBe("unknown cost");
  expect(provider.create).toHaveBeenCalledTimes(1);
});
