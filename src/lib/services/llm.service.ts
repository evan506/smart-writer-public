import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";

import {
  getLLMProviderRouting,
  type LLMProviderRouting,
} from "./llm-models";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 500;
const TRANSIENT_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

type ChatCompletionClient = {
  create(
    request: ChatCompletionCreateParamsNonStreaming,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletion>;
};

export type LLMUsageMetadata = {
  provider: "openrouter";
  model: string;
  providerResponseId?: string;
  elapsedMs: number;
  retryCount: number;
  timedOut: boolean;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  usage?: ChatCompletion["usage"];
  costUsd?: number;
};

export type LLMUsageCallback = (
  metadata: LLMUsageMetadata
) => void | Promise<void>;

export class LLMTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM_TIMEOUT: OpenRouter chat completion timed out after ${timeoutMs}ms`);
    this.name = "LLMTimeoutError";
  }
}

export class LLMEmptyResponseError extends Error {
  constructor() {
    super("LLM_EMPTY_RESPONSE: LLM returned empty response");
    this.name = "LLMEmptyResponseError";
  }
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY!,
    });
  }
  return client;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "APIUserAbortError")
  );
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const maybeStatus = "status" in error ? error.status : undefined;
  return typeof maybeStatus === "number" ? maybeStatus : undefined;
}

export function isTransientLLMError(error: unknown): boolean {
  return isTransientError(error);
}

/**
 * Permanent provider-side configuration errors (auth, missing model, bad
 * request). Retrying or continuing with other chunks cannot succeed — callers
 * that normally tolerate per-chunk failures should escalate these instead of
 * silently returning empty results.
 */
export function isPermanentProviderError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === undefined) return false;
  return status >= 400 && status < 500 && !TRANSIENT_STATUS_CODES.has(status);
}

function isTransientError(error: unknown): boolean {
  if (error instanceof LLMTimeoutError) return true;

  const status = getErrorStatus(error);
  if (status && TRANSIENT_STATUS_CODES.has(status)) return true;

  if (!(error instanceof Error)) return false;
  const errorWithCode = error as Error & { code?: unknown };
  const code = typeof errorWithCode.code === "string"
    ? errorWithCode.code
    : undefined;
  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
  ].includes(code ?? "");
}

function classifyError(error: unknown): string {
  if (error instanceof LLMTimeoutError) return "timeout";
  if (error instanceof LLMEmptyResponseError) return "empty_response";

  const status = getErrorStatus(error);
  if (status) return `provider_status_${status}`;

  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };
    if (typeof errorWithCode.code === "string") {
      return `network_${errorWithCode.code}`;
    }
    return error.name || "error";
  }

  return "unknown";
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return undefined;
}

function getUsageNumber(
  usage: ChatCompletion["usage"] | undefined,
  key: string
): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = (usage as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function notifyUsage(
  onComplete: LLMUsageCallback | undefined,
  metadata: LLMUsageMetadata
): Promise<void> {
  if (!onComplete) return;

  try {
    await onComplete(metadata);
  } catch (error) {
    console.error(
      "[LLM] usage logging callback failed:",
      error instanceof Error ? error.message : error
    );
  }
}

function buildUsageMetadata(
  metadata: Omit<LLMUsageMetadata, "providerResponseId" | "costUsd"> & {
    providerResponseId?: string;
    costUsd?: number;
  }
): LLMUsageMetadata {
  const result: LLMUsageMetadata = {
    provider: metadata.provider,
    model: metadata.model,
    elapsedMs: metadata.elapsedMs,
    retryCount: metadata.retryCount,
    timedOut: metadata.timedOut,
    success: metadata.success,
  };
  if (metadata.providerResponseId) result.providerResponseId = metadata.providerResponseId;
  if (metadata.costUsd !== undefined) result.costUsd = metadata.costUsd;
  if (metadata.errorType) result.errorType = metadata.errorType;
  if (metadata.errorMessage) result.errorMessage = metadata.errorMessage;
  if (metadata.usage) result.usage = metadata.usage;
  return result;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createChatCompletionWithTimeout(
  completionClient: ChatCompletionClient,
  request: ChatCompletionCreateParamsNonStreaming,
  timeoutMs: number
): Promise<ChatCompletion> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await completionClient.create(request, { signal: controller.signal });
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      throw new LLMTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callLLM(params: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  client?: ChatCompletionClient;
  onComplete?: LLMUsageCallback;
  /** OpenRouter provider routing (order/ignore/zdr). Defaults to env-driven
   *  getLLMProviderRouting(); pass explicitly to override per call. */
  provider?: LLMProviderRouting;
  /** Marks the system prompt as an Anthropic prompt-caching breakpoint
   *  (passed through by OpenRouter as `cache_control`). Enable on call sites
   *  that reuse an identical system prompt in bursts (e.g. per-chunk
   *  extraction). Silently a no-op below the provider's minimum cacheable
   *  prefix (1024 tok Sonnet / 2048 tok Haiku) and on non-Anthropic models. */
  cacheSystemPrompt?: boolean;
}): Promise<string> {
  const completionClient = params.client ?? getClient().chat.completions;
  const provider = params.provider ?? getLLMProviderRouting();
  const systemMessage = params.cacheSystemPrompt
    ? {
        role: "system",
        content: [
          {
            type: "text",
            text: params.system,
            cache_control: { type: "ephemeral" },
          },
        ],
      }
    : { role: "system", content: params.system };
  const request = {
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 2048,
    temperature: params.temperature,
    messages: [
      systemMessage,
      { role: "user", content: params.user },
    ],
    // OpenRouter-specific body fields; the OpenAI SDK passes unknown fields
    // through to the request body.
    //
    // `usage.include` is what makes OpenRouter return `usage.cost`. Without it the
    // response carries token counts only, so every row we wrote to llm_usage_logs
    // had cost_usd = null — and the LLM budget guard, whose axes are all USD, could
    // never accumulate spend and therefore never blocked.
    usage: { include: true },
    ...(provider ? { provider } : {}),
  } as ChatCompletionCreateParamsNonStreaming;

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = params.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const startedAt = Date.now();
  let lastError: unknown;
  let lastUsage: ChatCompletion["usage"] | undefined;
  let lastResponseId: string | undefined;
  let sawTimeout = false;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await createChatCompletionWithTimeout(
        completionClient,
        request,
        timeoutMs
      );

      lastUsage = res.usage;
      lastResponseId = res.id;
      const content = res.choices[0]?.message?.content;
      if (!content) throw new LLMEmptyResponseError();
      await notifyUsage(params.onComplete, buildUsageMetadata({
        provider: "openrouter",
        model: request.model,
        providerResponseId: res.id,
        elapsedMs: Date.now() - startedAt,
        retryCount: attempt,
        timedOut: sawTimeout,
        success: true,
        usage: res.usage,
        costUsd: getUsageNumber(res.usage, "cost"),
      }));
      return content;
    } catch (error) {
      lastError = error;
      sawTimeout ||= error instanceof LLMTimeoutError;
      if (attempt >= maxRetries || !isTransientError(error)) {
        await notifyUsage(params.onComplete, buildUsageMetadata({
          provider: "openrouter",
          model: request.model,
          providerResponseId: lastResponseId,
          elapsedMs: Date.now() - startedAt,
          retryCount: attempt,
          timedOut: sawTimeout,
          success: false,
          errorType: classifyError(error),
          errorMessage: getErrorMessage(error),
          usage: lastUsage,
          costUsd: getUsageNumber(lastUsage, "cost"),
        }));
        throw error;
      }
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}
