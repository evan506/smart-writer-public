import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAGE2_EVAL_PROFILE, STAGE2_EVAL_RESPONSE_FORMAT } from "@/lib/services/entity-extraction/stage2-eval-contract";
const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock("@/lib/services/llm.service", () => ({ callLLM: mocks.callLLM, isPermanentProviderError: (e: { status?: number }) => e.status === 400 }));
import { stage1ExtractNouns, stage2Classify } from "@/lib/services/entity-extraction/stage-llm-wrappers";

const source = "하린은 엘프 사서다. 그는 실제로 늑대로 변신했다.";
const entity = { name: "하린", type: "CHARACTER", importance: "high", summary: "늑대로 변신하는 엘프 사서", confidence: 0.9,
  context_snippet: source, facts: [
    { evidence: "하린은 엘프 사서다.", fact_type: "ATTRIBUTE", value: "엘프", confidence: 0.9 },
    { evidence: "하린은 엘프 사서다.", fact_type: "ROLE", value: "사서", confidence: 0.8 },
    { evidence: "그는 실제로 늑대로 변신했다.", fact_type: "ABILITY", value: "변신", confidence: 0.85 },
  ] };
const route = { only: ["anthropic"], allow_fallbacks: false, ignore: ["other"], zdr: true,
  max_price: { prompt: 1, completion: 5, request: 0 } };
const options = { stage2EvalProfile: STAGE2_EVAL_PROFILE as typeof STAGE2_EVAL_PROFILE, maxRetries: 0, stage2Concurrency: 1, providerRouting: route };
beforeEach(() => { mocks.callLLM.mockReset(); });

describe("explicit Stage2 structured evaluation", () => {
  it("keeps default Stage2 and Stage1 requests unchanged", async () => {
    mocks.callLLM.mockResolvedValue("[]");
    await stage2Classify(["하린"], source, [], { providerRouting: route });
    await stage1ExtractNouns(source, [], options);
    for (const [request] of mocks.callLLM.mock.calls) {
      expect(request).not.toHaveProperty("responseFormat");
      expect(request.provider).toEqual(route);
      expect(request.provider).not.toHaveProperty("require_parameters");
    }
    expect(mocks.callLLM.mock.calls[0][0].system).toContain("JSON 배열만 반환");
  });

  it("requests the strict schema without mutating routing, limits or three supported facts", async () => {
    mocks.callLLM.mockResolvedValue(JSON.stringify({ entities: [entity] }));
    await expect(stage2Classify(["하린"], source, [], options)).resolves.toEqual([entity]);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    expect(mocks.callLLM.mock.calls[0][0]).toMatchObject({ responseFormat: STAGE2_EVAL_RESPONSE_FORMAT,
      provider: { ...route, require_parameters: true }, maxTokens: 2048, maxRetries: 0, temperature: 0.1 });
    expect(route).not.toHaveProperty("require_parameters");
    expect(mocks.callLLM.mock.calls[0][0].system).not.toContain("JSON 배열만 반환");
  });

  it.each(["high", "low"])("retains optional omissions, empty facts and importance %s", async (importance) => {
    mocks.callLLM.mockResolvedValue(JSON.stringify({ entities: [{ name: "하린", type: "CHARACTER", importance, summary: "사서", confidence: 0.9 }] }));
    const result = await stage2Classify(["하린"], source, [], options);
    expect(result).toHaveLength(1); expect(result[0].importance).toBe(importance);
    expect(result[0]).not.toHaveProperty("facts"); expect(result[0].context_snippet).toBeTruthy();
    mocks.callLLM.mockResolvedValue('{"entities":[]}');
    await expect(stage2Classify(["하린"], source, [], options)).resolves.toEqual([]);
  });

  it.each([
    ['[{"name":"하린"}]', ".entities"],
    ['{"other":[]}', ".entities"],
    ['{"entities":[],"extra":true}', ".root"],
    [JSON.stringify({ entities: [{ ...entity, importance: "medium" }] }), "[0].importance"],
    [JSON.stringify({ entities: [{ ...entity, confidence: 2 }] }), "[0].confidence"],
    [JSON.stringify({ entities: [{ ...entity, alias_of: null }] }), "[0].alias_of"],
    [JSON.stringify({ entities: [{ ...entity, extra: true }] }), "[0].extra"],
    [JSON.stringify({ entities: [{ ...entity, facts: [{ ...entity.facts[0], extra: true }] }] }), "[0].facts[0].extra"],
  ])("rejects malformed contracts without coercion or partial adoption: %s", async (raw, fieldPath) => {
    mocks.callLLM.mockResolvedValue(raw); const onValidation = vi.fn();
    await expect(stage2Classify(["하린"], source, [], { ...options, onValidation })).rejects.toThrow("invalid response");
    expect(onValidation).toHaveBeenCalledWith(expect.objectContaining({ outcome: "shape", fieldPath }));
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });

  it.each(['{"entities":[{"name":"하린"', '"refused"', '```json\n{"entities":[]}\n```'])
    ("does not repair truncated, refused or fenced strict responses: %s", async (raw) => {
      mocks.callLLM.mockResolvedValue(raw);
      await expect(stage2Classify(["하린"], source, [], options)).rejects.toThrow("invalid response");
      expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    });

  it("stops before the next serial batch on an invalid importance", async () => {
    mocks.callLLM.mockResolvedValue(JSON.stringify({ entities: [{ ...entity, importance: "medium" }] }));
    const names = Array.from({ length: 14 }, (_, i) => `하린${i}`);
    await expect(stage2Classify(names, names.join(" "), [], options)).rejects.toThrow("invalid response");
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to a legacy response or different provider after unsupported schema", async () => {
    const error = Object.assign(new Error("schema unsupported"), { status: 400 });
    mocks.callLLM.mockRejectedValue(error);
    await expect(stage2Classify(["하린"], source, [], options)).rejects.toBe(error);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });
});
