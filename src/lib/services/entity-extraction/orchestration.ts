import type { EntitySuggestionInsert } from "@/types";
import type {
  ClassifiedEntity,
  ExtractedEntity,
  ExtractedRelation,
  KnownEntity,
} from "../prompt-templates";
import { normalizeEntityName, normalizedNameSet } from "../entity-extraction-utils";
import {
  buildEntityExtractionRunnerSets,
  normalizeClassifiedEntitiesForRunner,
  partitionEntityWriteCandidates,
} from "./runner";
import { buildEntitySuggestionInserts } from "./suggestion-builder";
import { mapWithConcurrency } from "./concurrency";

// Bounded fan-out for per-chunk Stage 1 LLM calls. Conservative to stay
// well inside provider rate limits while cutting wall-clock latency.
const STAGE1_CONCURRENCY = 4;

export interface EntityExtractionOrchestrationDeps {
  getKnownEntitiesData(projectId: string): Promise<{
    names: string[];
    typed: KnownEntity[];
  }>;
  getExistingSuggestionNames(projectId: string): Promise<string[]>;
  loadGenreRules(projectId: string): Promise<{
    rulesText: string;
    excludedCharacterTerms: string[];
  }>;
  loadExistingRelationStrings(projectId: string): Promise<string[]>;
  loadProjectExcludedTerms(projectId: string): Promise<string[]>;
  loadExtractionGuidance(projectId: string): Promise<string>;
  splitForExtraction(content: string): string[];
  stage1ExtractNouns(
    chunkText: string,
    excludeNames: string[],
    guidanceBlock: string
  ): Promise<string[]>;
  filterCandidates(
    candidates: string[],
    confirmedNames: Set<string>,
    excludedTerms: Set<string>,
    genreExcluded: Set<string>
  ): string[];
  stage2Classify(
    candidates: string[],
    fullText: string,
    confirmedEntities: KnownEntity[],
    guidanceBlock: string
  ): Promise<ClassifiedEntity[]>;
  upsertEntitySuggestions(inserts: EntitySuggestionInsert[]): Promise<number>;
  loadEntitySuggestionRefs(input: {
    projectId: string;
    chapterId: string;
    names: string[];
  }): Promise<
    Map<
      string,
      {
        id: string;
        matched_entity_id: string | null;
      }
    >
  >;
  insertFactSuggestions(input: {
    projectId: string;
    chapterId: string;
    entities: ExtractedEntity[];
    entitySuggestionRefs: Map<
      string,
      { id: string; matched_entity_id: string | null }
    >;
    knownEntities: KnownEntity[];
  }): Promise<number>;
  stage3ExtractRelations(
    confirmedEntities: KnownEntity[],
    chapterContent: string,
    existingRelations: string[]
  ): Promise<ExtractedRelation[]>;
  mergeRelations(relations: ExtractedRelation[]): ExtractedRelation[];
  resolveRelationConflicts(relations: ExtractedRelation[]): ExtractedRelation[];
  getKnownEntityCanonicalNames(projectId: string): Promise<Set<string>>;
  insertRelationSuggestions(
    projectId: string,
    chapterId: string,
    relations: ExtractedRelation[],
    validEntityNames: Set<string>,
    analysisEntities: KnownEntity[]
  ): Promise<number>;
}

export interface EntityExtractionOrchestrationInput {
  projectId: string;
  chapterId: string;
  content: string;
}

export interface EntityExtractionOrchestrationResult {
  suggestionCount: number;
  relationSuggestionCount: number;
  factSuggestionCount: number;
}

export async function runEntityExtractionOrchestration(
  input: EntityExtractionOrchestrationInput,
  deps: EntityExtractionOrchestrationDeps
): Promise<EntityExtractionOrchestrationResult> {
  const { projectId, chapterId, content } = input;

  const [
    knownEntitiesData,
    suggestionNames,
    genreRulesData,
    existingRelations,
    projectExcludedTerms,
    extractionGuidance,
  ] = await Promise.all([
    deps.getKnownEntitiesData(projectId),
    deps.getExistingSuggestionNames(projectId),
    deps.loadGenreRules(projectId),
    deps.loadExistingRelationStrings(projectId),
    deps.loadProjectExcludedTerms(projectId),
    deps.loadExtractionGuidance(projectId),
  ]);

  const {
    confirmedNamesSet,
    excludedTermsSet,
    genreExcludedSet,
    stage1ExcludeNames,
  } = buildEntityExtractionRunnerSets({
    knownEntitiesData,
    suggestionNames,
    genreRulesData,
    projectExcludedTerms,
  });

  const chunks = deps.splitForExtraction(content);
  if (chunks.length === 0) {
    return {
      suggestionCount: 0,
      relationSuggestionCount: 0,
      factSuggestionCount: 0,
    };
  }

  console.log(
    `[EntityExtraction] Stage 1: noun extraction from ${chunks.length} chunks`
  );

  // Chunks share a fixed exclude list, so Stage 1 calls are independent —
  // run them with bounded concurrency. Result order stays chunk order.
  const chunkNameLists = await mapWithConcurrency(
    chunks,
    STAGE1_CONCURRENCY,
    (chunk) =>
      deps.stage1ExtractNouns(chunk, stage1ExcludeNames, extractionGuidance)
  );
  const allCandidates = new Set<string>();
  for (const names of chunkNameLists) {
    names.forEach((name) => allCandidates.add(name));
  }

  console.log(
    `[EntityExtraction] Stage 1 result: ${allCandidates.size} unique candidates`
  );

  const filtered = deps.filterCandidates(
    [...allCandidates],
    confirmedNamesSet,
    excludedTermsSet,
    genreExcludedSet
  );

  console.log(
    `[EntityExtraction] After filtering: ${filtered.length} candidates (from ${allCandidates.size})`
  );

  let classifiedEntities: ExtractedEntity[] = [];
  if (filtered.length > 0) {
    const classified = await deps.stage2Classify(
      filtered,
      content,
      knownEntitiesData.typed,
      extractionGuidance
    );

    console.log(
      `[EntityExtraction] Stage 2 result: ${classified.length} classified entities`
    );

    classifiedEntities = normalizeClassifiedEntitiesForRunner(classified, content);
  }

  const { pendingCandidates } = partitionEntityWriteCandidates(classifiedEntities);

  let suggestionCount = 0;
  let entitySuggestionRefs = new Map<
    string,
    { id: string; matched_entity_id: string | null }
  >();
  const now = new Date().toISOString();
  if (pendingCandidates.length > 0) {
    const inserts = buildEntitySuggestionInserts(pendingCandidates, {
      projectId,
      chapterId,
      knownEntities: knownEntitiesData.typed,
      updatedAt: now,
    });

    if (inserts.length > 0) {
      suggestionCount = await deps.upsertEntitySuggestions(inserts);
      entitySuggestionRefs = await deps.loadEntitySuggestionRefs({
        projectId,
        chapterId,
        names: pendingCandidates.map((entity) => entity.name),
      });
    }
  }

  const factSuggestionCount = await deps.insertFactSuggestions({
    projectId,
    chapterId,
    entities: classifiedEntities,
    entitySuggestionRefs,
    knownEntities: knownEntitiesData.typed,
  });

  // Pending candidates are analysis references only: never give them canon IDs or
  // promote AI-proposed aliases. Saved identities/types retain precedence.
  const analysisEntities = [...knownEntitiesData.typed];
  const knownNames = normalizedNameSet(knownEntitiesData.names);
  for (const entity of classifiedEntities) {
    if (!knownNames.has(normalizeEntityName(entity.name))) {
      analysisEntities.push({ name: entity.name, type: entity.type });
      knownNames.add(normalizeEntityName(entity.name));
    }
  }
  const relations = await deps.stage3ExtractRelations(
    analysisEntities,
    content,
    existingRelations
  );

  console.log(`[EntityExtraction] Stage 3 result: ${relations.length} relations`);

  const mergedRelations = deps.resolveRelationConflicts(
    deps.mergeRelations(relations)
  );

  let relationSuggestionCount = 0;
  if (mergedRelations.length > 0) {
    const knownEntityNames = await deps.getKnownEntityCanonicalNames(projectId);
    const newEntityNames = new Set(classifiedEntities.map((entity) => entity.name));
    const validNames = normalizedNameSet([...knownEntityNames, ...newEntityNames]);

    relationSuggestionCount = await deps.insertRelationSuggestions(
      projectId,
      chapterId,
      mergedRelations,
      validNames,
      analysisEntities
    );
  }

  if (suggestionCount > 0 || relationSuggestionCount > 0 || factSuggestionCount > 0) {
    console.log(
      `[EntityExtraction] ${suggestionCount} entity + ${relationSuggestionCount} relation + ${factSuggestionCount} fact suggestions saved (3-stage pipeline)`
    );
  }

  return { suggestionCount, relationSuggestionCount, factSuggestionCount };
}
