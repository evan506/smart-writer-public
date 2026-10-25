import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMBudgetError } from "@/lib/services/llm-budget.service";
import { callLLM } from "@/lib/services/llm.service";
import { embedText } from "@/lib/services/embedding.service";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("real SDK retry boundary with mocked HTTP", () => {
  it.each(["chat", "embedding"])("%s retries only after another budget check", async (kind) => {
    vi.stubEnv("OPENROUTER_API_KEY", "local-test-placeholder");
    vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS", "0");
    // Exercise the real installed SDK, but every HTTP request is intercepted.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "temporary provider failure", type: "server_error" },
    }), { status: 503, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const beforeRequest = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new LLMBudgetError("unavailable"));
    const onComplete = vi.fn();
    const request = kind === "chat"
      ? callLLM({ system: "test", user: "test", beforeRequest, onComplete, retryDelayMs: 0 })
      : embedText("test", { beforeRequest, onComplete });
    await expect(request).rejects.toMatchObject({ reason: "unavailable" });
    expect(beforeRequest).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      success: false, retryCount: 0, errorType: "provider_status_503",
    }));
    expect(onComplete.mock.calls[0][0].costUsd).toBeUndefined();
  });
});
