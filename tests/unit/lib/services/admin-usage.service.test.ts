import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAdminSnapshot, parseAdminFilters, type AdminFilters } from "@/lib/services/admin-usage.service";
import { evaluateLLMBudget } from "@/lib/services/llm-budget.service";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const foreignId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-10T12:00:00.000Z");
const totals = { authorized: true, project_day_usd: 3, project_month_usd: 8,
  user_day_usd: 4, user_month_usd: 9, project_unknown_cost_count: 2, user_unknown_cost_count: 2 };
const filters: AdminFilters = { days: 7, feature: "", status: "" };
type Result = { data?: unknown; error?: unknown; count?: number | null };
type Query = { table: string; calls: Array<[string, ...unknown[]]> };
function makeClient(options: { userId?: string | null; result?: (query: Query) => Result | Promise<Result> } = {}) {
  const queries: Query[] = [];
  const defaultResult = (query: Query): Result => {
    const columns = query.calls.find(([method]) => method === "select")?.[1];
    if (query.table === "projects") return { data: [{ id: projectId, title: "내 작품" }], error: null };
    if (query.table === "llm_usage_logs" && columns === "id") return { count: 1203, data: null, error: null };
    return { data: [], error: null };
  };
  const from = vi.fn((table: string) => {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lte", "order", "limit", "is", "not", "maybeSingle"]) {
      chain[method] = (...args: unknown[]) => { query.calls.push([method, ...args]); return chain; };
    }
    chain.then = (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve().then(() => options.result ? options.result(query) : defaultResult(query)).then(resolve, reject);
    return chain;
  });
  return { queries, defaultResult, from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: options.userId === null ? null : { id: options.userId ?? userId } }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: [totals], error: null }),
  };
}
beforeEach(() => {
  vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", userId);
  for (const name of ["SMART_WRITER_LLM_DAILY_BUDGET_USD", "SMART_WRITER_LLM_MONTHLY_BUDGET_USD",
    "SMART_WRITER_LLM_USER_DAILY_BUDGET_USD", "SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD"]) vi.stubEnv(name, "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function snapshot(client: ReturnType<typeof makeClient>, input = filters) {
  const result = await loadAdminSnapshot(client as never, input, now);
  expect(result.kind).toBe("ready");
  if (result.kind !== "ready") throw new Error("Expected ready snapshot");
  return result.snapshot;
}

describe("admin filters", () => {
  it("bounds periods and rejects unsupported filters and array inputs", () => {
    expect(parseAdminFilters({ days: "9999", feature: "prompt", status: "any", project: [projectId] }))
      .toEqual({ days: 7, feature: "", status: "", project: undefined });
    expect(parseAdminFilters({ days: "90", feature: "embedding", status: "error", project: projectId }))
      .toEqual({ days: 90, feature: "embedding", status: "error", project: projectId });
  });
});

describe("read-only administrator snapshot", () => {
  it.each([null, foreignId])("does not query data for unauthenticated/nonadmin %s", async (id) => {
    const client = makeClient({ userId: id });
    expect((await loadAdminSnapshot(client as never, filters, now)).kind)
      .toBe(id === null ? "unauthenticated" : "forbidden");
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("does not query data without an administrator allowlist", async () => {
    vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", "");
    const client = makeClient();
    expect((await loadAdminSnapshot(client as never, filters, now)).kind).toBe("forbidden");
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed projects before any data query", async () => {
    const client = makeClient();
    expect(await loadAdminSnapshot(client as never, { ...filters, project: "bad-id" }, now))
      .toEqual({ kind: "invalid-project" });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects a foreign project with no usage or aggregate access", async () => {
    const client = makeClient({ result: (query) => ({ data: query.calls.some(([method]) => method === "maybeSingle") ? null : [{ id: projectId, title: "Mine" }], error: null }) });
    expect(await loadAdminSnapshot(client as never, { ...filters, project: foreignId }, now))
      .toEqual({ kind: "invalid-project" });
    expect(client.queries.every((query) => query.table === "projects")).toBe(true);
    expect(client.queries[1].calls).toContainEqual(["eq", "id", foreignId]);
    expect(client.queries[1].calls).toContainEqual(["eq", "user_id", userId]);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("keeps exact filtered counts independent from the bounded recent sample", async () => {
    const client = makeClient();
    const actual = await snapshot(client, { ...filters, feature: "embedding", status: "error" });
    expect(actual.counts.total).toBe(1203);
    expect(actual.recent).toEqual([]);
    const usageQueries = client.queries.filter((query) => query.table === "llm_usage_logs");
    const countQueries = usageQueries.filter((query) => query.calls.some(([method, columns]) => method === "select" && columns === "id"));
    expect(countQueries).toHaveLength(4);
    for (const query of countQueries) {
      expect(query.calls).toContainEqual(["select", "id", { count: "exact", head: true }]);
      expect(query.calls).toContainEqual(["eq", "feature", "embedding"]);
      expect(query.calls).toContainEqual(["eq", "status", "error"]);
      expect(query.calls).toContainEqual(["gte", "created_at", "2026-10-03T12:00:00.000Z"]);
      expect(query.calls).not.toContainEqual(["limit", 50]);
    }
    expect(usageQueries.some((query) => query.calls.some(([method, value]) => method === "limit" && value === 50))).toBe(true);
    for (const query of client.queries.filter((query) => query.table !== "projects")) expect(query.calls).toContainEqual(["eq", "project_id", projectId]);
    expect(client.queries[0].calls).toContainEqual(["eq", "user_id", userId]);
    // Query mock exposes no mutation/provider methods, so any attempted write fails this success path.
    expect(new Set(client.queries.flatMap((query) => query.calls.map(([method]) => method))))
      .toEqual(new Set(["select", "eq", "order", "limit", "gte", "lte", "is", "not"]));
  });

  it("reads complete totals with all limits disabled using the authenticated user's scope", async () => {
    const client = makeClient();
    const actual = await snapshot(client);
    expect(actual.totals).toEqual(totals);
    expect(actual.decision).toEqual({ allowed: true, reason: null, warning: null });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("get_llm_usage_totals", {
      p_project_id: projectId, p_user_id: userId, p_project_active: true, p_project_monthly: true,
      p_user_active: true, p_user_monthly: true, p_as_of: now.toISOString(),
    });
  });

  it.each([
    ["SMART_WRITER_LLM_MONTHLY_BUDGET_USD", "8", "monthly"],
    ["SMART_WRITER_LLM_DAILY_BUDGET_USD", "3", "daily"],
    ["SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD", "9", "user_monthly"],
    ["SMART_WRITER_LLM_USER_DAILY_BUDGET_USD", "4", "user_daily"],
  ])("uses shared budget policy for %s", async (name, limit, reason) => {
    vi.stubEnv(name, limit);
    const actual = await snapshot(makeClient());
    expect(actual.decision).toEqual(evaluateLLMBudget(totals, actual.limits));
    expect(actual.decision?.reason).toBe(reason);
  });

  it("shows failed panels as unavailable while preserving successful aggregate reads", async () => {
    const client = makeClient();
    const failing = makeClient({ result: (query) => query.table === "projects" ? client.defaultResult(query) : Promise.reject(new Error("secret database details")) });
    const actual = await snapshot(failing);
    expect(actual.totals).toEqual(totals);
    expect(actual.recent).toBeNull();
    expect(actual.counts).toEqual({ total: null, missingUser: null, unknownCost: null, errors: null });
    expect(actual.latestUsageUnavailable).toBe(true);
    expect(actual.chaptersUnavailable).toBe(true);
    expect(actual.jobs).toBeNull();
    expect(JSON.stringify(actual)).not.toContain("secret database details");
  });

  it("normalizes direct loader input to the supported bounded filter set", async () => {
    const client = makeClient();
    const actual = await snapshot(client, { days: 9999, feature: "raw_prompt", status: "unexpected" } as unknown as AdminFilters);
    expect(actual.filters).toEqual({ project: undefined, days: 7, feature: "", status: "" });
    for (const query of client.queries.filter((query) => query.table === "llm_usage_logs")) {
      expect(query.calls).not.toContainEqual(["eq", "feature", "raw_prompt"]);
      expect(query.calls).not.toContainEqual(["eq", "status", "unexpected"]);
      const since = query.calls.find(([method]) => method === "gte");
      if (since) expect(since).toEqual(["gte", "created_at", "2026-10-03T12:00:00.000Z"]);
    }
  });

  it("rejects invalid snapshot time before any data read", async () => {
    const client = makeClient();
    expect(await loadAdminSnapshot(client as never, filters, new Date(NaN))).toEqual({ kind: "unavailable" });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("preserves empty successful results separately from failed count reads", async () => {
    const base = makeClient();
    const client = makeClient({ result: (query) => {
      if (query.table === "projects") return base.defaultResult(query);
      if (query.calls.some(([method, column]) => method === "is" && column === "cost_usd"))
        return { data: null, count: 0, error: { message: "private error" } };
      if (query.calls.some(([method, columns]) => method === "select" && columns === "id"))
        return { data: null, count: 0, error: null };
      return { data: [], error: null };
    } });
    const actual = await snapshot(client);
    expect(actual.counts).toEqual({ total: 0, missingUser: 0, unknownCost: null, errors: 0 });
    expect(actual.recent).toEqual([]);
    expect(actual.latestUsage).toBeNull();
    expect(actual.latestUsageUnavailable).toBe(false);
    expect(actual.latestChapter).toBeNull();
    expect(actual.chaptersUnavailable).toBe(false);
    expect(actual.jobs).toEqual([]);
    expect(JSON.stringify(actual)).not.toContain("private error");
  });

  it("does not misreport aggregate failures as zero or an allowed configured budget", async () => {
    vi.stubEnv("SMART_WRITER_LLM_MONTHLY_BUDGET_USD", "10");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = makeClient();
    client.rpc.mockResolvedValue({ data: null, error: { message: "failed" } } as never);
    const actual = await snapshot(client);
    expect(actual.totals).toBeNull();
    expect(actual.aggregateMs).toBeNull();
    expect(actual.decision?.reason).toBe("unavailable");
    expect(actual.counts.total).toBe(1203);
  });
});
