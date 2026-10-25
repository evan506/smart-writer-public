import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMBudgetError } from "@/lib/services/llm-budget.service";
import { callLLM, type LLMUsageCallback } from "@/lib/services/llm.service";
import { embedText, embedTexts, type EmbedOptions } from "@/lib/services/embedding.service";

type Kind = "chat" | "embedding" | "batch";

function request(kind: Kind, create: () => Promise<unknown>, beforeRequest: () => Promise<void>, onComplete: LLMUsageCallback) {
  if (kind === "chat") {
    return callLLM({
      system: "test", user: "test", client: { create } as NonNullable<Parameters<typeof callLLM>[0]["client"]>,
      beforeRequest, onComplete, retryDelayMs: 0,
    });
  }
  const options: EmbedOptions = {
    client: { create } as NonNullable<EmbedOptions["client"]>,
    beforeRequest, onComplete, incrementalUsage: true,
  };
  return kind === "batch" ? embedTexts(["test"], options) : embedText("test", options);
}

function successfulResponse(kind: Kind) {
  const usage = { cost: 0.01, prompt_tokens: 1, total_tokens: 1, completion_tokens: 0 };
  return kind === "chat"
    ? { id: "response", choices: [{ message: { content: "ok" } }], usage }
    : { data: [{ index: 0, embedding: [1] }], usage };
}

afterEach(() => vi.unstubAllEnvs());

describe.each<Kind>(["chat", "embedding", "batch"])("%s retry attempt accounting", (kind) => {
  it("records the failed request before a guard blocks its retry", async () => {
    vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS", "0");
    const events: string[] = [];
    const create = vi.fn(async () => {
      events.push("provider");
      throw Object.assign(new Error("overloaded"), { status: 503 });
    });
    const beforeRequest = vi.fn(async () => {
      events.push("guard");
      if (events.includes("logged")) throw new LLMBudgetError("monthly");
    });
    const onComplete = vi.fn<LLMUsageCallback>(async () => { events.push("logged"); });
    await expect(request(kind, create, beforeRequest, onComplete)).rejects.toMatchObject({ reason: "monthly" });
    expect(events).toEqual(["guard", "provider", "logged", "guard"]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      success: false, retryCount: 0, errorType: "provider_status_503",
    });
    expect(onComplete.mock.calls[0][0].costUsd).toBeUndefined();
  });

  it("halts before retry when recording the transient failure fails", async () => {
    vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS", "0");
    const create = vi.fn().mockRejectedValue({ status: 503 });
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn().mockRejectedValue(new LLMBudgetError("unavailable"));
    await expect(request(kind, create, beforeRequest, onComplete)).rejects.toMatchObject({ reason: "unavailable" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("keeps an unknown failed attempt separate from the successful known cost", async () => {
    vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS", "0");
    const create = vi.fn().mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce(successfulResponse(kind));
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();
    await request(kind, create, beforeRequest, onComplete);
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ success: false, retryCount: 0 });
    expect(onComplete.mock.calls[0][0].costUsd).toBeUndefined();
    expect(onComplete.mock.calls[1][0]).toMatchObject({ success: true, retryCount: 1, costUsd: 0.01 });
  });

  it("records each failed request once when retries are exhausted", async () => {
    vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS", "0");
    const create = vi.fn().mockRejectedValue({ status: 503 });
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();
    await expect(request(kind, create, beforeRequest, onComplete)).rejects.toMatchObject({ status: 503 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete.mock.calls.map(([metadata]) => metadata.retryCount)).toEqual([0, 1]);
    expect(onComplete.mock.calls.every(([metadata]) => metadata.costUsd === undefined)).toBe(true);
  });
});

it("does not duplicate completed aggregate batch cost in retry failure records", async () => {
  vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS", "0");
  const create = vi.fn().mockResolvedValueOnce({
    data: Array.from({ length: 96 }, (_, index) => ({ index, embedding: [1] })),
    usage: { cost: 0.01 },
  }).mockRejectedValue({ status: 503 });
  const onComplete = vi.fn();
  await expect(embedTexts(Array.from({ length: 100 }, () => "text"), {
    client: { create }, onComplete,
  })).rejects.toMatchObject({ status: 503 });
  expect(onComplete).toHaveBeenCalledTimes(2);
  expect(onComplete.mock.calls[0][0]).toMatchObject({ success: false, retryCount: 0 });
  expect(onComplete.mock.calls[0][0].costUsd).toBeUndefined();
  expect(onComplete.mock.calls[1][0]).toMatchObject({ success: false, retryCount: 1, costUsd: 0.01 });
});
