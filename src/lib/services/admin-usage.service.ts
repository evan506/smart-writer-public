import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { requireAdmin } from "@/lib/auth/admin";
import {
  evaluateLLMBudget, getLLMBudgetLimits, readLLMUsageTotals,
  type LLMBudgetDecision, type LLMBudgetLimits, type LLMUsageTotals,
} from "./llm-budget.service";

export const ADMIN_FEATURES = ["entity_extraction", "analysis", "embedding", "report", "chat", "search_rag"] as const;
export type AdminFilters = { project?: string; days: 1 | 7 | 30 | 90; feature: string; status: string };
export type AdminProject = { id: string; title: string };
type UsageRow = Database["public"]["Tables"]["llm_usage_logs"]["Row"];
export type AdminUsageRow = Pick<UsageRow, "id" | "created_at" | "feature" | "model" | "status" | "cost_usd" | "latency_ms" | "retry_count" | "total_tokens" | "user_id" | "timed_out">;
export type AdminSnapshot = {
  checkedAt: string;
  filters: AdminFilters;
  projects: AdminProject[];
  moreProjects: boolean;
  selected: AdminProject | null;
  limits: LLMBudgetLimits;
  totals: LLMUsageTotals | null;
  decision: LLMBudgetDecision | null;
  aggregateMs: number | null;
  recent: AdminUsageRow[] | null;
  counts: { total: number | null; missingUser: number | null; unknownCost: number | null; errors: number | null };
  latestUsage: string | null;
  latestUsageUnavailable: boolean;
  latestChapter: { id: string; chapter_num: number; title: string | null; updated_at: string | null } | null;
  chaptersUnavailable: boolean;
  jobs: { id: string; chapter_id: string; status: string; updated_at: string; finished_at: string | null }[] | null;
};

export function parseAdminFilters(params: Record<string, string | string[] | undefined>): AdminFilters {
  const single = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const days = Number(single("days"));
  return {
    project: single("project") || undefined,
    days: days === 1 || days === 30 || days === 90 ? days : 7,
    feature: ADMIN_FEATURES.includes(single("feature") as typeof ADMIN_FEATURES[number]) ? single("feature") : "",
    status: ["success", "error"].includes(single("status")) ? single("status") : "",
  };
}

/** Read-only, caller-owned queries. Never uses a service-role client or model provider. */
export async function loadAdminSnapshot(
  supabase: SupabaseClient<Database>, filters: AdminFilters, now = new Date(),
): Promise<{ kind: "ready"; snapshot: AdminSnapshot } | { kind: "unauthenticated" | "forbidden" | "invalid-project" | "unavailable" }> {
  const admin = await requireAdmin(supabase);
  if (admin.kind !== "authorized") return admin;
  filters = parseAdminFilters({
    project: filters.project, days: String(filters.days),
    feature: filters.feature, status: filters.status,
  });
  if (filters.project && !z.uuid().safeParse(filters.project).success) return { kind: "invalid-project" };
  if (!Number.isFinite(now.getTime())) return { kind: "unavailable" };

  try {
    const projectsResult = await supabase.from("projects").select("id,title")
      .eq("user_id", admin.userId).order("updated_at", { ascending: false }).limit(101);
    if (projectsResult.error || !projectsResult.data) return { kind: "unavailable" };
    const projects = projectsResult.data.slice(0, 100);
    let selected = projects.find((project) => project.id === filters.project) ?? null;
    if (filters.project && !selected) {
      const owned = await supabase.from("projects").select("id,title")
        .eq("id", filters.project).eq("user_id", admin.userId).maybeSingle();
      if (owned.error) return { kind: "unavailable" };
      if (!owned.data) return { kind: "invalid-project" };
      selected = owned.data;
      projects.push(owned.data);
    }
    if (!filters.project) selected = projects[0] ?? null;
    const limits = getLLMBudgetLimits();
    const snapshot: AdminSnapshot = {
      checkedAt: now.toISOString(), filters, projects, moreProjects: projectsResult.data.length > 100,
      selected, limits, totals: null, decision: null, aggregateMs: null, recent: null,
      counts: { total: null, missingUser: null, unknownCost: null, errors: null },
      latestUsage: null, latestUsageUnavailable: false, latestChapter: null,
      chaptersUnavailable: false, jobs: null,
    };
    if (!selected) return { kind: "ready", snapshot };
    const projectId = selected.id;
    const asOf = now.toISOString();
    const since = new Date(now.getTime() - filters.days * 86400_000).toISOString();
    const windowQuery = () => {
      let query = supabase.from("llm_usage_logs").select("id", { count: "exact", head: true })
        .eq("project_id", projectId).gte("created_at", since).lte("created_at", asOf);
      if (filters.feature) query = query.eq("feature", filters.feature);
      if (filters.status) query = query.eq("status", filters.status);
      return query;
    };
    let recentQuery = supabase.from("llm_usage_logs")
      .select("id,created_at,feature,model,status,cost_usd,latency_ms,retry_count,total_tokens,user_id,timed_out")
      .eq("project_id", projectId).gte("created_at", since).lte("created_at", asOf)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
    if (filters.feature) recentQuery = recentQuery.eq("feature", filters.feature);
    if (filters.status) recentQuery = recentQuery.eq("status", filters.status);
    const started = performance.now();
    const budgetRead = readLLMUsageTotals(supabase, { projectId, userId: admin.userId }, {
      projectActive: true, projectMonthly: true, userActive: true, userMonthly: true,
    }, now).then((totals) => ({ totals, elapsed: Math.round(performance.now() - started) }));
    // Each read settles separately so one unavailable panel does not look like zero usage.
    const results = await Promise.allSettled([
      budgetRead, recentQuery, windowQuery(), windowQuery().is("user_id", null),
      windowQuery().is("cost_usd", null), windowQuery().eq("status", "error"),
      supabase.from("llm_usage_logs").select("created_at").eq("project_id", projectId)
        .lte("created_at", asOf).order("created_at", { ascending: false }).limit(1),
      supabase.from("chapters").select("id,chapter_num,title,updated_at")
        .eq("project_id", projectId).not("updated_at", "is", null)
        .order("updated_at", { ascending: false }).limit(1),
      supabase.from("analysis_jobs").select("id,chapter_id,status,updated_at,finished_at")
        .eq("project_id", projectId).order("updated_at", { ascending: false }).limit(5),
    ]);
    const [budget, recent, total, missing, unknown, errors, latest, chapter, jobs] = results;
    if (budget.status === "fulfilled") {
      snapshot.totals = budget.value.totals;
      snapshot.aggregateMs = budget.value.totals ? budget.value.elapsed : null;
    }
    snapshot.decision = evaluateLLMBudget(snapshot.totals, limits);
    if (recent.status === "fulfilled" && !recent.value.error) snapshot.recent = recent.value.data;
    const count = (result: typeof total) => result.status === "fulfilled" && !result.value.error ? result.value.count : null;
    snapshot.counts = { total: count(total), missingUser: count(missing), unknownCost: count(unknown), errors: count(errors) };
    snapshot.latestUsageUnavailable = latest.status !== "fulfilled" || !!latest.value.error;
    if (latest.status === "fulfilled" && !latest.value.error) snapshot.latestUsage = latest.value.data?.[0]?.created_at ?? null;
    snapshot.chaptersUnavailable = chapter.status !== "fulfilled" || !!chapter.value.error;
    if (chapter.status === "fulfilled" && !chapter.value.error) snapshot.latestChapter = chapter.value.data?.[0] ?? null;
    if (jobs.status === "fulfilled" && !jobs.value.error) snapshot.jobs = jobs.value.data;
    return { kind: "ready", snapshot };
  } catch {
    return { kind: "unavailable" };
  }
}
