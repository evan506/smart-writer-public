import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  ExtractionMemory,
  GenreExtractionConventions,
  MemoryRule,
} from "./types";
import {
  DEFAULT_PROMPT_BLOCK_CHAR_CAP,
  renderPromptBlock,
  resolveLayeredRules,
  summarizeAppliedMemory,
} from "./resolve";

type Db = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Pure parsing / mapping (unit-testable without a DB)
// ---------------------------------------------------------------------------

/**
 * Extract the extraction_conventions block from a genre kit's `rules` JSONB.
 * `rules` is an array of mixed objects; the conventions live in the element
 * carrying an `extraction_conventions` key. Tolerant of missing/partial shape.
 */
export function parseGenreConventions(
  rules: unknown
): GenreExtractionConventions {
  const empty: GenreExtractionConventions = {
    excludePatterns: [],
    typeConventions: [],
  };
  if (!Array.isArray(rules)) return empty;

  for (const element of rules) {
    if (
      !element ||
      typeof element !== "object" ||
      !("extraction_conventions" in element)
    ) {
      continue;
    }
    const conv = (element as Record<string, unknown>).extraction_conventions;
    if (!conv || typeof conv !== "object") continue;
    const convObj = conv as Record<string, unknown>;
    return {
      excludePatterns: parseConventionRules(convObj.exclude_patterns),
      typeConventions: parseConventionRules(convObj.type_conventions),
    };
  }
  return empty;
}

function parseConventionRules(value: unknown): { key: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  const rules: { key: string; text: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const key = typeof obj.key === "string" ? obj.key : "";
    const text = typeof obj.text === "string" ? obj.text : "";
    if (key && text) rules.push({ key, text });
  }
  return rules;
}

export function genreConventionsToRules(
  conv: GenreExtractionConventions
): MemoryRule[] {
  return [
    ...conv.excludePatterns.map(
      (rule): MemoryRule => ({
        key: rule.key,
        text: rule.text,
        kind: "EXCLUDE_PATTERN",
        layer: "genre",
        source: "CURATED",
      })
    ),
    ...conv.typeConventions.map(
      (rule): MemoryRule => ({
        key: rule.key,
        text: rule.text,
        kind: "TYPE_CONVENTION",
        layer: "genre",
        source: "CURATED",
      })
    ),
  ];
}

type ExtractionMemoryRow =
  Database["public"]["Tables"]["extraction_memory"]["Row"];

export function projectRowsToRules(rows: ExtractionMemoryRow[]): MemoryRule[] {
  const rules: MemoryRule[] = [];
  for (const row of rows) {
    if (row.status !== "ACTIVE") continue;
    if (row.kind !== "EXCLUDE_PATTERN" && row.kind !== "TYPE_CONVENTION") {
      continue;
    }
    rules.push({
      key: row.rule_key,
      text: row.rule_text,
      kind: row.kind,
      layer: "project",
      source: row.source === "MANUAL" ? "MANUAL" : "DISTILLED",
    });
  }
  return rules;
}

export function disabledGenreKeysFromRows(
  rows: ExtractionMemoryRow[]
): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.kind === "LAYER_OVERRIDE" && row.status === "DISABLED") {
      keys.add(row.rule_key);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// DB loaders
// ---------------------------------------------------------------------------

export async function loadProjectMemoryRows(
  supabase: Db,
  projectId: string
): Promise<ExtractionMemoryRow[]> {
  const { data } = await supabase
    .from("extraction_memory")
    .select("*")
    .eq("project_id", projectId);
  return data ?? [];
}

export async function loadProjectExcludedNames(
  supabase: Db,
  projectId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("projects")
    .select("excluded_terms")
    .eq("id", projectId)
    .single();

  return Array.isArray(data?.excluded_terms)
    ? (data.excluded_terms as string[])
    : [];
}

export async function loadGenreConventions(
  supabase: Db,
  projectId: string
): Promise<GenreExtractionConventions> {
  const { data: project } = await supabase
    .from("projects")
    .select("genre")
    .eq("id", projectId)
    .single();

  if (!project?.genre) {
    return { excludePatterns: [], typeConventions: [] };
  }

  const { data: kits } = await supabase
    .from("genre_kits")
    .select("rules, user_id")
    .eq("genre_type", project.genre)
    .order("user_id", { ascending: false, nullsFirst: false })
    .limit(1);

  return parseGenreConventions(kits?.[0]?.rules);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function assembleExtractionMemory(
  supabase: Db,
  projectId: string,
  charCap: number = DEFAULT_PROMPT_BLOCK_CHAR_CAP
): Promise<ExtractionMemory> {
  const [memoryRows, excludeNames, genreConv] = await Promise.all([
    loadProjectMemoryRows(supabase, projectId),
    loadProjectExcludedNames(supabase, projectId),
    loadGenreConventions(supabase, projectId),
  ]);

  const projectRules = projectRowsToRules(memoryRows);
  const disabledGenreKeys = disabledGenreKeysFromRows(memoryRows);
  const genreRules = genreConventionsToRules(genreConv);

  const rules = resolveLayeredRules(
    { project: projectRules, genre: genreRules },
    disabledGenreKeys
  );

  const { text: promptBlock, truncated } = renderPromptBlock(
    rules,
    excludeNames,
    charCap
  );

  return {
    excludeNames,
    rules,
    promptBlock,
    appliedSummary: summarizeAppliedMemory(rules, excludeNames, truncated),
  };
}
