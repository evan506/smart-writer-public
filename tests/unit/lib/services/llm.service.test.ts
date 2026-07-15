import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callLLM,
  LLMEmptyResponseError,
  LLMTimeoutError,
} from "@/lib/services/llm.service";

function chatClient(create: ReturnType<typeof vi.fn>) {
  return { create };
}

function completion(content: string | null, usage?: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
}, id?: string) {
  return {
    id,
    usage,
    choices: [
      {
        message: { content },
      },
    ],
  };
}

describe("callLLM", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("passes an abort signal to the OpenRouter chat completion request", async () => {
    const create = vi.fn(async () => completion("응답"));

    const result = await callLLM({
      system: "system",
      user: "user",
      client: chatClient(create) as never,
    });

    expect(result).toBe("응답");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-sonnet-4.5",
        max_tokens: 2048,
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "user" },
        ],
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  // Regression: the request omitted `usage.include`, so OpenRouter never returned
  // usage.cost, llm_usage_logs.cost_usd stayed null, and the LLM budget guard — whose
  // axes are all USD — could never accumulate spend and so never blocked.
  it("asks OpenRouter to include cost accounting in the usage payload", async () => {
    const create = vi.fn(async () => completion("응답"));

    await callLLM({
      system: "system",
      user: "user",
      client: chatClient(create) as never,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { include: true } }),
      expect.anything()
    );
  });

  it("throws a timeout-specific error when the request exceeds timeoutMs", async () => {
    vi.useFakeTimers();
    const create = vi.fn((_request, options?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const result = callLLM({
      system: "system",
      user: "user",
      timeoutMs: 25,
      maxRetries: 0,
      client: chatClient(create) as never,
    });

    const assertion = expect(result).rejects.toMatchObject({
      name: "LLMTimeoutError",
      message: "LLM_TIMEOUT: OpenRouter chat completion timed out after 25ms",
    } satisfies Pick<LLMTimeoutError, "name" | "message">);

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("retries transient provider failures within the retry limit", async () => {
    const transientError = Object.assign(new Error("provider overloaded"), {
      status: 503,
    });
    const create = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(completion("재시도 성공"));
    const onComplete = vi.fn();

    const result = await callLLM({
      system: "system",
      user: "user",
      maxRetries: 1,
      retryDelayMs: 0,
      client: chatClient(create) as never,
      onComplete,
    });

    expect(result).toBe("재시도 성공");
    expect(create).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
      retryCount: 1,
      timedOut: false,
      success: true,
    }));
  });

  it("does not retry non-transient provider failures", async () => {
    const badRequest = Object.assign(new Error("bad request"), { status: 400 });
    const create = vi.fn().mockRejectedValue(badRequest);
    const onComplete = vi.fn();

    await expect(callLLM({
      system: "system",
      user: "user",
      maxRetries: 2,
      retryDelayMs: 0,
      client: chatClient(create) as never,
      onComplete,
    })).rejects.toThrow("bad request");

    expect(create).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      retryCount: 0,
      timedOut: false,
      success: false,
      errorType: "provider_status_400",
      errorMessage: "bad request",
    }));
  });

  it("throws an empty-response-specific error without retrying", async () => {
    const create = vi.fn().mockResolvedValue(completion(""));

    await expect(callLLM({
      system: "system",
      user: "user",
      maxRetries: 2,
      retryDelayMs: 0,
      client: chatClient(create) as never,
    })).rejects.toThrow(LLMEmptyResponseError);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("reports provider usage when an empty response fails validation", async () => {
    const usage = {
      prompt_tokens: 10,
      completion_tokens: 0,
      total_tokens: 10,
    };
    const create = vi.fn().mockResolvedValue(completion("", usage));
    const onComplete = vi.fn();

    await expect(callLLM({
      system: "system",
      user: "user",
      client: chatClient(create) as never,
      onComplete,
    })).rejects.toThrow(LLMEmptyResponseError);

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorType: "empty_response",
      usage,
    }));
  });

  it("reports elapsed time and provider token usage on successful completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const usage = {
      prompt_tokens: 12,
      completion_tokens: 7,
      total_tokens: 19,
    };
    const create = vi.fn(async () => {
      vi.setSystemTime(1_150);
      return completion("사용량 포함 응답", usage);
    });
    const onComplete = vi.fn();

    const result = await callLLM({
      system: "system",
      user: "user",
      model: "anthropic/claude-3.5-haiku",
      client: chatClient(create) as never,
      onComplete,
    });

    expect(result).toBe("사용량 포함 응답");
    expect(onComplete).toHaveBeenCalledWith({
      provider: "openrouter",
      model: "anthropic/claude-3.5-haiku",
      elapsedMs: 150,
      retryCount: 0,
      timedOut: false,
      success: true,
      usage,
    });
  });

  it("reports provider response id and cost when OpenRouter includes them", async () => {
    const usage = {
      prompt_tokens: 12,
      completion_tokens: 7,
      total_tokens: 19,
      cost: 0.00019,
    };
    const create = vi.fn(async () => completion("비용 포함 응답", usage, "gen-123"));
    const onComplete = vi.fn();

    await callLLM({
      system: "system",
      user: "user",
      client: chatClient(create) as never,
      onComplete,
    });

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      providerResponseId: "gen-123",
      costUsd: 0.00019,
      usage,
    }));
  });

  it("reports timeout metadata before rethrowing timeout errors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const create = vi.fn((_request, options?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          vi.setSystemTime(5_025);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const onComplete = vi.fn();

    const result = callLLM({
      system: "system",
      user: "user",
      timeoutMs: 25,
      maxRetries: 0,
      client: chatClient(create) as never,
      onComplete,
    });

    const assertion = expect(result).rejects.toThrow(LLMTimeoutError);

    await vi.advanceTimersByTimeAsync(25);
    await assertion;

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      elapsedMs: 25,
      retryCount: 0,
      timedOut: true,
      success: false,
      errorType: "timeout",
      errorMessage: "LLM_TIMEOUT: OpenRouter chat completion timed out after 25ms",
    }));
  });

  it("caches the system prompt with an Anthropic ephemeral breakpoint when cacheSystemPrompt is true", async () => {
    const create = vi.fn(async () => completion("캐싱 응답"));

    await callLLM({
      system: "system prompt",
      user: "user",
      cacheSystemPrompt: true,
      client: chatClient(create) as never,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: "system prompt",
                cache_control: { type: "ephemeral" },
              },
            ],
          },
          { role: "user", content: "user" },
        ],
      }),
      expect.anything()
    );
  });

  it("sends the system prompt as a plain string when cacheSystemPrompt is not set (default)", async () => {
    const create = vi.fn(async () => completion("응답"));

    await callLLM({
      system: "system prompt",
      user: "user",
      client: chatClient(create) as never,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "system", content: "system prompt" },
          { role: "user", content: "user" },
        ],
      }),
      expect.anything()
    );
  });

  it("does not fail the LLM call when usage logging fails", async () => {
    const create = vi.fn(async () => completion("응답"));
    const onComplete = vi.fn(async () => {
      throw new Error("logger unavailable");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await callLLM({
      system: "system",
      user: "user",
      client: chatClient(create) as never,
      onComplete,
    });

    expect(result).toBe("응답");
    expect(consoleError).toHaveBeenCalledWith(
      "[LLM] usage logging callback failed:",
      "logger unavailable"
    );
  });
});
