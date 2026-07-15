import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkLLMBudget,
  getLLMBudgetLimits,
  type LLMBudgetLimits,
} from "@/lib/services/llm-budget.service";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

type Row = { cost_usd: number | null; created_at: string | null };
type QueryResult = { data: Row[] | null; error: { message: string } | null };

// Minimal chainable Supabase mock covering the exact chain used by
// checkLLMBudget: .from().select().eq().gte().limit() -> QueryResult.
// Kept for the string-scope regression tests (single-axis, single query).
function makeClient(result: QueryResult) {
  const promise = Promise.resolve(result);
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    limit: vi.fn(() => promise),
  };
  const from = vi.fn(() => chain);
  return { from: from as unknown, client: { from } };
}

function row(cost: number, createdAt: string): Row {
  return { cost_usd: cost, created_at: createdAt };
}

describe("getLLMBudgetLimits", () => {
  const ORIGINAL_DAILY = process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD;
  const ORIGINAL_MONTHLY = process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD;
  const ORIGINAL_USER_DAILY = process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD;
  const ORIGINAL_USER_MONTHLY =
    process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD;

  afterEach(() => {
    if (ORIGINAL_DAILY === undefined) {
      delete process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = ORIGINAL_DAILY;
    }
    if (ORIGINAL_MONTHLY === undefined) {
      delete process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD = ORIGINAL_MONTHLY;
    }
    if (ORIGINAL_USER_DAILY === undefined) {
      delete process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD = ORIGINAL_USER_DAILY;
    }
    if (ORIGINAL_USER_MONTHLY === undefined) {
      delete process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD = ORIGINAL_USER_MONTHLY;
    }
  });

  it("returns null for all four limits when env vars are unset", () => {
    delete process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD;
    delete process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD;
    delete process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD;
    delete process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD;

    expect(getLLMBudgetLimits()).toEqual({
      dailyUsd: null,
      monthlyUsd: null,
      userDailyUsd: null,
      userMonthlyUsd: null,
    });
  });

  it("parses valid positive numbers for all four limits", () => {
    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "5";
    process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD = "100.5";
    process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD = "2.5";
    process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD = "40";

    expect(getLLMBudgetLimits()).toEqual({
      dailyUsd: 5,
      monthlyUsd: 100.5,
      userDailyUsd: 2.5,
      userMonthlyUsd: 40,
    });
  });

  it("treats invalid (non-numeric), zero, and negative values as null", () => {
    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "not-a-number";
    expect(getLLMBudgetLimits().dailyUsd).toBeNull();

    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "0";
    expect(getLLMBudgetLimits().dailyUsd).toBeNull();

    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "-5";
    expect(getLLMBudgetLimits().dailyUsd).toBeNull();
  });
});

describe("checkLLMBudget", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("string scope (backward-compat regression)", () => {
    it("skips the query and allows when both limits are unset", async () => {
      const { client, from } = makeClient({ data: [], error: null });

      const result = await checkLLMBudget(
        client as never,
        projectId,
        { dailyUsd: null, monthlyUsd: null },
        now
      );

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
      expect(from).not.toHaveBeenCalled();
    });

    it("allows when usage is under both limits", async () => {
      const { client } = makeClient({
        data: [
          { cost_usd: 1, created_at: "2026-06-15T01:00:00.000Z" },
          { cost_usd: 2, created_at: "2026-06-10T01:00:00.000Z" },
        ],
        error: null,
      });
      const limits: LLMBudgetLimits = { dailyUsd: 10, monthlyUsd: 50 };

      const result = await checkLLMBudget(client as never, projectId, limits, now);

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
    });

    it("blocks with reason 'monthly' when accumulated month cost meets/exceeds the monthly limit", async () => {
      const { client } = makeClient({
        data: [
          { cost_usd: 3, created_at: "2026-06-01T01:00:00.000Z" },
          { cost_usd: 3, created_at: "2026-06-05T01:00:00.000Z" },
        ],
        error: null,
      });
      const limits: LLMBudgetLimits = { dailyUsd: null, monthlyUsd: 5 };

      const result = await checkLLMBudget(client as never, projectId, limits, now);

      expect(result).toEqual({ allowed: false, reason: "monthly", warning: null });
    });

    it("blocks with reason 'daily' when today's rows meet/exceed the daily limit (earlier-month rows do not count)", async () => {
      const { client } = makeClient({
        data: [
          // earlier in month: counts toward monthly total but not the day window
          { cost_usd: 1, created_at: "2026-06-01T01:00:00.000Z" },
          // today: pushes the day total over the daily limit
          { cost_usd: 4, created_at: "2026-06-15T01:00:00.000Z" },
        ],
        error: null,
      });
      const limits: LLMBudgetLimits = { dailyUsd: 3, monthlyUsd: 100 };

      const result = await checkLLMBudget(client as never, projectId, limits, now);

      expect(result).toEqual({ allowed: false, reason: "daily", warning: null });
    });

    it("counts rows from earlier in the month toward the monthly total but excludes them from the daily total", async () => {
      const { client } = makeClient({
        data: [
          // earlier-in-month row only: should NOT trip a daily limit on its own
          { cost_usd: 10, created_at: "2026-06-01T01:00:00.000Z" },
        ],
        error: null,
      });
      // Daily limit alone would appear tripped if the row incorrectly counted
      // toward "today"; monthly limit is generous so only daily would fire.
      const limits: LLMBudgetLimits = { dailyUsd: 5, monthlyUsd: 1000 };

      const result = await checkLLMBudget(client as never, projectId, limits, now);

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
    });

    it("fails open (allowed) when the usage query errors", async () => {
      const { client } = makeClient({
        data: null,
        error: { message: "boom" },
      });
      const limits: LLMBudgetLimits = { dailyUsd: 1, monthlyUsd: 1 };

      const result = await checkLLMBudget(client as never, projectId, limits, now);

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
    });

    it("blocks with reason 'scan_cap' when the row scan cap (10000) is hit", async () => {
      const rows: Row[] = Array.from({ length: 10_000 }, () => ({
        cost_usd: 0,
        created_at: "2026-06-15T01:00:00.000Z",
      }));
      const { client } = makeClient({ data: rows, error: null });
      const limits: LLMBudgetLimits = { dailyUsd: 1000, monthlyUsd: 1000 };

      const result = await checkLLMBudget(client as never, projectId, limits, now);

      expect(result).toEqual({ allowed: false, reason: "scan_cap", warning: null });
    });
  });

  describe("user axis (object scope)", () => {
    it("blocks with reason 'user_daily' when the user's daily spend meets/exceeds the user daily limit", async () => {
      const { client, calls } = createSupabaseMock({
        llm_usage_logs: [{ data: [row(5, "2026-06-15T02:00:00.000Z")], error: null }],
      });
      const limits: LLMBudgetLimits = {
        dailyUsd: null,
        monthlyUsd: null,
        userDailyUsd: 5,
        userMonthlyUsd: null,
      };

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: false, reason: "user_daily", warning: null });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.filters).toContainEqual({ method: "eq", args: ["user_id", userId] });
    });

    it("allows when the user's daily spend is under the user daily limit", async () => {
      const { client } = createSupabaseMock({
        llm_usage_logs: [{ data: [row(2, "2026-06-15T02:00:00.000Z")], error: null }],
      });
      const limits: LLMBudgetLimits = {
        dailyUsd: null,
        monthlyUsd: null,
        userDailyUsd: 5,
        userMonthlyUsd: null,
      };

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
    });

    it("blocks with reason 'user_monthly' when the user's monthly spend meets/exceeds the user monthly limit", async () => {
      const { client } = createSupabaseMock({
        llm_usage_logs: [
          {
            data: [
              row(12, "2026-06-02T02:00:00.000Z"),
              row(8, "2026-06-15T02:00:00.000Z"),
            ],
            error: null,
          },
        ],
      });
      const limits: LLMBudgetLimits = {
        dailyUsd: null,
        monthlyUsd: null,
        userDailyUsd: null,
        userMonthlyUsd: 20,
      };

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: false, reason: "user_monthly", warning: null });
    });

    it("is inactive (and issues no query) when userId is absent from scope, even with user limits configured and project limits null", async () => {
      const { client, calls } = createSupabaseMock({
        llm_usage_logs: [{ data: [row(999, "2026-06-15T02:00:00.000Z")], error: null }],
      });
      const limits: LLMBudgetLimits = {
        dailyUsd: null,
        monthlyUsd: null,
        userDailyUsd: 5,
        userMonthlyUsd: null,
      };

      const result = await checkLLMBudget(client as never, { projectId }, limits, now);

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
      expect(calls).toHaveLength(0);
    });
  });

  describe("both axes active", () => {
    it("blocks with the user reason when the project is under limit but the user is over", async () => {
      const limits: LLMBudgetLimits = {
        dailyUsd: 100,
        monthlyUsd: null,
        userDailyUsd: 5,
        userMonthlyUsd: null,
      };
      const { client, calls } = createSupabaseMock({
        llm_usage_logs: [
          { data: [row(10, "2026-06-15T02:00:00.000Z")], error: null }, // project: under
          { data: [row(6, "2026-06-15T02:00:00.000Z")], error: null }, // user: over
        ],
      });

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: false, reason: "user_daily", warning: null });
      // Project query is built first (synchronously, before the user query)
      // even though both resolve via Promise.all.
      expect(calls[0]?.filters).toContainEqual({ method: "eq", args: ["project_id", projectId] });
      expect(calls[1]?.filters).toContainEqual({ method: "eq", args: ["user_id", userId] });
    });

    it("blocks with the project reason (project checked first) when both project and user are over limit", async () => {
      const limits: LLMBudgetLimits = {
        dailyUsd: 5,
        monthlyUsd: null,
        userDailyUsd: 5,
        userMonthlyUsd: null,
      };
      const { client, calls } = createSupabaseMock({
        llm_usage_logs: [
          { data: [row(6, "2026-06-15T02:00:00.000Z")], error: null }, // project: over
          { data: [row(6, "2026-06-15T02:00:00.000Z")], error: null }, // user: also over
        ],
      });

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: false, reason: "daily", warning: null });
      expect(calls[0]?.filters).toContainEqual({ method: "eq", args: ["project_id", projectId] });
      expect(calls[1]?.filters).toContainEqual({ method: "eq", args: ["user_id", userId] });
    });
  });

  describe("warning tiers", () => {
    it("returns a level-50 warning (and logs it) when project daily usage is between 50% and 80% of the limit", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const limits: LLMBudgetLimits = {
        dailyUsd: 10,
        monthlyUsd: null,
        userDailyUsd: null,
        userMonthlyUsd: null,
      };
      const { client } = createSupabaseMock({
        llm_usage_logs: [{ data: [row(6, "2026-06-15T02:00:00.000Z")], error: null }], // 60%
      });

      const result = await checkLLMBudget(client as never, projectId, limits, now);

      expect(result.allowed).toBe(true);
      expect(result.warning).toEqual({
        level: 50,
        axis: "project",
        window: "daily",
        usedUsd: 6,
        limitUsd: 10,
      });
      expect(consoleWarn).toHaveBeenCalledTimes(1);
    });

    it("returns a level-80 warning when user monthly usage is at or above 80% of the limit", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const limits: LLMBudgetLimits = {
        dailyUsd: null,
        monthlyUsd: null,
        userDailyUsd: null,
        userMonthlyUsd: 20,
      };
      const { client } = createSupabaseMock({
        llm_usage_logs: [{ data: [row(17, "2026-06-02T02:00:00.000Z")], error: null }], // 85%
      });

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result.allowed).toBe(true);
      expect(result.warning).toEqual({
        level: 80,
        axis: "user",
        window: "monthly",
        usedUsd: 17,
        limitUsd: 20,
      });
      expect(consoleWarn).toHaveBeenCalledTimes(1);
    });

    it("surfaces the highest tier across axes when project is at 50-79% and user is at 80%+", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const limits: LLMBudgetLimits = {
        dailyUsd: 10,
        monthlyUsd: null,
        userDailyUsd: 10,
        userMonthlyUsd: null,
      };
      const { client } = createSupabaseMock({
        llm_usage_logs: [
          { data: [row(6, "2026-06-15T02:00:00.000Z")], error: null }, // project: 60% -> tier 50
          { data: [row(9, "2026-06-15T02:00:00.000Z")], error: null }, // user: 90% -> tier 80
        ],
      });

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result.allowed).toBe(true);
      expect(result.warning).toEqual({
        level: 80,
        axis: "user",
        window: "daily",
        usedUsd: 9,
        limitUsd: 10,
      });
      expect(consoleWarn).toHaveBeenCalledTimes(1);
    });

    it("returns warning null and does not log when usage is under 50% on all active axes", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const limits: LLMBudgetLimits = {
        dailyUsd: 10,
        monthlyUsd: null,
        userDailyUsd: 10,
        userMonthlyUsd: null,
      };
      const { client } = createSupabaseMock({
        llm_usage_logs: [
          { data: [row(1, "2026-06-15T02:00:00.000Z")], error: null }, // project: 10%
          { data: [row(1, "2026-06-15T02:00:00.000Z")], error: null }, // user: 10%
        ],
      });

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
      expect(consoleWarn).not.toHaveBeenCalled();
    });
  });

  describe("scan cap on the user query", () => {
    it("blocks with reason 'scan_cap' when the user axis hits the row scan cap even though the project axis is under limit", async () => {
      const userRows: Row[] = Array.from({ length: 10_000 }, () => ({
        cost_usd: 0,
        created_at: "2026-06-15T02:00:00.000Z",
      }));
      const limits: LLMBudgetLimits = {
        dailyUsd: 1000,
        monthlyUsd: null,
        userDailyUsd: 1000,
        userMonthlyUsd: null,
      };
      const { client, calls } = createSupabaseMock({
        llm_usage_logs: [
          { data: [row(1, "2026-06-15T02:00:00.000Z")], error: null }, // project: fine
          { data: userRows, error: null }, // user: hits the scan cap
        ],
      });

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: false, reason: "scan_cap", warning: null });
      expect(calls[1]?.filters).toContainEqual({ method: "eq", args: ["user_id", userId] });
    });
  });

  describe("user-axis fail-open", () => {
    it("allows (and logs via console.error, without throwing) when the user-axis query errors", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const limits: LLMBudgetLimits = {
        dailyUsd: null,
        monthlyUsd: null,
        userDailyUsd: 5,
        userMonthlyUsd: null,
      };
      const { client } = createSupabaseMock({
        llm_usage_logs: [{ data: null, error: { message: "boom" } }],
      });

      const result = await checkLLMBudget(
        client as never,
        { projectId, userId },
        limits,
        now
      );

      expect(result).toEqual({ allowed: true, reason: null, warning: null });
      expect(consoleError).toHaveBeenCalledWith(
        "[LLMBudget] usage query failed:",
        "boom"
      );
    });
  });
});
