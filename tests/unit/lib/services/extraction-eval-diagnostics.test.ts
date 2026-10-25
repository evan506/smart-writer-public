import { describe, expect, it, vi } from "vitest";
import { callLLM, LLMEmptyResponseError, type LLMUsageMetadata } from "@/lib/services/llm.service";
import { LLMBudgetError } from "@/lib/services/llm-budget.service";
import { EvalRequestBudget } from "../../../../scripts/ops/extraction-eval-budget";
import { createEvalDiagnostics } from "../../../../scripts/ops/extraction-eval-diagnostics";

const usage = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cost: 0.001 };
function client(raw: string | null, finishReason = "stop") {
  return { create: vi.fn().mockResolvedValue({ id: "response-1", usage,
    choices: [{ message: { content: raw }, finish_reason: finishReason }] }) };
}
const stop = () => { throw new LLMBudgetError("unavailable"); };

describe("private response diagnostics", () => {
  it("keeps product requests and metadata free of raw responses", async () => {
    const onComplete = vi.fn(); const provider = client("private");
    expect(await callLLM({ system: "s", user: "u", client: provider as never, onComplete })).toBe("private");
    expect(onComplete.mock.calls[0][0]).not.toHaveProperty("responseDiagnostics");
    expect(provider.create.mock.calls[0][0]).not.toHaveProperty("captureResponseDiagnostics");
  });

  it.each(["stop", "length", "content_filter"])("records finish reason %s after accounting exactly once", async (finishReason) => {
    const events: string[] = []; const account = vi.fn<(metadata: LLMUsageMetadata) => void>(() => { events.push("cost"); });
    const save = vi.fn(() => { events.push("raw"); });
    const opts = createEvalDiagnostics("M08-stage2", account, save, stop);
    const request = callLLM({ system: "s", user: "u", client: client("[]", finishReason) as never, ...opts });
    if (finishReason === "length") await expect(request).rejects.toBeInstanceOf(LLMBudgetError);
    else await request;
    expect(events).toEqual(["cost", "raw"]); expect(account).toHaveBeenCalledTimes(1);
    expect(account.mock.calls[0]).toHaveLength(1);
    expect(save).toHaveBeenCalledWith("M08-stage2-batch1-response.json", expect.objectContaining({
      responseDiagnostics: { raw: "[]", finishReason }, providerResponseId: "response-1" }));
    expect(account.mock.calls[0][0]).not.toHaveProperty("responseDiagnostics");
  });

  it("records paid empty responses before preserving the empty-response failure", async () => {
    const account = vi.fn(); const save = vi.fn(); const provider = client(null);
    await expect(callLLM({ system: "s", user: "u", client: provider as never,
      ...createEvalDiagnostics("M08-stage2", account, save, stop) })).rejects.toBeInstanceOf(LLMEmptyResponseError);
    expect(account).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toMatchObject({ success: false, responseDiagnostics: { raw: null, finishReason: "stop" } });
    expect(provider.create).toHaveBeenCalledTimes(1);
  });

  it("stops on sidecar failure without duplicate accounting or a retry", async () => {
    const account = vi.fn(); const provider = client("[]");
    await expect(callLLM({ system: "s", user: "u", client: provider as never,
      ...createEvalDiagnostics("M08-stage2", account, () => { throw Error("disk"); }, stop)
    })).rejects.toBeInstanceOf(LLMBudgetError);
    expect(account).toHaveBeenCalledTimes(1); expect(provider.create).toHaveBeenCalledTimes(1);
  });

  it("preserves raw evidence even when accounting rejects", async () => {
    const save = vi.fn(); const account = vi.fn(stop);
    await expect(callLLM({ system: "s", user: "u", client: client("[]") as never,
      ...createEvalDiagnostics("M08-stage2", account, save, stop) })).rejects.toBeInstanceOf(LLMBudgetError);
    expect(save).toHaveBeenCalledTimes(1); expect(account).toHaveBeenCalledTimes(1);
  });

  it("keeps response ids associated with their batch when completions arrive out of order", async () => {
    const save = vi.fn(); const d = createEvalDiagnostics("M08-stage2", vi.fn(), save, stop);
    const metadata = { provider: "openrouter" as const, model: "mock", elapsedMs: 1, retryCount: 0, timedOut: false, success: true };
    await d.onBatchComplete(2, ["B"])({ ...metadata, providerResponseId: "second" });
    await d.onBatchComplete(1, ["A"])({ ...metadata, providerResponseId: "first" });
    d.onValidation({ stage: "stage2", batch: 2, candidates: ["B"], outcome: "shape", fieldPath: "[0].facts" });
    expect(save).toHaveBeenLastCalledWith("M08-stage2-batch2-validation.json", expect.objectContaining({ providerResponseId: "second", fieldPath: "[0].facts" }));
  });
  it("records provider failure without inventing a raw response or zero cost", async () => {
    const save = vi.fn(); const account = vi.fn();
    const provider = { create: vi.fn().mockRejectedValue(Object.assign(Error("denied"), { status: 401 })) };
    await expect(callLLM({ system: "s", user: "u", client: provider as never, maxRetries: 0,
      ...createEvalDiagnostics("M01-stage1", account, save, stop) })).rejects.toThrow("denied");
    expect(account).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).not.toHaveProperty("costUsd");
    expect(save.mock.calls[0][1]).not.toHaveProperty("responseDiagnostics", expect.anything());
    expect(provider.create).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing finish reason explicit rather than guessing truncation", async () => {
    const save = vi.fn(); const provider = client("[]");
    provider.create.mockResolvedValue({ id: "r", usage, choices: [{ message: { content: "[]" } }] });
    await callLLM({ system: "s", user: "u", client: provider as never,
      ...createEvalDiagnostics("M01-stage1", vi.fn(), save, stop) });
    expect(save.mock.calls[0][1]).toMatchObject({ responseDiagnostics: { raw: "[]", finishReason: null } });
  });

  it("retains the unknown-cost reservation and stops later requests with real eval accounting", async () => {
    const ledger = vi.fn(); const save = vi.fn(); const budget = new EvalRequestBudget(25, 1, ledger);
    const provider = client("[]");
    provider.create.mockResolvedValue({ id: "r", choices: [{ message: { content: "[]" }, finish_reason: "stop" }] });
    const options = createEvalDiagnostics("M08-stage2", budget.onComplete, save, (reason) => budget.stop(reason));
    await expect(callLLM({ system: "s", user: "u", client: provider as never,
      beforeRequest: budget.beforeRequest, ...options })).rejects.toBeInstanceOf(LLMBudgetError);
    expect(save).toHaveBeenCalledTimes(1);
    expect(budget.reason).toBeTruthy();
    await expect(budget.beforeRequest()).rejects.toBeInstanceOf(LLMBudgetError);
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(budget.snapshot.reservedUsd).toBeGreaterThan(0);
  });

});


it.each(["unsupported", "length", "record_failure"])("preserves eval accounting with structured output: %s", async (failure) => {
  const { STAGE2_EVAL_RESPONSE_FORMAT } = await import("@/lib/services/entity-extraction/stage2-eval-contract");
  const budget = new EvalRequestBudget(25, 1, () => {});
  const provider = client('{"entities":[', "length");
  if (failure === "unsupported") provider.create.mockRejectedValue(Object.assign(Error("schema unsupported"), { status: 400 }));
  const save = vi.fn(() => { if (failure === "record_failure") throw Error("disk"); });
  const options = { system: "s", user: "u", client: provider as never, maxRetries: 0,
    responseFormat: STAGE2_EVAL_RESPONSE_FORMAT, provider: { only: ["anthropic"], allow_fallbacks: false, require_parameters: true },
    beforeRequest: budget.beforeRequest,
    ...createEvalDiagnostics("M05-stage2", budget.onComplete, save, (reason) => budget.stop(reason)) };
  if (failure === "length") {
    await expect(callLLM(options)).rejects.toBeInstanceOf(LLMBudgetError);
    await expect(budget.beforeRequest()).rejects.toBeInstanceOf(LLMBudgetError);
    // Evaluation stops after accounting and raw persistence, before parsing.
    expect(budget.snapshot.spentUsd).toBe(0.001);
    expect(budget.snapshot.attempts).toBe(1);
  } else {
    await expect(callLLM(options)).rejects.toBeInstanceOf(LLMBudgetError);
    await expect(budget.beforeRequest()).rejects.toBeInstanceOf(LLMBudgetError);
    expect(budget.snapshot.spentUsd).toBe(failure === "unsupported" ? 0 : 0.001);
    if (failure === "unsupported") expect(budget.snapshot.reservedUsd).toBeGreaterThan(0);
  }
  expect(save).toHaveBeenCalledTimes(1);
  expect(provider.create).toHaveBeenCalledTimes(1);
});
