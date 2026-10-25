import { describe, it, expect, vi } from "vitest";
import { EvalRequestBudget } from "../../../../scripts/ops/extraction-eval-budget";
import { callLLM, type LLMUsageMetadata } from "@/lib/services/llm.service";

const metadata = (costUsd = 0.001): LLMUsageMetadata => ({ provider: "openrouter",
  model: "anthropic/claude-haiku-4.5", success: true, elapsedMs: 1, retryCount: 0,
  timedOut: false, costUsd, usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } });

it.each([25, 13])("blocks before request %i+1", async (cap) => {
  const budget = new EvalRequestBudget(cap, 1, () => {});
  for (let i = 0; i < cap; i++) {
    await budget.beforeRequest(); await budget.onComplete(metadata(0));
  }
  await expect(budget.beforeRequest()).rejects.toThrow("request cap");
  expect(budget.snapshot.attempts).toBe(cap);
});

it("reserves worst-case cost before sending and permits exact remaining bound", async () => {
  const budget = new EvalRequestBudget(25, 0.5, () => {});
  await budget.beforeRequest(); await budget.onComplete(metadata(0.09));
  await expect(budget.beforeRequest()).rejects.toThrow("cost reservation cap");
  expect(budget.snapshot.attempts).toBe(1);
});

it("never frees unknown cost or allows concurrent requests", async () => {
  const budget = new EvalRequestBudget(25, 1, () => {});
  await budget.beforeRequest();
  await expect(budget.onComplete({ ...metadata(), costUsd: undefined })).rejects.toThrow("unknown cost");
  expect(budget.snapshot.reservedUsd).toBe(0.41024);
  await expect(budget.beforeRequest()).rejects.toThrow();
  const concurrent = new EvalRequestBudget(25, 1, () => {});
  await concurrent.beforeRequest();
  await expect(concurrent.beforeRequest()).rejects.toThrow("concurrent");
});

it.each([NaN, Infinity, -1])("halts on invalid cost %s", async (cost) => {
  const budget = new EvalRequestBudget(25, 1, () => {});
  await budget.beforeRequest(); await expect(budget.onComplete(metadata(cost))).rejects.toThrow();
  await expect(budget.beforeRequest()).rejects.toThrow();
});

it("accounts for known cost on failure and stops", async () => {
  const budget = new EvalRequestBudget(25, 1, () => {});
  await budget.beforeRequest();
  await expect(budget.onComplete({ ...metadata(), success: false })).rejects.toThrow();
  expect(budget.snapshot.spentUsd).toBe(0.001);
  await expect(budget.beforeRequest()).rejects.toThrow();
});

it("records an over-reservation actual cost and stops subsequent requests", async () => {
  const budget = new EvalRequestBudget(25, 1, () => {});
  await budget.beforeRequest();
  await expect(budget.onComplete(metadata(0.5))).rejects.toThrow("actual cost exceeded");
  expect(budget.snapshot.spentUsd).toBe(0.5);
  await expect(budget.beforeRequest()).rejects.toThrow();
});

it.each(["reserved", "completed"])("disk failure at %s latches stop", async (kind) => {
  const budget = new EvalRequestBudget(25, 1, (event) => {
    if (event.kind === kind) throw new Error("disk full");
  });
  if (kind === "reserved") await expect(budget.beforeRequest()).rejects.toThrow("record failed");
  else { await budget.beforeRequest(); await expect(budget.onComplete(metadata())).rejects.toThrow("record failed"); }
  await expect(budget.beforeRequest()).rejects.toThrow();
});

it("LLM usage callback failure stops through LLMBudgetError instead of being swallowed", async () => {
  const budget = new EvalRequestBudget(25, 1, (event) => {
    if (event.kind === "completed") throw new Error("disk full");
  });
  const client = { create: vi.fn().mockResolvedValue({ id: "test", choices: [{ message: { content: "OK" } }],
    usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3, cost: 0.001 } }) };
  const options = { system: "test", user: "test", maxRetries: 0, client: client as never,
    beforeRequest: budget.beforeRequest, onComplete: budget.onComplete };
  await expect(callLLM(options)).rejects.toThrow("record failed");
  await expect(callLLM(options)).rejects.toThrow();
  expect(client.create).toHaveBeenCalledTimes(1);
});

describe("limits", () => {
  it.each([[26, 1], [25, 1.1], [0, 1], [1, NaN]])("rejects unsafe configuration", (requests, usd) => {
    expect(() => new EvalRequestBudget(requests, usd, () => {})).toThrow();
  });
});

it("halts on missing token usage even when cost is known", async () => {
  const budget = new EvalRequestBudget(25, 1, () => {});
  await budget.beforeRequest();
  await expect(budget.onComplete({ ...metadata(), usage: undefined })).rejects.toThrow("token usage");
  await expect(budget.beforeRequest()).rejects.toThrow();
});
