import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  disabledGenreKeysFromRows,
  loadGenreConventions,
  loadProjectExcludedNames,
  loadProjectMemoryRows,
} from "./read.service";
import { genreConventionsToRules } from "./read.service";

type Db = SupabaseClient<Database>;

export interface MemoryPanelRule {
  // extraction_memory row id, or null for an un-overridden genre baseline rule.
  id: string | null;
  key: string;
  text: string;
  kind: "EXCLUDE_PATTERN" | "TYPE_CONVENTION";
  layer: "project" | "genre";
  source: "DISTILLED" | "MANUAL" | "CURATED";
  status: "ACTIVE" | "DISABLED";
}

export interface MemoryPanel {
  // Author-learned rules from extraction_memory (excludes LAYER_OVERRIDE rows).
  projectRules: MemoryPanelRule[];
  // Genre baseline rules; status DISABLED when overridden for this project.
  genreRules: MemoryPanelRule[];
  // Distilled proposals awaiting author activation (DISABLED + source DISTILLED).
  proposals: MemoryPanelRule[];
  // Exact-name exclusions (projects.excluded_terms) with "제외 해제" affordance.
  excludedNames: string[];
}

/** Assemble the 작품 학습 메모리 panel view model. */
export async function loadExtractionMemoryPanel(
  supabase: Db,
  projectId: string
): Promise<MemoryPanel> {
  const [rows, excludedNames, genreConv] = await Promise.all([
    loadProjectMemoryRows(supabase, projectId),
    loadProjectExcludedNames(supabase, projectId),
    loadGenreConventions(supabase, projectId),
  ]);

  const disabledGenreKeys = disabledGenreKeysFromRows(rows);

  const projectRules: MemoryPanelRule[] = [];
  const proposals: MemoryPanelRule[] = [];
  for (const row of rows) {
    if (row.kind !== "EXCLUDE_PATTERN" && row.kind !== "TYPE_CONVENTION") {
      continue;
    }
    const rule: MemoryPanelRule = {
      id: row.id,
      key: row.rule_key,
      text: row.rule_text,
      kind: row.kind,
      layer: "project",
      source: row.source === "MANUAL" ? "MANUAL" : "DISTILLED",
      status: row.status === "ACTIVE" ? "ACTIVE" : "DISABLED",
    };
    if (rule.source === "DISTILLED" && rule.status === "DISABLED") {
      proposals.push(rule);
    } else {
      projectRules.push(rule);
    }
  }

  const genreRules: MemoryPanelRule[] = genreConventionsToRules(genreConv).map(
    (rule) => ({
      id: null,
      key: rule.key,
      text: rule.text,
      kind: rule.kind,
      layer: "genre",
      source: "CURATED",
      status: disabledGenreKeys.has(rule.key) ? "DISABLED" : "ACTIVE",
    })
  );

  return { projectRules, genreRules, proposals, excludedNames };
}

export interface ExtractionMetrics {
  confirmed: number;
  dismissed: number;
  // Share of reviewed entity candidates the author accepted (0–100), or null
  // when nothing has been reviewed yet.
  acceptanceRate: number | null;
}

/**
 * Lightweight acceptance metrics from entity_suggestions status counts. No new
 * logging infrastructure — derived from the rows that already exist.
 */
export async function loadExtractionMetrics(
  supabase: Db,
  projectId: string
): Promise<ExtractionMetrics> {
  const countByStatus = async (status: "CONFIRMED" | "DISMISSED") => {
    const { count } = await supabase
      .from("entity_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", status)
      .neq("type", "RELATION");
    return count ?? 0;
  };

  const [confirmed, dismissed] = await Promise.all([
    countByStatus("CONFIRMED"),
    countByStatus("DISMISSED"),
  ]);

  const reviewed = confirmed + dismissed;
  const acceptanceRate =
    reviewed === 0 ? null : Math.round((confirmed / reviewed) * 100);

  return { confirmed, dismissed, acceptanceRate };
}
