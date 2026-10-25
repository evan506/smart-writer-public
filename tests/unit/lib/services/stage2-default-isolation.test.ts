import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "./stage2-main-parity-fixture.json";
import { buildStage2CompactEvalPrompt, STAGE2_COMPACT_EVAL_PROFILE } from "@/lib/services/entity-extraction/stage2-eval-contract";
import { buildClassificationBatchContext } from "@/lib/services/entity-extraction/classification-context";
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/services/llm.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/llm.service")>();
  return { ...actual, callLLM: (params: Parameters<typeof actual.callLLM>[0]) =>
    actual.callLLM({ ...params, client: provider as never }) };
});
import { stage2Classify } from "@/lib/services/entity-extraction/stage-llm-wrappers";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
beforeEach(() => {
  provider.create.mockReset();
  provider.create.mockResolvedValue({ choices: [{ message: { content: "[]" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0 } });
  vi.stubEnv("SMART_WRITER_MODEL_EXTRACTION", "anthropic/claude-haiku-4.5");
  vi.stubEnv("SMART_WRITER_LLM_PROVIDER_ORDER", "anthropic");
  vi.stubEnv("SMART_WRITER_LLM_PROVIDER_IGNORE", "other");
  vi.stubEnv("SMART_WRITER_LLM_PROVIDER_ZDR", "1");
});
afterEach(() => vi.unstubAllEnvs());

// Frozen hashes record the reviewed public stage-2 v2 SDK requests (2026-10-25).
// Fixtures contain synthetic sentences only; CI never needs git history or a network connection.
it.each(fixture.rows)("matches pinned public baseline complete SDK request for $count candidates", async ({ count, requests }) => {
  const beforeRequest = vi.fn(), onComplete = vi.fn();
  await expect(stage2Classify(fixture.names.slice(0, count), fixture.text, fixture.known,
    { guidanceBlock: fixture.guidance, beforeRequest, onComplete })).resolves.toEqual([]);
  expect(provider.create).toHaveBeenCalledTimes(requests.length);
  expect(beforeRequest).toHaveBeenCalledTimes(requests.length);
  expect(onComplete).toHaveBeenCalledTimes(requests.length);
  for (const [i, [request, sdkOptions]] of provider.create.mock.calls.entries()) {
    const system = request.messages[0].content[0].text, user = request.messages[1].content;
    expect({ systemSha256: sha(system), userSha256: sha(user) }).toEqual(requests[i]);
    expect(request).toEqual({ model: "anthropic/claude-haiku-4.5", max_tokens: 2048, temperature: 0.1,
      messages: [{ role: "system", content: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] },
        { role: "user", content: user }], usage: { include: true },
      provider: { order: ["anthropic"], ignore: ["other"], zdr: true } });
    expect(sdkOptions.signal).toBeInstanceOf(AbortSignal);
  }
  for (const [metadata] of onComplete.mock.calls) {
    expect(metadata.retryCount).toBe(0);
    expect(metadata.responseDiagnostics).toBeUndefined();
  }
});

it("preserves compact v3 canonical and guidance whitespace exactly", () => {
  const p = buildStage2CompactEvalPrompt("리엔: 검은 서고로 갔다.", "(없음)", "");
  expect(sha(`${p.system}\n---\n${p.user}`).slice(0, 16)).toBe("f6a1de9124744eae");
  const guided = buildStage2CompactEvalPrompt("후보", "(없음)", "  안내\n둘째 줄  ");
  expect(guided.system).toContain("(없음)\n\n안내\n둘째 줄\n\nJSON 배열만 반환.");
});

it("enables wide/shared v3 input only with the explicit compact profile and no schema", async () => {
  const names = fixture.names.slice(0, 10);
  await stage2Classify(names, fixture.text, [], { stage2EvalProfile: STAGE2_COMPACT_EVAL_PROFILE });
  const request = provider.create.mock.calls[0][0];
  expect(request.messages[1].content).toContain(buildClassificationBatchContext(names, fixture.text).payload);
  expect(request.messages[0].content[0].text).toBe(buildStage2CompactEvalPrompt("", "(없음)").system);
  expect(request).not.toHaveProperty("response_format");
  expect(request.provider).not.toHaveProperty("require_parameters");
});

it.each(["", "v3", "stage2-compact-v3 ", "other"])("rejects unsupported runtime profile %s before SDK", async profile => {
  await expect(stage2Classify(["하린"], "하린은 사서다.", [], { stage2EvalProfile: profile as never })).rejects.toThrow("profile");
  expect(provider.create).not.toHaveBeenCalled();
});
