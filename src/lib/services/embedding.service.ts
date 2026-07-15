import OpenAI from "openai";
import {
  isTransientLLMError,
  LLMTimeoutError,
  type LLMUsageCallback,
  type LLMUsageMetadata,
} from "./llm.service";

const MODEL = "openai/text-embedding-3-small";
const BATCH_SIZE = 96;
const EMBEDDING_DIMENSION = 1536;
const EMBEDDING_TIMEOUT_MS = 15_000;
const EMBEDDING_MAX_RETRIES = 1;
const EMBEDDING_RETRY_DELAY_MS = 500;

type EmbeddingResponse = {
  data: { index: number; embedding: number[] }[];
  usage?: Record<string, unknown>;
};

type EmbeddingClient = {
  create(params: { model: string; input: string | string[] }): Promise<EmbeddingResponse>;
};

export type EmbedOptions = {
  // Same callback shape as callLLM so createLLMUsageLogger plugs in directly
  // (feature: "embedding"). One metadata emission per embedText/embedTexts
  // call, with usage aggregated across internal batches.
  onComplete?: LLMUsageCallback;
  client?: EmbeddingClient;
};

let client: OpenAI | null = null;

function getClient(): EmbeddingClient {
  if (!client) {
    client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY!,
    });
  }
  return client.embeddings as unknown as EmbeddingClient;
}

function readUsageNumber(usage: Record<string, unknown> | undefined, key: string): number {
  const value = usage?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function aggregateUsage(usages: Array<Record<string, unknown> | undefined>) {
  return {
    prompt_tokens: usages.reduce((s, u) => s + readUsageNumber(u, "prompt_tokens"), 0),
    total_tokens: usages.reduce((s, u) => s + readUsageNumber(u, "total_tokens"), 0),
    cost: usages.reduce((s, u) => s + readUsageNumber(u, "cost"), 0),
  };
}

async function notifyEmbeddingUsage(
  onComplete: LLMUsageCallback | undefined,
  params: {
    elapsedMs: number;
    success: boolean;
    usages: Array<Record<string, unknown> | undefined>;
    retryCount?: number;
    timedOut?: boolean;
    errorType?: string;
    errorMessage?: string;
  }
): Promise<void> {
  if (!onComplete) return;

  const aggregated = aggregateUsage(params.usages);
  const metadata: LLMUsageMetadata = {
    provider: "openrouter",
    model: MODEL,
    elapsedMs: params.elapsedMs,
    retryCount: params.retryCount ?? 0,
    timedOut: params.timedOut ?? false,
    success: params.success,
    usage: aggregated as unknown as LLMUsageMetadata["usage"],
    costUsd: aggregated.cost > 0 ? aggregated.cost : undefined,
  };
  if (params.errorType) metadata.errorType = params.errorType;
  if (params.errorMessage) metadata.errorMessage = params.errorMessage;

  try {
    await onComplete(metadata);
  } catch (error) {
    console.error(
      "[Embedding] usage logging callback failed:",
      error instanceof Error ? error.message : error
    );
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new LLMTimeoutError(timeoutMs)),
      timeoutMs
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Mirrors callLLM durability: bounded timeout + one retry on transient
// errors, so a network blip doesn't fail the whole indexing run.
async function createWithRetry(
  embeddingClient: EmbeddingClient,
  params: { model: string; input: string | string[]; usage?: { include: boolean } },
  retryCounter: { count: number }
): Promise<EmbeddingResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES; attempt += 1) {
    try {
      return await withTimeout(
        embeddingClient.create(params),
        EMBEDDING_TIMEOUT_MS
      );
    } catch (error) {
      lastError = error;
      if (attempt >= EMBEDDING_MAX_RETRIES || !isTransientLLMError(error)) {
        throw error;
      }
      retryCounter.count += 1;
      await sleep(EMBEDDING_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function classifyEmbeddingError(error: unknown): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return `provider_status_${status}`;
  }
  if (error instanceof Error) return error.name || "error";
  return "unknown";
}

export async function embedText(
  text: string,
  options?: EmbedOptions
): Promise<number[]> {
  if (process.env.SMART_WRITER_SKIP_EMBEDDINGS === "1") {
    return Array.from({ length: EMBEDDING_DIMENSION }, () => 0);
  }

  const embeddingClient = options?.client ?? getClient();
  const startedAt = Date.now();
  const retryCounter = { count: 0 };
  try {
    const res = await createWithRetry(
      embeddingClient,
      // usage.include → OpenRouter returns usage.cost; see the note in llm.service.
      { model: MODEL, input: text, usage: { include: true } },
      retryCounter
    );
    await notifyEmbeddingUsage(options?.onComplete, {
      elapsedMs: Date.now() - startedAt,
      success: true,
      usages: [res.usage],
      retryCount: retryCounter.count,
    });
    return res.data[0].embedding;
  } catch (error) {
    await notifyEmbeddingUsage(options?.onComplete, {
      elapsedMs: Date.now() - startedAt,
      success: false,
      usages: [],
      retryCount: retryCounter.count,
      timedOut: error instanceof LLMTimeoutError,
      errorType: classifyEmbeddingError(error),
      errorMessage: error instanceof Error ? error.message : undefined,
    });
    throw error;
  }
}

export async function embedTexts(
  texts: string[],
  options?: EmbedOptions
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (process.env.SMART_WRITER_SKIP_EMBEDDINGS === "1") {
    return texts.map(() => Array.from({ length: EMBEDDING_DIMENSION }, () => 0));
  }

  const embeddingClient = options?.client ?? getClient();
  const startedAt = Date.now();
  const usages: Array<Record<string, unknown> | undefined> = [];
  const retryCounter = { count: 0 };
  try {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await createWithRetry(
        embeddingClient,
        { model: MODEL, input: batch, usage: { include: true } },
        retryCounter
      );
      usages.push(res.usage);
      const sorted = res.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
      results.push(...sorted);
    }
    await notifyEmbeddingUsage(options?.onComplete, {
      elapsedMs: Date.now() - startedAt,
      success: true,
      usages,
      retryCount: retryCounter.count,
    });
    return results;
  } catch (error) {
    await notifyEmbeddingUsage(options?.onComplete, {
      elapsedMs: Date.now() - startedAt,
      success: false,
      usages,
      retryCount: retryCounter.count,
      timedOut: error instanceof LLMTimeoutError,
      errorType: classifyEmbeddingError(error),
      errorMessage: error instanceof Error ? error.message : undefined,
    });
    throw error;
  }
}
