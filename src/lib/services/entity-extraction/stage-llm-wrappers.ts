
import { LLMBudgetError } from "../llm-budget.service";
import { getLLMModel, getLLMProviderRouting, type LLMProviderRouting } from "../llm-models";
import {
  callLLM,
  isPermanentProviderError,
  type LLMUsageCallback,
} from "../llm.service";
import { mapWithConcurrency } from "./concurrency";
import { buildClassificationBatchContext, buildProductClassificationBatchContext } from "./classification-context";
import { STAGE2_EVAL_PROFILE, STAGE2_EVAL_RESPONSE_FORMAT, STAGE2_COMPACT_EVAL_PROFILE, buildStage2CompactEvalPrompt, buildStage2EvalPrompt, type Stage2EvalProfile } from "./stage2-eval-contract";

// Bounded fan-out for Stage 2 classification batches.
const STAGE2_CONCURRENCY = 4;
import {
  buildStage1NounExtractionPrompt,
  buildStage2ClassificationPrompt,
  buildStage3MinimalRelationPrompt,
  buildStage3RelationExtractionPrompt,
  type ClassifiedEntity,
  type ExtractedRelation,
  type KnownEntity,
} from "../prompt-templates";
import {
  attachFallbackContextSnippets,
  extractCoOccurrenceSnippets,
  sourceContainsEvidenceSnippet,
} from "./snippet-policy";
import { extractJSONArray } from "./response-parser";
import { ExtractionStageError } from "./stage-error";
import { formatKnownEntitiesForPrompt } from "../prompt-templates/prompt-guards";

type LLMParams = {
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  temperature: number;
  onComplete?: LLMUsageCallback;
  beforeRequest?: () => Promise<void>;
  cacheSystemPrompt?: boolean;
};

type StageLLMOptions = {
  onComplete?: LLMUsageCallback;
  beforeRequest?: () => Promise<void>;
};

// Explicit per-call controls for bounded evaluations. Product callers keep
// callLLM's retry/routing defaults unless they opt in.
export type ExtractionValidationDiagnostic = {
  stage: "stage1" | "stage2";
  batch: number;
  candidates: string[];
  outcome: "valid" | "array_parse" | "shape";
  fieldPath?: string;
};

type ExtractionEvalOptions = {
  stage2EvalProfile?: Stage2EvalProfile;
  stage2EvalBatchSize?: 5;
  captureResponseDiagnostics?: boolean;
  onValidation?: (diagnostic: ExtractionValidationDiagnostic) => void | Promise<void>;
  /** A factory supplies immutable batch context even when requests finish out of order. */
  onBatchComplete?: (batch: number, candidates: string[]) => LLMUsageCallback;
  maxRetries?: number;
  providerRouting?: LLMProviderRouting;
};

function evalRequestOptions(options: ExtractionEvalOptions) {
  return {
    ...(options.captureResponseDiagnostics ? { captureResponseDiagnostics: true } : {}),
    ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
    ...(options.providerRouting !== undefined ? { provider: options.providerRouting } : {}),
  };
}

export async function stage1ExtractNouns(
  chunkText: string,
  excludeNames: string[],
  options: StageLLMOptions & ExtractionEvalOptions & { guidanceBlock?: string } = {}
): Promise<string[]> {
  const { system, user } = buildStage1NounExtractionPrompt(
    chunkText,
    excludeNames,
    options.guidanceBlock ?? ""
  );

  try {
    const raw = await callLLM({
      system,
      user,
      maxTokens: 512,
      model: getLLMModel("extraction"),
      temperature: 0.1,
      onComplete: options.onComplete,
      beforeRequest: options.beforeRequest,
      // Identical system prompt across every chunk of a save burst.
      cacheSystemPrompt: true,
      ...evalRequestOptions(options),
    });

    const parsed = extractJSONArray(raw);
    await options.onValidation?.({ stage: "stage1", batch: 1, candidates: [],
      outcome: !parsed ? "array_parse" : parsed.every(isNonEmptyString) ? "valid" : "shape",
      ... (parsed && !parsed.every(isNonEmptyString) ? { fieldPath: `[${parsed.findIndex((v) => !isNonEmptyString(v))}]` } : {}),
    });
    if (!parsed || !parsed.every(isNonEmptyString)) {
      throw new ExtractionStageError("stage1", "invalid response");
    }
    return parsed;
  } catch (error) {
    throwStageError("stage1", error);
  }
}

export async function stage2Classify(
  candidates: string[],
  fullText: string,
  confirmedEntities: KnownEntity[],
  options: StageLLMOptions & ExtractionEvalOptions & {
    guidanceBlock?: string;
    stage2Concurrency?: number;
  } = {}
): Promise<ClassifiedEntity[]> {
  if (options.stage2EvalProfile !== undefined && options.stage2EvalProfile !== STAGE2_EVAL_PROFILE &&
      options.stage2EvalProfile !== STAGE2_COMPACT_EVAL_PROFILE) {
    throw new Error("Unsupported Stage2 evaluation profile");
  }
  const buildContext = options.stage2EvalProfile === undefined
    ? buildProductClassificationBatchContext : buildClassificationBatchContext;
  const guidanceBlock = options.guidanceBlock ?? "";
  const confirmedList = formatKnownEntitiesForPrompt(confirmedEntities);

  // 10개 초과면 분할한다. 실제 장편 원고에서는 후보 15~20개 응답도
  // 길어져 JSON이 깨질 수 있어 작은 배치가 더 안정적이다.
  if (options.stage2EvalBatchSize !== undefined &&
      (options.stage2EvalProfile !== STAGE2_EVAL_PROFILE || options.stage2EvalBatchSize !== 5)) {
    throw new Error("Stage2 batch size requires the explicit evaluation profile and size 5");
  }
  const BATCH_SIZE = options.stage2EvalBatchSize ?? 10;
  const allResults: ClassifiedEntity[] = [];

  if (candidates.length <= BATCH_SIZE) {
    const { payload, snippetMap } = buildContext(candidates, fullText);
    const result = await callStage2LLM(
      payload,
      confirmedList,
      options.onComplete,
      guidanceBlock,
      options.beforeRequest,
      options,
      1,
      candidates
    );
    allResults.push(...attachValidatedContextSnippets(result, snippetMap, fullText));
  } else {
    // Batches are independent (fixed confirmed-entity context), so classify
    // them with bounded concurrency; results are appended in batch order.
    const batches: string[][] = [];
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      batches.push(candidates.slice(i, i + BATCH_SIZE));
    }
    const batchResults = await mapWithConcurrency(
      batches,
      options.stage2Concurrency ?? STAGE2_CONCURRENCY,
      async (batch, batchIndex) => {
        const { payload, snippetMap } = buildContext(batch, fullText);
        const result = await callStage2LLM(
          payload,
          confirmedList,
          options.onComplete,
          guidanceBlock,
          options.beforeRequest,
          options,
          batchIndex + 1,
          batch
        );
        return attachValidatedContextSnippets(result, snippetMap, fullText);
      }
    );
    for (const result of batchResults) {
      allResults.push(...result);
    }
  }

  return allResults;
}

function attachContextSnippets(
  classified: ClassifiedEntity[],
  snippetMap: Map<string, string>
): ClassifiedEntity[] {
  return attachFallbackContextSnippets(classified, snippetMap);
}

function attachValidatedContextSnippets(
  classified: ClassifiedEntity[],
  snippetMap: Map<string, string>,
  sourceText: string
): ClassifiedEntity[] {
  return attachContextSnippets(classified, snippetMap).flatMap((entity) => {
    if (sourceContainsEvidenceSnippet(sourceText, entity.context_snippet)) {
      return [entity];
    }

    const fallback = snippetMap.get(entity.name);
    if (sourceContainsEvidenceSnippet(sourceText, fallback)) {
      return [{ ...entity, context_snippet: fallback }];
    }

    return [];
  });
}

async function callStage2LLM(
  candidatesWithSnippets: string,
  confirmedEntities: string,
  onComplete?: LLMUsageCallback,
  guidanceBlock = "",
  beforeRequest?: () => Promise<void>,
  evalOptions: ExtractionEvalOptions = {},
  batch = 1,
  candidates: string[] = []
): Promise<ClassifiedEntity[]> {
  const structuredEval = evalOptions.stage2EvalProfile === STAGE2_EVAL_PROFILE;
  const buildPrompt = structuredEval ? buildStage2EvalPrompt :
    evalOptions.stage2EvalProfile === STAGE2_COMPACT_EVAL_PROFILE ? buildStage2CompactEvalPrompt : buildStage2ClassificationPrompt;
  const { system, user } = buildPrompt(
    candidatesWithSnippets,
    confirmedEntities,
    guidanceBlock
  );

  try {
    const raw = await callLLM({
      system,
      user,
      maxTokens: 2048,
      model: getLLMModel("extraction"),
      temperature: 0.1,
      onComplete: evalOptions.onBatchComplete?.(batch, [...candidates]) ?? onComplete,
      beforeRequest,
      // Identical system prompt (incl. guidance block) across stage-2 batches.
      cacheSystemPrompt: true,
      ...evalRequestOptions(evalOptions),
      ...(structuredEval ? {
        responseFormat: STAGE2_EVAL_RESPONSE_FORMAT,
        provider: { ...(evalOptions.providerRouting ?? getLLMProviderRouting()), require_parameters: true },
      } : {}),
    });

    const envelope: { array: unknown[] | null; fieldPath?: string } = structuredEval ? parseStage2EvalEnvelope(raw) : { array: extractJSONArray(raw) };
    const parsed = envelope.array;
    const invalidIndex = parsed?.findIndex((value) => classifiedEntityIssue(value) !== undefined) ?? -1;
    await evalOptions.onValidation?.({ stage: "stage2", batch, candidates: [...candidates],
      outcome: envelope.fieldPath ? "shape" : !parsed ? "array_parse" : invalidIndex >= 0 ? "shape" : "valid",
      ...(envelope.fieldPath ? { fieldPath: envelope.fieldPath } :
        parsed && invalidIndex >= 0 ? { fieldPath: `[${invalidIndex}]${classifiedEntityIssue(parsed[invalidIndex])}` } : {}),
    });
    if (!parsed || !parsed.every(isClassifiedEntity)) {
      throw new ExtractionStageError("stage2", "invalid response");
    }
    return parsed;
  } catch (error) {
    throwStageError("stage2", error);
  }
}

export async function stage3ExtractRelations(
  confirmedEntities: KnownEntity[],
  chapterContent: string,
  existingRelations: string[],
  options: StageLLMOptions = {}
): Promise<ExtractedRelation[]> {
  if (confirmedEntities.length < 2) return [];

  const entityListWithTypes = confirmedEntities
    .map((e) => `- ${e.name} (${e.type})`)
    .join("\n");

  // 엔티티 쌍별 co-occurrence 스니펫 추출 (챕터 전문 대신)
  const coSnippets = extractCoOccurrenceSnippets(
    chapterContent,
    confirmedEntities
  );

  if (coSnippets.length === 0) {
    console.log("[EntityExtraction] stage3: no co-occurrence snippets found, skipping");
    return [];
  }

  const snippetText = coSnippets
    .map((s) => `[${s.nameA} & ${s.nameB}]: "${s.snippet.replace(/"/g, "'")}"`)
    .join("\n");

  console.log(`[EntityExtraction] stage3: ${coSnippets.length} co-occurrence snippets (${snippetText.length} chars)`);

  const { system, user } = buildStage3RelationExtractionPrompt(
    entityListWithTypes,
    snippetText,
    existingRelations
  );

  const llmParams = {
    system,
    user,
    maxTokens: 2048,
    model: getLLMModel("extraction"),
    temperature: 0.1,
    onComplete: options.onComplete,
    beforeRequest: options.beforeRequest,
    cacheSystemPrompt: true,
  };

  try {
    const result = await callAndParseRelations(llmParams);
    return filterSourceBackedRelations(result, chapterContent);
  } catch (error) {
    // Preserve the existing single minimal-prompt retry. Budget and permanent
    // provider failures must propagate unchanged and never trigger a retry.
    if (!(error instanceof ExtractionStageError)) throw error;
  }

  console.warn("[EntityExtraction] stage3 failed, retrying with minimal prompt...");
  const { system: minSys, user: minUser } = buildStage3MinimalRelationPrompt(
    entityListWithTypes,
    snippetText
  );
  const result = await callAndParseRelations({ ...llmParams, system: minSys, user: minUser });
  return filterSourceBackedRelations(result, chapterContent);
}

async function callAndParseRelations(params: LLMParams): Promise<ExtractedRelation[]> {
  try {
    const raw = await callLLM(params);
    const parsed = extractJSONArray(raw);
    if (!parsed || !parsed.every(isExtractedRelation)) {
      throw new ExtractionStageError("stage3", "invalid response");
    }
    return parsed;
  } catch (error) {
    throwStageError("stage3", error);
  }
}

function throwStageError(stage: ExtractionStageError["stage"], error: unknown): never {
  if (
    error instanceof LLMBudgetError ||
    isPermanentProviderError(error) ||
    error instanceof ExtractionStageError
  ) throw error;
  throw new ExtractionStageError(stage, "request failed", error);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Strict envelope only for the explicit evaluation profile; legacy repair stays unchanged. */
function parseStage2EvalEnvelope(raw: string): { array: unknown[] | null; fieldPath?: string } {
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return { array: null }; }
  if (!isRecord(decoded) || !Array.isArray(decoded.entities)) {
    return { array: null, fieldPath: ".entities" };
  }
  if (Object.keys(decoded).length !== 1) return { array: null, fieldPath: ".root" };
  const itemSchema = STAGE2_EVAL_RESPONSE_FORMAT.json_schema.schema.properties.entities.items;
  const entityKeys = new Set(Object.keys(itemSchema.properties));
  const factKeys = new Set(Object.keys(itemSchema.properties.facts.items.properties));
  for (let i = 0; i < decoded.entities.length; i++) {
    const entity: unknown = decoded.entities[i];
    if (!isRecord(entity)) continue; // Existing row validation reports its shape.
    const extra = Object.keys(entity).find((key) => !entityKeys.has(key));
    if (extra) return { array: null, fieldPath: `[${i}].${extra}` };
    if (!Array.isArray(entity.facts)) continue;
    for (let j = 0; j < entity.facts.length; j++) {
      const fact: unknown = entity.facts[j];
      if (!isRecord(fact)) continue;
      const factExtra = Object.keys(fact).find((key) => !factKeys.has(key));
      if (factExtra) return { array: null, fieldPath: `[${i}].facts[${j}].${factExtra}` };
    }
  }
  return { array: decoded.entities };
}

function classifiedEntityIssue(value: unknown): string | undefined {
  if (!isRecord(value)) return "";
  for (const key of ["name", "type"] as const) if (!isNonEmptyString(value[key])) return `.${key}`;
  if (value.importance !== "high" && value.importance !== "low") return ".importance";
  if (typeof value.summary !== "string") return ".summary";
  if (!isConfidence(value.confidence)) return ".confidence";
  for (const key of ["sub_type", "alias_of", "context_snippet"] as const) {
    if (!isOptionalString(value[key])) return `.${key}`;
  }
  if (value.facts !== undefined) {
    if (!Array.isArray(value.facts)) return ".facts";
    for (let i = 0; i < value.facts.length; i++) {
      const fact = value.facts[i];
      if (!isRecord(fact)) return `.facts[${i}]`;
      for (const key of ["fact_type", "value", "evidence"] as const) {
        if (typeof fact[key] !== "string") return `.facts[${i}].${key}`;
      }
      if (!isOptionalString(fact.fact_key)) return `.facts[${i}].fact_key`;
      if (fact.confidence !== undefined && !isConfidence(fact.confidence)) return `.facts[${i}].confidence`;
    }
  }
  return undefined;
}

function isClassifiedEntity(value: unknown): value is ClassifiedEntity {
  return classifiedEntityIssue(value) === undefined;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isExtractedRelation(value: unknown): value is ExtractedRelation {
  return isRecord(value) &&
    isNonEmptyString(value.from_name) &&
    isNonEmptyString(value.to_name) &&
    isNonEmptyString(value.relation_type) &&
    (value.direction === "UNI" || value.direction === "BI") &&
    isConfidence(value.weight) &&
    typeof value.context_snippet === "string" &&
    isOptionalString(value.conflict_note);
}

function filterSourceBackedRelations(
  relations: ExtractedRelation[],
  sourceText: string
): ExtractedRelation[] {
  return relations.filter((relation) =>
    sourceContainsEvidenceSnippet(sourceText, relation.context_snippet)
  );
}
