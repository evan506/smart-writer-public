import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedText, embedTexts } from "@/lib/services/embedding.service";
import type { LLMUsageMetadata } from "@/lib/services/llm.service";

type FakeEmbeddingResponse = {
  data: { index: number; embedding: number[] }[];
  usage?: Record<string, unknown>;
};

// tests/setup.ts (or the local .env) may set SMART_WRITER_SKIP_EMBEDDINGS,
// which would bypass the injected fake client entirely. Force it off/on
// explicitly per test instead of relying on ambient state.
const ORIGINAL_SKIP = process.env.SMART_WRITER_SKIP_EMBEDDINGS;

beforeEach(() => {
  delete process.env.SMART_WRITER_SKIP_EMBEDDINGS;
});

afterEach(() => {
  if (ORIGINAL_SKIP === undefined) {
    delete process.env.SMART_WRITER_SKIP_EMBEDDINGS;
  } else {
    process.env.SMART_WRITER_SKIP_EMBEDDINGS = ORIGINAL_SKIP;
  }
  vi.restoreAllMocks();
});

function makeVector(seed: number): number[] {
  return Array.from({ length: 3 }, (_, i) => seed + i);
}

describe("embedTexts usage aggregation", () => {
  it("batches >96 texts into two client calls and concatenates results in order", async () => {
    const create = vi
      .fn<(params: { model: string; input: string | string[] }) => Promise<FakeEmbeddingResponse>>()
      .mockImplementationOnce(async ({ input }) => ({
        data: (input as string[]).map((_, i) => ({ index: i, embedding: makeVector(i) })),
        usage: { prompt_tokens: 96, total_tokens: 96, cost: 0.001 },
      }))
      .mockImplementationOnce(async ({ input }) => ({
        data: (input as string[]).map((_, i) => ({ index: i, embedding: makeVector(100 + i) })),
        usage: { prompt_tokens: 4, total_tokens: 4, cost: 0.0001 },
      }));

    const onComplete = vi.fn();
    const texts = Array.from({ length: 100 }, (_, i) => `text-${i}`);

    const results = await embedTexts(texts, {
      client: { create },
      onComplete,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(100);
    // First batch (96 items) vectors, then second batch (4 items) vectors, in order.
    expect(results[0]).toEqual(makeVector(0));
    expect(results[95]).toEqual(makeVector(95));
    expect(results[96]).toEqual(makeVector(100));
    expect(results[99]).toEqual(makeVector(103));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const metadata = onComplete.mock.calls[0][0] as LLMUsageMetadata;
    expect(metadata.success).toBe(true);
    expect(metadata.model).toBe("openai/text-embedding-3-small");
    expect(metadata.usage).toMatchObject({
      prompt_tokens: 100,
      total_tokens: 100,
    });
    expect(metadata.costUsd).toBeCloseTo(0.0011, 6);
  });
});

describe("embedText usage", () => {
  it("calls onComplete with success true and the embedding model", async () => {
    const create = vi.fn(async () => ({
      data: [{ index: 0, embedding: makeVector(1) }],
      usage: { prompt_tokens: 5, total_tokens: 5, cost: 0.00005 },
    }));
    const onComplete = vi.fn();

    const embedding = await embedText("hello", { client: { create }, onComplete });

    expect(embedding).toEqual(makeVector(1));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const metadata = onComplete.mock.calls[0][0] as LLMUsageMetadata;
    expect(metadata.success).toBe(true);
    expect(metadata.model).toBe("openai/text-embedding-3-small");
  });
});

describe("embedding error path", () => {
  it("rethrows the client error and notifies onComplete with success false", async () => {
    const boom = new Error("provider unavailable");
    const create = vi.fn(async () => {
      throw boom;
    });
    const onComplete = vi.fn();

    await expect(
      embedTexts(["a", "b"], { client: { create }, onComplete })
    ).rejects.toThrow("provider unavailable");

    expect(onComplete).toHaveBeenCalledTimes(1);
    const metadata = onComplete.mock.calls[0][0] as LLMUsageMetadata;
    expect(metadata.success).toBe(false);
    expect(metadata.errorType).toBeTruthy();
  });

  it("does not let a throwing onComplete break the embedding call", async () => {
    const create = vi.fn(async () => ({
      data: [{ index: 0, embedding: makeVector(2) }],
      usage: { prompt_tokens: 1, total_tokens: 1, cost: 0 },
    }));
    const onComplete = vi.fn(() => {
      throw new Error("logging failed");
    });

    const embedding = await embedText("hi", { client: { create }, onComplete });

    expect(embedding).toEqual(makeVector(2));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("SMART_WRITER_SKIP_EMBEDDINGS bypass", () => {
  it("returns zero vectors without calling the client or onComplete", async () => {
    process.env.SMART_WRITER_SKIP_EMBEDDINGS = "1";
    const create = vi.fn();
    const onComplete = vi.fn();

    const results = await embedTexts(["a", "b"], { client: { create }, onComplete });

    expect(results).toHaveLength(2);
    expect(results[0].every((v) => v === 0)).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
