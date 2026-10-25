import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type LLMBudgetLimits = {
  dailyUsd: number | null;
  monthlyUsd: number | null;
  /** Per-user caps across ALL of the user's projects — closes the
   *  "create N projects to get N× the per-project budget" bypass. */
  userDailyUsd?: number | null;
  userMonthlyUsd?: number | null;
};

export type LLMUsageTotals =
  Database["public"]["Functions"]["get_llm_usage_totals"]["Returns"][number];

export type LLMBudgetScope = {
  projectId: string;
  /** Enables the user-level axis when user limits are configured. */
  userId?: string | null;
};

export type LLMBudgetWarning = {
  level: 50 | 80;
  axis: "project" | "user";
  window: "daily" | "monthly";
  usedUsd: number;
  limitUsd: number;
};

export type LLMBudgetDecision = {
  allowed: boolean;
  reason:
    | "daily"
    | "monthly"
    | "user_daily"
    | "user_monthly"
    | "scan_cap"
    | "unavailable"
    | null;
  /** Highest tier crossed on any active axis while still allowed; null when
   *  under 50% everywhere or when blocked. Surfaced for ops logs / future UI. */
  warning: LLMBudgetWarning | null;
};

export const LLM_BUDGET_BLOCKED_MESSAGE =
  "이 프로젝트의 AI 사용 한도에 도달했습니다. 한도가 초기화된 후 다시 시도해 주세요.";

function parseLimit(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getLLMBudgetLimits(): LLMBudgetLimits {
  return {
    dailyUsd: parseLimit(process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD),
    monthlyUsd: parseLimit(process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD),
    userDailyUsd: parseLimit(
      process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD
    ),
    userMonthlyUsd: parseLimit(
      process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD
    ),
  };
}

export const LLM_BUDGET_UNAVAILABLE_MESSAGE =
  "원고는 저장되었습니다. AI 사용 한도를 확인할 수 없어 AI 처리를 잠시 멈췄습니다.";

export function getLLMBudgetMessage(value: { reason: LLMBudgetDecision["reason"] }): string {
  return value.reason === "unavailable"
    ? "AI 사용 한도를 확인할 수 없어 AI 처리를 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요."
    : LLM_BUDGET_BLOCKED_MESSAGE;
}

export class LLMBudgetError extends Error {
  constructor(public readonly reason: NonNullable<LLMBudgetDecision["reason"]>) {
    super(getLLMBudgetMessage({ reason }));
    this.name = "LLMBudgetError";
  }
}

/** Check immediately before an actual paid attempt, including provider retries. */
export function createLLMBudgetGuard(
  supabase: SupabaseClient<Database>,
  scope: LLMBudgetScope
): () => Promise<void> {
  return async () => {
    // Even optional budgets must not produce unattributed paid usage.
    if (!scope.userId) throw new LLMBudgetError("unavailable");
    const decision = await checkLLMBudget(supabase, scope);
    if (!decision.allowed) throw new LLMBudgetError(decision.reason ?? "unavailable");
  };
}

const unavailable = (): LLMBudgetDecision => ({
  allowed: false, reason: "unavailable", warning: null,
});

function validTotal(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function warningTier(usedUsd: number, limitUsd: number): 50 | 80 | null {
  if (usedUsd >= limitUsd * 0.8) return 80;
  if (usedUsd >= limitUsd * 0.5) return 50;
  return null;
}

/**
 * LLM spend guard over `llm_usage_logs` (UTC windows).
 *
 * Two axes, both optional via env:
 *  - project: SMART_WRITER_LLM_DAILY/MONTHLY_BUDGET_USD (per project)
 *  - user:    SMART_WRITER_LLM_USER_DAILY/MONTHLY_BUDGET_USD (per user,
 *             summed across all their projects; requires scope.userId)
 *
 * All limits unset → guard disabled. Query failure → stop AI only; callers
 * preserve manuscript/manual writes separately. One aggregate RPC avoids
 * row response caps and separate page snapshots. Crossing 50%/80% is reported via
 * `warning` and logged for ops visibility.
 */
export async function checkLLMBudget(
  supabase: SupabaseClient<Database>,
  scope: string | LLMBudgetScope,
  limits: LLMBudgetLimits = getLLMBudgetLimits(),
  now: Date = new Date()
): Promise<LLMBudgetDecision> {
  const { projectId, userId } =
    typeof scope === "string" ? { projectId: scope, userId: null } : scope;

  const projectActive = limits.dailyUsd !== null || limits.monthlyUsd !== null;
  const userConfigured = (limits.userDailyUsd ?? null) !== null ||
    (limits.userMonthlyUsd ?? null) !== null;
  if (!projectActive && !userConfigured) {
    return { allowed: true, reason: null, warning: null };
  }
  if (userConfigured && !userId) return unavailable();
  if (!Number.isFinite(now.getTime())) return unavailable();

  const totals = await readLLMUsageTotals(supabase, { projectId, userId }, {
    projectActive,
    projectMonthly: limits.monthlyUsd !== null,
    userActive: userConfigured,
    userMonthly: (limits.userMonthlyUsd ?? null) !== null,
  }, now);
  if (!totals) return unavailable();
  if (totals.project_unknown_cost_count > 0 || totals.user_unknown_cost_count > 0) {
    // Unknown cost is not proof of free usage. Preserve current policy while
    // exposing missing pricing for operator investigation (no manuscript data).
    console.warn("[LLMBudget] usage has unknown costs:", {
      projectId, project: totals.project_unknown_cost_count,
      user: totals.user_unknown_cost_count,
    });
  }
  const decision = evaluateLLMBudget(totals, limits);
  const { warning } = decision;

  if (warning) {
    console.warn(
      `[LLMBudget] ${warning.level}% of ${warning.axis} ${warning.window} budget used` +
        ` (project=${projectId}${userId ? ` user=${userId}` : ""}:` +
        ` $${warning.usedUsd.toFixed(4)} of $${warning.limitUsd})`
    );
  }

  return decision;
}

function validUsageTotals(totals: LLMUsageTotals | null): totals is LLMUsageTotals {
  return typeof totals === "object" && totals !== null && totals.authorized === true && [
    totals.project_day_usd, totals.project_month_usd,
    totals.user_day_usd, totals.user_month_usd,
    totals.project_unknown_cost_count, totals.user_unknown_cost_count,
  ].every(validTotal);
}

/** Read one authorized UTC aggregate without applying budget policy. */
export async function readLLMUsageTotals(
  supabase: SupabaseClient<Database>,
  scope: LLMBudgetScope,
  options: { projectActive: boolean; projectMonthly: boolean; userActive: boolean; userMonthly: boolean },
  now: Date
): Promise<LLMUsageTotals | null> {
  if (!Number.isFinite(now.getTime()) || (options.userActive && !scope.userId)) return null;
  try {
    const { data, error } = await supabase.rpc("get_llm_usage_totals", {
      p_project_id: scope.projectId,
      p_user_id: scope.userId ?? null,
      p_project_active: options.projectActive,
      p_project_monthly: options.projectMonthly,
      p_user_active: options.userActive,
      p_user_monthly: options.userMonthly,
      p_as_of: now.toISOString(),
    });
    if (error) {
      console.error("[LLMBudget] usage aggregate failed:", error.message);
      return null;
    }
    if (!Array.isArray(data) || data.length !== 1 || !validUsageTotals(data[0])) return null;
    return data[0];
  } catch (error) {
    console.error("[LLMBudget] usage aggregate unavailable:",
      error instanceof Error ? error.message : error);
    return null;
  }
}

/** Pure policy shared by the paid guard and read-only operations display.
 * Unknown costs remain informational and never create an inferred charge.
 */
export function evaluateLLMBudget(
  totals: LLMUsageTotals | null,
  limits: LLMBudgetLimits
): LLMBudgetDecision {
  const projectActive = limits.dailyUsd !== null || limits.monthlyUsd !== null;
  const userConfigured = (limits.userDailyUsd ?? null) !== null ||
    (limits.userMonthlyUsd ?? null) !== null;
  if (!projectActive && !userConfigured) return { allowed: true, reason: null, warning: null };
  if (!validUsageTotals(totals)) return unavailable();

  const projectSums = projectActive
    ? { dayUsd: totals.project_day_usd, monthUsd: totals.project_month_usd } : null;
  const userSums = userConfigured
    ? { dayUsd: totals.user_day_usd, monthUsd: totals.user_month_usd } : null;

  // Axis checks — project first (existing precedence), monthly before daily.
  const checks: Array<{
    reason: NonNullable<LLMBudgetDecision["reason"]>;
    axis: "project" | "user";
    window: "daily" | "monthly";
    usedUsd: number;
    limitUsd: number | null;
  }> = [
    {
      reason: "monthly",
      axis: "project",
      window: "monthly",
      usedUsd: projectSums?.monthUsd ?? 0,
      limitUsd: projectSums ? limits.monthlyUsd : null,
    },
    {
      reason: "daily",
      axis: "project",
      window: "daily",
      usedUsd: projectSums?.dayUsd ?? 0,
      limitUsd: projectSums ? limits.dailyUsd : null,
    },
    {
      reason: "user_monthly",
      axis: "user",
      window: "monthly",
      usedUsd: userSums?.monthUsd ?? 0,
      limitUsd: userSums ? (limits.userMonthlyUsd ?? null) : null,
    },
    {
      reason: "user_daily",
      axis: "user",
      window: "daily",
      usedUsd: userSums?.dayUsd ?? 0,
      limitUsd: userSums ? (limits.userDailyUsd ?? null) : null,
    },
  ];

  for (const check of checks) {
    if (check.limitUsd !== null && check.usedUsd >= check.limitUsd) {
      return { allowed: false, reason: check.reason, warning: null };
    }
  }

  let warning: LLMBudgetWarning | null = null;
  for (const check of checks) {
    if (check.limitUsd === null) continue;
    const tier = warningTier(check.usedUsd, check.limitUsd);
    if (tier !== null && (warning === null || tier > warning.level)) {
      warning = {
        level: tier,
        axis: check.axis,
        window: check.window,
        usedUsd: check.usedUsd,
        limitUsd: check.limitUsd,
      };
    }
  }

  return { allowed: true, reason: null, warning };
}
