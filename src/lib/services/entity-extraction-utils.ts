export {
  filterEntityCandidates,
  isSpeciesLikeName,
  isStandaloneGenericRoleCandidate,
  normalizeEntityName,
  normalizeGroupLikeCharacterCandidates,
  normalizedNameSet,
  normalizeSpeciesLikeCharacterCandidates,
  shouldTreatAsGenericSpecies,
  shouldTreatAsGroupLikeConcept,
} from "./entity-extraction/candidate-policy";
export {
  attachFallbackContextSnippets,
  extractCoOccurrenceSnippets,
  extractContextSnippets,
} from "./entity-extraction/snippet-policy";
export type {
  CoOccurrenceEntity,
  CoOccurrenceSnippet,
  EntityWithContextSnippet,
} from "./entity-extraction/snippet-policy";
export {
  mergeEntities,
  mergeRelations,
  resolveRelationConflicts,
} from "./entity-extraction/merge-helpers";
