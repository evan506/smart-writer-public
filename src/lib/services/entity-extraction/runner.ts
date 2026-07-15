import type {
  ClassifiedEntity,
  ExtractedEntity,
  KnownEntity,
} from "../prompt-templates";
import { normalizeEntityType } from "../prompt-templates";
import {
  normalizeGroupLikeCharacterCandidates,
  normalizeSpeciesLikeCharacterCandidates,
  normalizedNameSet,
} from "../entity-extraction-utils";
import { sourceContainsEvidenceSnippet } from "./snippet-policy";
import { linkSameBatchCharacterAliasRefs } from "./alias-policy";
import { FACT_TYPES, shouldKeepFactCandidate } from "./fact-policy";

export interface EntityExtractionRunnerInputs {
  knownEntitiesData: {
    names: string[];
    typed: KnownEntity[];
  };
  suggestionNames: string[];
  genreRulesData: {
    excludedCharacterTerms: string[];
  };
  projectExcludedTerms: string[];
}

export interface EntityExtractionRunnerSets {
  allExcludedTerms: string[];
  confirmedNamesSet: Set<string>;
  excludedTermsSet: Set<string>;
  genreExcludedSet: Set<string>;
  stage1ExcludeNames: string[];
}

export function buildEntityExtractionRunnerSets(
  inputs: EntityExtractionRunnerInputs
): EntityExtractionRunnerSets {
  const allExcludedTerms = [
    ...inputs.projectExcludedTerms,
    ...inputs.genreRulesData.excludedCharacterTerms,
  ];

  return {
    allExcludedTerms,
    confirmedNamesSet: normalizedNameSet(inputs.knownEntitiesData.names),
    excludedTermsSet: normalizedNameSet(allExcludedTerms),
    genreExcludedSet: normalizedNameSet(inputs.genreRulesData.excludedCharacterTerms),
    stage1ExcludeNames: [
      ...inputs.knownEntitiesData.names,
      ...inputs.suggestionNames,
      ...allExcludedTerms,
    ],
  };
}

export function normalizeClassifiedEntitiesForRunner(
  classified: ClassifiedEntity[],
  sourceText = ""
): ExtractedEntity[] {
  return normalizeGroupLikeCharacterCandidates(
    normalizeSpeciesLikeCharacterCandidates(
      linkSameBatchCharacterAliasRefs(
        classified
          .filter((candidate) => {
            if (candidate.sub_type === "alias_ref") {
              return Boolean(candidate.alias_of) && candidate.confidence >= 0.5;
            }
            if (candidate.importance === "low" && candidate.confidence < 0.6) {
              return false;
            }
            return Boolean(normalizeEntityType(candidate.type));
          })
          .map((candidate) => ({
            name: candidate.name,
            type: normalizeEntityType(candidate.type)!,
            sub_type: candidate.sub_type,
            alias_of: candidate.alias_of,
            summary: candidate.summary || "",
            aliases: [],
            confidence: candidate.confidence,
            context_snippet: candidate.context_snippet || "",
            facts: normalizeCandidateFacts(candidate, sourceText),
          }))
      )
    )
  );
}

function normalizeCandidateFacts(
  candidate: ClassifiedEntity,
  sourceText: string
): ExtractedEntity["facts"] {
  if (!Array.isArray(candidate.facts)) return [];

  return candidate.facts.flatMap((fact) => {
    if (!FACT_TYPES.has(fact.fact_type)) return [];
    if (!fact.value?.trim() || !fact.evidence?.trim()) return [];
    if (!shouldKeepFactCandidate({
      fact_type: fact.fact_type as NonNullable<ExtractedEntity["facts"]>[number]["fact_type"],
      value: fact.value,
    })) {
      return [];
    }
    if (sourceText && !sourceContainsEvidenceSnippet(sourceText, fact.evidence)) {
      return [];
    }

    return [
      {
        fact_type: fact.fact_type as NonNullable<ExtractedEntity["facts"]>[number]["fact_type"],
        fact_key: fact.fact_key?.trim() || undefined,
        value: fact.value.trim(),
        evidence: fact.evidence.trim(),
        confidence: fact.confidence,
      },
    ];
  });
}

export function partitionEntityWriteCandidates(
  classifiedEntities: ExtractedEntity[]
): {
  toAutoConfirm: ExtractedEntity[];
  toPending: ExtractedEntity[];
  aliasRefs: ExtractedEntity[];
  pendingCandidates: ExtractedEntity[];
} {
  const toAutoConfirm = classifiedEntities.filter(
    (entity) => entity.confidence >= 0.8 && entity.sub_type !== "alias_ref"
  );
  const toPending = classifiedEntities.filter((entity) => entity.confidence < 0.8);
  const aliasRefs = classifiedEntities.filter((entity) => entity.sub_type === "alias_ref");

  return {
    toAutoConfirm,
    toPending,
    aliasRefs,
    pendingCandidates: [
      ...toPending,
      ...aliasRefs.filter((aliasRef) => !toPending.includes(aliasRef)),
    ],
  };
}
