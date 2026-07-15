import { describe, expect, it, vi } from "vitest";
import {
  buildLLMUsageLogInsert,
  createLLMUsageLogger,
} from "@/lib/services/llm-usage-logger.service";

describe("LLM usage logger", () => {
  it("maps provider usage metadata without prompt or completion text", () => {
    const row = buildLLMUsageLogInsert(
      {
        projectId: "project-1",
        userId: "user-1",
        feature: "entity_extraction",
        promptTemplateKey: "entity_extraction.stage1_nouns",
        promptTemplateVersion: "v1",
      },
      {
        provider: "openrouter",
        model: "anthropic/claude-3.5-haiku",
        providerResponseId: "gen-1",
        elapsedMs: 320,
        retryCount: 1,
        timedOut: false,
        success: true,
        costUsd: 0.00042,
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 40 },
          completion_tokens_details: { reasoning_tokens: 5 },
        },
      }
    );

    expect(row).toMatchObject({
      project_id: "project-1",
      user_id: "user-1",
      feature: "entity_extraction",
      provider: "openrouter",
      model: "anthropic/claude-3.5-haiku",
      provider_response_id: "gen-1",
      prompt_template_key: "entity_extraction.stage1_nouns",
      prompt_template_version: "v1",
      status: "success",
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
      cached_prompt_tokens: 40,
      reasoning_tokens: 5,
      cost_usd: 0.00042,
      latency_ms: 320,
      retry_count: 1,
      timed_out: false,
      raw_usage: expect.objectContaining({
        prompt_tokens: 120,
        completion_tokens: 30,
        total_tokens: 150,
      }),
    });
    expect(JSON.stringify(row)).not.toContain("system prompt");
    expect(JSON.stringify(row)).not.toContain("completion body");
  });

  it("records failed calls with nullable token and cost fields", () => {
    const row = buildLLMUsageLogInsert(
      {
        projectId: "project-1",
        feature: "analysis",
      },
      {
        provider: "openrouter",
        model: "anthropic/claude-3.5-haiku",
        elapsedMs: 25,
        retryCount: 0,
        timedOut: true,
        success: false,
        errorType: "timeout",
        errorMessage: "timed out",
      }
    );

    expect(row).toMatchObject({
      project_id: "project-1",
      user_id: null,
      feature: "analysis",
      status: "error",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      cost_usd: null,
      latency_ms: 25,
      retry_count: 0,
      timed_out: true,
      error_type: "timeout",
      raw_usage: {},
    });
    expect(row).not.toHaveProperty("error_message");
  });

  it("inserts usage logs and swallows insert failures", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const supabase = { from };

    const logger = createLLMUsageLogger(supabase as never, {
      projectId: "project-1",
      userId: "user-1",
      feature: "analysis",
    });

    await logger({
      provider: "openrouter",
      model: "anthropic/claude-3.5-haiku",
      elapsedMs: 100,
      retryCount: 0,
      timedOut: false,
      success: true,
    });

    expect(from).toHaveBeenCalledWith("llm_usage_logs");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "project-1",
      user_id: "user-1",
      feature: "analysis",
      status: "success",
    }));
  });
});
