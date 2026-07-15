import {
  getConfirmableSuggestionIdsByName,
  getConfirmableSuggestions,
  getSkippedMergeCount,
} from "@/lib/services/suggestion-review-utils";

export type EntityBatchSuggestion = {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: unknown;
  suggested_action?: string | null;
};

export type ExistingEntityRow = {
  id: string;
  name: string;
  summary: string | null;
  aliases: unknown;
};

export type RelationBatchSuggestion = {
  id: string;
  aliases: unknown;
};

export type RelationEndpoint = {
  id: string;
  name: string;
};

export type SuggestionBatchCandidate = {
  type: string;
};

export type MergeTargetSuggestion = {
  suggested_action?: string | null;
  matched_entity_id?: string | null;
};

export function normalizeAlias(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function mergeAliasValues(existing: unknown, incoming: string[]) {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const value of [
    ...(Array.isArray(existing) ? (existing as string[]) : []),
    ...incoming,
  ]) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = normalizeAlias(trimmed);
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(trimmed);
  }

  return merged;
}

export function buildEntityBatchConfirmationPlan(
  suggestions: EntityBatchSuggestion[],
  existingRows: ExistingEntityRow[],
  projectId: string
) {
  const confirmableSuggestions = getConfirmableSuggestions(suggestions);
  const skippedMerge = getSkippedMergeCount(suggestions);
  const existingByName = new Map(existingRows.map((row) => [row.name, row]));
  const statusGroups = new Map<string, string[]>();

  const existingUpdates = confirmableSuggestions
    .filter((suggestion) => existingByName.has(suggestion.name))
    .map((suggestion) => {
      const existing = existingByName.get(suggestion.name)!;
      const aliases = Array.isArray(suggestion.aliases) ? (suggestion.aliases as string[]) : [];
      const mergedSummary =
        suggestion.summary && (!existing.summary || suggestion.summary.length > existing.summary.length)
          ? suggestion.summary
          : existing.summary;

      const ids = statusGroups.get(existing.id) ?? [];
      ids.push(suggestion.id);
      statusGroups.set(existing.id, ids);

      return {
        entityId: existing.id,
        values: {
          summary: mergedSummary,
          aliases: mergeAliasValues(existing.aliases, aliases),
        },
      };
    });

  const newByName = new Map<string, EntityBatchSuggestion>();
  for (const suggestion of confirmableSuggestions) {
    if (!existingByName.has(suggestion.name) && !newByName.has(suggestion.name)) {
      newByName.set(suggestion.name, suggestion);
    }
  }

  const newRows = Array.from(newByName.values()).map((suggestion) => ({
    project_id: projectId,
    name: suggestion.name,
    type: suggestion.type,
    summary: suggestion.summary,
    aliases: Array.isArray(suggestion.aliases) ? suggestion.aliases : [],
    metadata: { importance: "MINOR" },
  }));

  return {
    confirmableSuggestions,
    confirmed: confirmableSuggestions.length,
    skippedMerge,
    existingUpdates,
    newRows,
    statusGroups,
  };
}

export function getInsertedEntitySuggestionIds(
  suggestions: EntityBatchSuggestion[],
  entityName: string
) {
  return getConfirmableSuggestionIdsByName(suggestions, entityName);
}

export function buildRelationBatchConfirmationPlan(
  suggestions: RelationBatchSuggestion[],
  entities: RelationEndpoint[]
) {
  const nameToId = new Map(entities.map((entity) => [entity.name, entity.id]));
  const linkInserts: {
    from_id: string;
    to_id: string;
    relation_type: string;
    direction: string;
    weight: number;
  }[] = [];
  const confirmedIds: string[] = [];
  const dismissedIds: string[] = [];

  for (const suggestion of suggestions) {
    const meta = suggestion.aliases as {
      from_name?: string;
      to_name?: string;
      relation_type?: string;
      direction?: string;
      weight?: number;
    } | null;

    const fromId = meta?.from_name ? nameToId.get(meta.from_name) : null;
    const toId = meta?.to_name ? nameToId.get(meta.to_name) : null;
    if (!meta?.relation_type || !fromId || !toId) {
      dismissedIds.push(suggestion.id);
      continue;
    }

    linkInserts.push({
      from_id: fromId,
      to_id: toId,
      relation_type: meta.relation_type,
      direction: meta.direction === "BI" ? "BI" : "UNI",
      weight: meta.weight ?? 0.5,
    });
    confirmedIds.push(suggestion.id);
  }

  return { linkInserts, confirmedIds, dismissedIds };
}

export function splitSuggestionsForBatchConfirmation<T extends SuggestionBatchCandidate>(
  suggestions: T[]
) {
  return {
    entitySuggestions: suggestions.filter((suggestion) => suggestion.type !== "RELATION"),
    relationSuggestions: suggestions.filter((suggestion) => suggestion.type === "RELATION"),
  };
}

export function getMergeTargetValidationError(
  suggestion: MergeTargetSuggestion
): string | null {
  if (suggestion.suggested_action !== "MERGE") return null;
  if (suggestion.matched_entity_id) return null;
  return "별칭/호칭으로 저장할 기존 항목을 먼저 선택하세요.";
}

export function appendExcludedTerm(currentExcluded: unknown, suggestionName: string) {
  const current = Array.isArray(currentExcluded) ? (currentExcluded as string[]) : [];
  const alreadyExcluded = current.some(
    (term) => normalizeAlias(term) === normalizeAlias(suggestionName)
  );

  return alreadyExcluded ? current : [...current, suggestionName];
}
