import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Guard scans at most this many usage rows per window; hitting the cap is
// itself treated as runaway usage (fail safe) instead of undercounting.
const ROW_SCAN_CAP = 10_000;

export type LLMBudgetLimits = {
  dailyUsd: number | null;
  monthlyUsd: number | null;
  /** Per-user caps across ALL of the user's projects — closes the
   *  "create N projects to get N× the per-project budget" bypass. */
  userDailyUsd?: number | null;
  userMonthlyUsd?: number | null;
};

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

type WindowSums = { dayUsd: number; monthUsd: number; scanCapped: boolean };

async function sumUsage(
  supabase: SupabaseClient<Database>,
  column: "project_id" | "user_id",
  id: string,
  windowStart: Date,
  dayStartIso: string
): Promise<WindowSums | null> {
  const { data, error } = await supabase
    .from("llm_usage_logs")
    .select("cost_usd, created_at")
    .eq(column, id)
    .gte("created_at", windowStart.toISOString())
    .limit(ROW_SCAN_CAP);

  if (error) {
    console.error("[LLMBudget] usage query failed:", error.message);
    return null; // fail open — a broken guard must never block author saves
  }

  const rows = data ?? [];
  if (rows.length >= ROW_SCAN_CAP) {
    return { dayUsd: 0, monthUsd: 0, scanCapped: true };
  }

  let monthUsd = 0;
  let dayUsd = 0;
  for (const row of rows) {
    const cost = typeof row.cost_usd === "number" ? row.cost_usd : 0;
    monthUsd += cost;
    if ((row.created_at ?? "") >= dayStartIso) dayUsd += cost;
  }
  return { dayUsd, monthUsd, scanCapped: false };
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
 * All limits unset → guard disabled. Query failure → fail open so a broken
 * guard can never block author saves; abuse remains bounded by the next
 * successful check. Crossing 50%/80% of any active limit is reported via
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
  const userActive =
    Boolean(userId) &&
    ((limits.userDailyUsd ?? null) !== null ||
      (limits.userMonthlyUsd ?? null) !== null);

  if (!projectActive && !userActive) {
    return { allowed: true, reason: null, warning: null };
  }

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayStartIso = dayStart.toISOString();

  const projectWindowStart = limits.monthlyUsd !== null ? monthStart : dayStart;
  const userWindowStart =
    (limits.userMonthlyUsd ?? null) !== null ? monthStart : dayStart;

  const [projectSums, userSums] = await Promise.all([
    projectActive
      ? sumUsage(supabase, "project_id", projectId, projectWindowStart, dayStartIso)
      : Promise.resolve(null),
    userActive
      ? sumUsage(supabase, "user_id", userId as string, userWindowStart, dayStartIso)
      : Promise.resolve(null),
  ]);

  if (projectSums?.scanCapped || userSums?.scanCapped) {
    return { allowed: false, reason: "scan_cap", warning: null };
  }

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

  if (warning) {
    console.warn(
      `[LLMBudget] ${warning.level}% of ${warning.axis} ${warning.window} budget used` +
        ` (project=${projectId}${userId ? ` user=${userId}` : ""}:` +
        ` $${warning.usedUsd.toFixed(4)} of $${warning.limitUsd})`
    );
  }

  return { allowed: true, reason: null, warning };
}
