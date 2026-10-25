// Test-process preload only. Never imported by the app. Blocks real provider
// traffic and returns an unrecoverable Stage 2 response after valid Stage 1.
if (process.env.SMART_WRITER_EXTRACTION_FAILURE_E2E !== "1") {
  throw new Error("Extraction provider mock requires the explicit local E2E flag");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  if (url.hostname !== "openrouter.ai") return originalFetch(input, init);
  if (!url.pathname.endsWith("/chat/completions")) {
    throw new Error(`Unexpected mocked provider endpoint: ${url.pathname}`);
  }
  const request = JSON.parse(init?.body ?? "{}");
  return Response.json({
    id: "local-extraction-failure-fixture",
    object: "chat.completion",
    created: 1,
    model: request.model,
    choices: [{ index: 0, finish_reason: "stop", message: {
      role: "assistant",
      content: request.max_tokens === 512
        ? '["실패검증인물"]'
        : '[{"name":"실패검증인물","type":',
    } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 },
  });
};
