import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { checkLLMBudget } from "@/lib/services/llm-budget.service";
import type { Database } from "@/types/database.types";
import { projectFactory } from "../factories/smart-writer";
import {
  createLocalOwnerClient,
  getLocalSupabaseEnv,
} from "./helpers/local-supabase";

const env = getLocalSupabaseEnv();
const runner = env.enabled ? describe : describe.skip;
const asOf = new Date("2026-10-08T12:00:00.000Z");
type UsageInsert = Database["public"]["Tables"]["llm_usage_logs"]["Insert"];

runner("Authenticated AI budget aggregation through local PostgREST", () => {
  if (!env.enabled) {
    it(`skipped: ${env.reason}`, () => {});
    return;
  }

  const activeEnv = env;
  const userIds: string[] = [];
  const projectIds: string[] = [];

  afterEach(async () => {
    // Register seeds immediately so partial setup failures are cleaned up too.
    const failures: unknown[] = [];
    for (const id of projectIds.splice(0)) {
      const { error } = await activeEnv.service.from("projects").delete().eq("id", id);
      if (error) failures.push(error);
    }
    for (const id of userIds.splice(0)) {
      const { error } = await activeEnv.service.auth.admin.deleteUser(id);
      if (error) failures.push(error);
    }
    if (failures.length) throw new AggregateError(failures, "Budget fixture cleanup failed");
  });

  async function owner() {
    const result = await createLocalOwnerClient(activeEnv);
    userIds.push(result.userId);
    return result;
  }

  async function project(userId: string) {
    const { data, error } = await activeEnv.service.from("projects")
      .insert(projectFactory({ user_id: userId })).select("id").single();
    if (error) throw error;
    projectIds.push(data.id);
    return data.id;
  }

  function usage(projectId: string, userId: string | null, cost: number | null,
    createdAt = "2026-10-08T10:00:00.000Z"): UsageInsert {
    return {
      project_id: projectId, user_id: userId, cost_usd: cost,
      created_at: createdAt, feature: "embedding", model: "no-paid-ai",
      status: "success",
    };
  }

  async function seed(rows: UsageInsert[]) {
    const { error } = await activeEnv.service.from("llm_usage_logs").insert(rows);
    if (error) throw error;
  }

  function args(projectId: string, userId: string) {
    return {
      p_project_id: projectId, p_user_id: userId,
      p_project_active: true, p_project_monthly: true,
      p_user_active: true, p_user_monthly: true, p_as_of: asOf.toISOString(),
    };
  }

  it("aggregates beyond the API row cap and blocks project/user limits across projects", async () => {
    const account = await owner();
    const first = await project(account.userId);
    const second = await project(account.userId);
    await seed([
      ...Array.from({ length: 1501 }, () => usage(first, account.userId, 0.001)),
      usage(first, null, 0.2), usage(second, account.userId, 0.3),
    ]);

    const raw = await account.client.from("llm_usage_logs").select("cost_usd")
      .eq("project_id", first);
    expect(raw.error).toBeNull();
    expect(raw.data).toHaveLength(1000);
    const totals = await account.client.rpc("get_llm_usage_totals", args(first, account.userId));
    expect(totals.error).toBeNull();
    expect(totals.data).toHaveLength(1);
    expect(totals.data?.[0].authorized).toBe(true);
    expect(totals.data?.[0].project_month_usd).toBeCloseTo(1.701, 6);
    expect(totals.data?.[0].user_month_usd).toBeCloseTo(1.801, 6);

    const scope = { projectId: first, userId: account.userId };
    expect(await checkLLMBudget(account.client, scope,
      { dailyUsd: null, monthlyUsd: 1.6 }, asOf))
      .toEqual({ allowed: false, reason: "monthly", warning: null });
    expect(await checkLLMBudget(account.client, scope,
      { dailyUsd: null, monthlyUsd: null, userMonthlyUsd: 1.7 }, asOf))
      .toEqual({ allowed: false, reason: "user_monthly", warning: null });
  });

  it("uses inclusive UTC boundaries, excludes future rows, and reports unknown costs", async () => {
    const account = await owner();
    const id = await project(account.userId);
    await seed([
      usage(id, account.userId, 1, "2026-09-30T23:59:59.999Z"),
      usage(id, account.userId, 2, "2026-10-01T00:00:00.000Z"),
      usage(id, account.userId, 4, "2026-10-08T00:00:00.000Z"),
      usage(id, account.userId, 8, asOf.toISOString()),
      usage(id, account.userId, 16, "2026-10-08T12:00:00.001Z"),
      usage(id, account.userId, null),
    ]);
    const { data, error } = await account.client.rpc("get_llm_usage_totals", args(id, account.userId));
    expect(error).toBeNull();
    expect(data).toEqual([{
      authorized: true, project_day_usd: 12, project_month_usd: 14,
      user_day_usd: 12, user_month_usd: 14,
      project_unknown_cost_count: 1, user_unknown_cost_count: 1,
    }]);
    expect(await checkLLMBudget(account.client, { projectId: id, userId: account.userId },
      { dailyUsd: 12, monthlyUsd: null }, asOf))
      .toEqual({ allowed: false, reason: "daily", warning: null });
    expect(await checkLLMBudget(account.client, { projectId: id, userId: account.userId },
      { dailyUsd: null, monthlyUsd: null, userDailyUsd: 12 }, asOf))
      .toEqual({ allowed: false, reason: "user_daily", warning: null });
  });

  it("rejects another owner's project and forged user scope without exposing totals", async () => {
    const account = await owner();
    const stranger = await owner();
    const ownProject = await project(account.userId);
    const foreignProject = await project(stranger.userId);
    await seed([usage(foreignProject, stranger.userId, 9)]);
    for (const scope of [args(foreignProject, account.userId), args(ownProject, stranger.userId)]) {
      const { data, error } = await account.client.rpc("get_llm_usage_totals", scope);
      expect(error).toBeNull();
      expect(data).toEqual([{
        authorized: false, project_day_usd: 0, project_month_usd: 0,
        user_day_usd: 0, user_month_usd: 0,
        project_unknown_cost_count: 0, user_unknown_cost_count: 0,
      }]);
      expect(await checkLLMBudget(account.client,
        { projectId: scope.p_project_id, userId: scope.p_user_id },
        { dailyUsd: 1, monthlyUsd: null, userDailyUsd: 1 }, asOf))
        .toEqual({ allowed: false, reason: "unavailable", warning: null });
    }
  });

  it("denies function execution to anonymous and service-role API clients", async () => {
    const account = await owner();
    const id = await project(account.userId);
    const anonymous = createClient<Database>(activeEnv.url, activeEnv.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const client of [anonymous, activeEnv.service]) {
      const { data, error } = await client.rpc("get_llm_usage_totals", args(id, account.userId));
      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    }
  });
});
