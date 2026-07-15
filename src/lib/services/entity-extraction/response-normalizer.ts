import type { ExtractedEntity, ExtractedFact, ExtractedRelation } from "../prompt-templates";
import { repairJSONQuotes } from "./response-parser";
import { FACT_TYPES, shouldKeepFactCandidate } from "./fact-policy";
import { stripCodeFences } from "../llm-json";

export interface NormalizedExtractionResponse {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

export function parseExtractionResponse(
  raw: string
): NormalizedExtractionResponse | null {
  const cleaned = stripCodeFences(raw);

  try {
    return normalizeExtractionResponse(JSON.parse(cleaned));
  } catch {
    try {
      const parsed = JSON.parse(repairJSONQuotes(cleaned));
      console.log("[EntityExtraction] JSON repaired successfully");
      return normalizeExtractionResponse(parsed);
    } catch {
      return null;
    }
  }
}

export function normalizeExtractionResponse(
  parsed: Record<string, unknown>
): NormalizedExtractionResponse {
  const rawEntities = Array.isArray(parsed?.entities) ? parsed.entities : [];
  const entities: ExtractedEntity[] = rawEntities
    .filter(
      (entity: Record<string, unknown>) =>
        entity && typeof entity.name === "string" && entity.name
    )
    .map((entity: Record<string, unknown>) => ({
      ...entity,
      aliases: Array.isArray(entity.aliases)
        ? (entity.aliases as unknown[]).filter(
            (alias): alias is string => typeof alias === "string"
          )
        : [],
      facts: normalizeFacts(entity.facts),
    })) as ExtractedEntity[];

  const relations = Array.isArray(parsed?.relations) ? parsed.relations : [];
  return { entities, relations: relations as ExtractedRelation[] };
}

function normalizeFacts(raw: unknown): ExtractedFact[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((fact): ExtractedFact[] => {
    if (!fact || typeof fact !== "object") return [];
    const row = fact as Record<string, unknown>;
    const factType = row.fact_type;
    const value = row.value;
    const evidence = row.evidence ?? row.evidence_text;

    if (
      typeof factType !== "string" ||
      !FACT_TYPES.has(factType) ||
      typeof value !== "string" ||
      !value.trim() ||
      typeof evidence !== "string" ||
      !evidence.trim()
    ) {
      return [];
    }
    if (!shouldKeepFactCandidate({
      fact_type: factType as ExtractedFact["fact_type"],
      value,
    })) {
      return [];
    }

    const normalized: ExtractedFact = {
      fact_type: factType as ExtractedFact["fact_type"],
      value: value.trim(),
      evidence: evidence.trim(),
    };

    if (typeof row.fact_key === "string" && row.fact_key.trim()) {
      normalized.fact_key = row.fact_key.trim();
    }
    if (typeof row.confidence === "number") {
      normalized.confidence = Math.max(0, Math.min(1, row.confidence));
    }

    return [normalized];
  });
}
