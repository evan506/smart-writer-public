import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PreparedRule } from "./distillation";

type Db = SupabaseClient<Database>;
type Insert = Database["public"]["Tables"]["extraction_memory"]["Insert"];

export type WriteResult = { error: string | null };

/**
 * Insert distilled proposals (DISABLED) idempotently. Existing rules with the
 * same (project_id, kind, rule_key) are left untouched.
 */
export async function insertDistilledProposals(
  supabase: Db,
  projectId: string,
  rules: PreparedRule[]
): Promise<{ inserted: number; error: string | null }> {
  if (rules.length === 0) return { inserted: 0, error: null };

  const inserts: Insert[] = rules.map((rule) => ({
    project_id: projectId,
    kind: rule.kind,
    rule_key: rule.key,
    rule_text: rule.text,
    source: rule.source,
    status: rule.status,
    evidence: rule.evidence.length > 0 ? { dismissed: rule.evidence } : null,
  }));

  const { data, error } = await supabase
    .from("extraction_memory")
    .upsert(inserts, {
      onConflict: "project_id,kind,rule_key",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) return { inserted: 0, error: error.message };
  return { inserted: data?.length ?? 0, error: null };
}

/** Activate or disable a project-learned rule (EXCLUDE_PATTERN/TYPE_CONVENTION). */
export async function setRuleStatus(
  supabase: Db,
  projectId: string,
  ruleId: string,
  status: "ACTIVE" | "DISABLED"
): Promise<WriteResult> {
  const { error } = await supabase
    .from("extraction_memory")
    .update({ status })
    .eq("id", ruleId)
    .eq("project_id", projectId)
    .neq("kind", "LAYER_OVERRIDE");
  return { error: error?.message ?? null };
}

/** Permanently delete a project-learned rule. */
export async function deleteRule(
  supabase: Db,
  projectId: string,
  ruleId: string
): Promise<WriteResult> {
  const { error } = await supabase
    .from("extraction_memory")
    .delete()
    .eq("id", ruleId)
    .eq("project_id", projectId)
    .neq("kind", "LAYER_OVERRIDE");
  return { error: error?.message ?? null };
}

/**
 * Disable an inherited genre-baseline rule for this project by writing a
 * DISABLED LAYER_OVERRIDE row keyed by the genre rule key. Idempotent.
 */
export async function overrideGenreRule(
  supabase: Db,
  projectId: string,
  ruleKey: string,
  ruleText: string
): Promise<WriteResult> {
  const { error } = await supabase
    .from("extraction_memory")
    .upsert(
      {
        project_id: projectId,
        kind: "LAYER_OVERRIDE",
        rule_key: ruleKey,
        rule_text: ruleText,
        source: "MANUAL",
        status: "DISABLED",
      },
      { onConflict: "project_id,kind,rule_key", ignoreDuplicates: true }
    );
  return { error: error?.message ?? null };
}

/** Re-enable an inherited genre rule by removing its override row. */
export async function clearGenreOverride(
  supabase: Db,
  projectId: string,
  ruleKey: string
): Promise<WriteResult> {
  const { error } = await supabase
    .from("extraction_memory")
    .delete()
    .eq("project_id", projectId)
    .eq("kind", "LAYER_OVERRIDE")
    .eq("rule_key", ruleKey);
  return { error: error?.message ?? null };
}

/**
 * Remove a single name from projects.excluded_terms ("제외 해제"). Closes the
 * pre-existing gap where a mistaken dismiss permanently excluded a name with
 * no way to undo it.
 */
export async function removeExcludedTerm(
  supabase: Db,
  projectId: string,
  name: string
): Promise<WriteResult> {
  const { data: project, error: readError } = await supabase
    .from("projects")
    .select("excluded_terms")
    .eq("id", projectId)
    .single();

  if (readError) return { error: readError.message };

  const current = Array.isArray(project?.excluded_terms)
    ? (project.excluded_terms as string[])
    : [];
  const next = current.filter((term) => term !== name);

  if (next.length === current.length) return { error: null };

  const { error: updateError } = await supabase
    .from("projects")
    .update({ excluded_terms: next })
    .eq("id", projectId);

  return { error: updateError?.message ?? null };
}
