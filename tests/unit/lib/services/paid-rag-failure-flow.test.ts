import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

const paidChat = vi.hoisted(() => vi.fn());
const paidChatRequest = vi.hoisted(() => vi.fn());
const paidEmbedding = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/search.service", () => ({
  SearchService: class {
    searchEntitiesBm25 = async () => [{
      id: "entity", name: "주인공", type: "CHARACTER", description: "주인공이 마지막에 선택했다.", rank: 1,
    }];
    searchChaptersBm25 = async () => [];
    matchChunks = async () => [];
  },
}));
vi.mock("@/lib/services/graph-rag.service", () => ({
  GraphRAGService: class { findRelatedEntities = async () => []; },
}));
vi.mock("@/lib/services/consistency.service", () => ({
  ConsistencyService: class { detectConflicts = async () => []; },
}));
vi.mock("@/lib/services/embedding.service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/services/embedding.service")>(),
  embedText: paidEmbedding,
}));
vi.mock("@/lib/services/llm.service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/services/llm.service")>(),
  callLLM: paidChat,
}));

import { RAGSearchService } from "@/lib/services/rag-search.service";
import { AIAnalysisService } from "@/lib/services/ai-analysis.service";
import { CanonQAService } from "@/lib/services/canon-qna.service";
import type { EmbedOptions } from "@/lib/services/embedding.service";

const text = "주인공이 마지막에 어떤 선택을 하게 되는지 알고 싶어요";
function clientWithFailedUsageInsert() {
  const { client } = createSupabaseMock({
    projects: { data: { genre: null }, error: null },
    chapters: { data: null, error: null },
    entities: { data: [], error: null },
    llm_usage_logs: { data: null, error: { message: "usage insert failed" } },
  });
  return Object.assign(client, {
    rpc: vi.fn().mockResolvedValue({ data: [{
      authorized: true, project_day_usd: 0, project_month_usd: 0,
      user_day_usd: 0, user_month_usd: 0,
      project_unknown_cost_count: 0, user_unknown_cost_count: 0,
    }], error: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMART_WRITER_LLM_DAILY_BUDGET_USD", "");
  vi.stubEnv("SMART_WRITER_LLM_MONTHLY_BUDGET_USD", "10");
  vi.stubEnv("SMART_WRITER_LLM_USER_DAILY_BUDGET_USD", "");
  vi.stubEnv("SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  paidEmbedding.mockImplementation(async (_text: string, options: EmbedOptions) => {
    await options.beforeRequest?.();
    await options.onComplete?.({
      provider: "openrouter", model: "embedding", elapsedMs: 1,
      retryCount: 0, timedOut: false, success: true, costUsd: 0.01,
    });
    return [1, 2, 3];
  });
  paidChat.mockImplementation(async (params: { beforeRequest?: () => Promise<void> }) => {
    await params.beforeRequest?.();
    paidChatRequest();
    return JSON.stringify({ conflicts: [], suggestions: [], references: [] });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("real RAG/context paid workflow boundaries", () => {
  it("still returns free search results when an optional embedding cost cannot be recorded", async () => {
    const client = clientWithFailedUsageInsert();
    const result = await new RAGSearchService(client as never).search("project", text, { userId: "owner" });
    expect(result.modesUsed).toEqual(["bm25"]);
    expect(result.items).toHaveLength(1);
    expect(paidEmbedding).toHaveBeenCalledTimes(1);
  });

  it("halts analysis before chat when the preceding RAG embedding cost write fails", async () => {
    const client = clientWithFailedUsageInsert();
    const outcome = await new AIAnalysisService(client as never)
      .analyze("project", "chapter", text, { userId: "owner" }).catch(error => error);
    expect(paidChat).not.toHaveBeenCalled();
    expect(paidChatRequest).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ reason: "unavailable" });
    expect(paidEmbedding).toHaveBeenCalledTimes(1);
  });

  it("halts Q&A before chat when the preceding RAG embedding cost write fails", async () => {
    const client = clientWithFailedUsageInsert();
    const outcome = await new CanonQAService(client as never)
      .ask({ projectId: "project", question: text, userId: "owner" }).catch(error => error);
    expect(paidChat).not.toHaveBeenCalled();
    expect(paidChatRequest).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ reason: "unavailable" });
    expect(paidEmbedding).toHaveBeenCalledTimes(1);
  });
});
