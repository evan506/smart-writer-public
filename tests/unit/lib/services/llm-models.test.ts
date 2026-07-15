import { afterEach, describe, expect, it } from "vitest";
import {
  getLLMModel,
  getLLMProviderRouting,
} from "@/lib/services/llm-models";

const ENV_KEYS = [
  "SMART_WRITER_MODEL_EXTRACTION",
  "SMART_WRITER_MODEL_ANALYSIS",
  "SMART_WRITER_MODEL_QNA",
  "SMART_WRITER_MODEL_DISTILLATION",
  "SMART_WRITER_LLM_PROVIDER_ORDER",
  "SMART_WRITER_LLM_PROVIDER_IGNORE",
  "SMART_WRITER_LLM_PROVIDER_ZDR",
];

describe("llm-models registry", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("returns defaults when no env override is set", () => {
    expect(getLLMModel("extraction")).toBe("anthropic/claude-haiku-4.5");
    expect(getLLMModel("analysis")).toBe("anthropic/claude-haiku-4.5");
    expect(getLLMModel("canonQnA")).toBe("anthropic/claude-sonnet-4.5");
    expect(getLLMModel("distillation")).toBe("anthropic/claude-sonnet-4.5");
  });

  it("applies env override per slot at call time", () => {
    process.env.SMART_WRITER_MODEL_EXTRACTION = "anthropic/claude-sonnet-4.5";
    expect(getLLMModel("extraction")).toBe("anthropic/claude-sonnet-4.5");
    // Other slots stay on defaults
    expect(getLLMModel("analysis")).toBe("anthropic/claude-haiku-4.5");
  });

  it("ignores empty or whitespace-only overrides", () => {
    process.env.SMART_WRITER_MODEL_QNA = "   ";
    expect(getLLMModel("canonQnA")).toBe("anthropic/claude-sonnet-4.5");
  });
});

describe("getLLMProviderRouting", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("returns undefined when no routing env is set", () => {
    expect(getLLMProviderRouting()).toBeUndefined();
  });

  it("parses order/ignore lists and the zdr flag", () => {
    process.env.SMART_WRITER_LLM_PROVIDER_ORDER = "fireworks, deepinfra";
    process.env.SMART_WRITER_LLM_PROVIDER_IGNORE = "deepseek";
    process.env.SMART_WRITER_LLM_PROVIDER_ZDR = "1";
    expect(getLLMProviderRouting()).toEqual({
      order: ["fireworks", "deepinfra"],
      ignore: ["deepseek"],
      zdr: true,
    });
  });

  it("omits empty fields", () => {
    process.env.SMART_WRITER_LLM_PROVIDER_IGNORE = "deepseek";
    expect(getLLMProviderRouting()).toEqual({
      order: undefined,
      ignore: ["deepseek"],
      zdr: undefined,
    });
  });
});
