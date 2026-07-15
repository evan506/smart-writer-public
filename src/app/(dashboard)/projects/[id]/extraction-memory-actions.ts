"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import {
  loadExtractionMemoryPanel,
  loadExtractionMetrics,
} from "@/lib/services/extraction-memory/panel.service";
import {
  clearGenreOverride,
  deleteRule,
  overrideGenreRule,
  removeExcludedTerm,
  setRuleStatus,
} from "@/lib/services/extraction-memory/write.service";
import {
  createDistillationDeps,
  runExtractionDistillation,
} from "@/lib/services/extraction-memory/distillation.service";
import {
  checkLLMBudget,
  LLM_BUDGET_BLOCKED_MESSAGE,
} from "@/lib/services";

const EMPTY_PANEL = {
  projectRules: [],
  genreRules: [],
  proposals: [],
  excludedNames: [],
};
const EMPTY_METRICS = { confirmed: 0, dismissed: 0, acceptanceRate: null };

export async function getExtractionMemory(projectId: string) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) {
    return { error: owner.error, panel: EMPTY_PANEL, metrics: EMPTY_METRICS };
  }
  const [panel, metrics] = await Promise.all([
    loadExtractionMemoryPanel(supabase, projectId),
    loadExtractionMetrics(supabase, projectId),
  ]);
  return { error: null, panel, metrics };
}

export async function activateExtractionRule(
  projectId: string,
  ruleId: string
) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await setRuleStatus(supabase, projectId, ruleId, "ACTIVE");
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function disableExtractionRule(
  projectId: string,
  ruleId: string
) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await setRuleStatus(supabase, projectId, ruleId, "DISABLED");
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function deleteExtractionRule(projectId: string, ruleId: string) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await deleteRule(supabase, projectId, ruleId);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

/** Disable an inherited genre baseline rule for this project. */
export async function overrideGenreConventionRule(
  projectId: string,
  ruleKey: string,
  ruleText: string
) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await overrideGenreRule(supabase, projectId, ruleKey, ruleText);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

/** Re-enable a previously overridden genre baseline rule. */
export async function restoreGenreConventionRule(
  projectId: string,
  ruleKey: string
) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await clearGenreOverride(supabase, projectId, ruleKey);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

/**
 * Remove a name from the project exclusion list ("제외 해제"). Also used to
 * restore a candidate that was suppressed by an exact-name exclusion — once
 * removed, the name can resurface as a normal candidate on the next analysis.
 */
export async function removeProjectExcludedTerm(
  projectId: string,
  name: string
) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await removeExcludedTerm(supabase, projectId, name);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

/**
 * Author-triggered distillation: propose exclusion rules from recent
 * dismissals. Proposals land DISABLED and never affect extraction until the
 * author activates them.
 */
export async function generateExtractionProposals(projectId: string) {
  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error, proposed: 0 };

  const budget = await checkLLMBudget(supabase, {
    projectId,
    userId: owner.userId,
  });
  if (!budget.allowed) {
    return { error: LLM_BUDGET_BLOCKED_MESSAGE, proposed: 0 };
  }

  const outcome = await runExtractionDistillation(
    projectId,
    createDistillationDeps(supabase, {
      projectId,
      userId: owner.userId,
    })
  );
  if (outcome.error) return { error: outcome.error, proposed: 0 };

  revalidatePath(`/projects/${projectId}`, "layout");
  return {
    error: null,
    proposed: outcome.proposed,
    skippedReason: outcome.skippedReason ?? null,
  };
}
