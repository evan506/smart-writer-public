
import { getLLMModel } from "../llm-models";
import {
  callLLM,
  isPermanentProviderError,
  type LLMUsageCallback,
} from "../llm.service";
import { mapWithConcurrency } from "./concurrency";

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
  extractContextSnippets,
  sourceContainsEvidenceSnippet,
} from "./snippet-policy";
import { extractJSONArray } from "./response-parser";
import { formatKnownEntitiesForPrompt } from "../prompt-templates/prompt-guards";

type LLMParams = {
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  temperature: number;
  onComplete?: LLMUsageCallback;
  cacheSystemPrompt?: boolean;
};

type StageLLMOptions = {
  onComplete?: LLMUsageCallback;
};

export async function stage1ExtractNouns(
  chunkText: string,
  excludeNames: string[],
  options: StageLLMOptions & { guidanceBlock?: string } = {}
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
      // Identical system prompt across every chunk of a save burst.
      cacheSystemPrompt: true,
    });

    const parsed = extractJSONArray(raw);
    if (parsed) {
      return parsed.filter((n): n is string => typeof n === "string" && n.length > 0);
    }
    // 정규식 폴백: 따옴표 안 문자열 추출
    const matches = raw.match(/"([^"]+)"/g);
    if (matches) {
      return matches.map((m) => m.replace(/"/g, "")).filter(Boolean);
    }
  } catch (e) {
    // Config errors (401/403/404 …) fail every chunk identically — escalate
    // so the analysis job is marked FAILED instead of "done with 0 results".
    if (isPermanentProviderError(e)) throw e;
    console.error("[EntityExtraction] stage1 noun extraction failed:", e instanceof Error ? e.message : e);
  }

  return [];
}

export async function stage2Classify(
  candidates: string[],
  fullText: string,
  confirmedEntities: KnownEntity[],
  options: StageLLMOptions & { guidanceBlock?: string } = {}
): Promise<ClassifiedEntity[]> {
  const guidanceBlock = options.guidanceBlock ?? "";
  // 문맥 스니펫 구성
  const snippetMap = new Map<string, string>();
  const candidatesWithSnippets = candidates
    .map((name) => {
      const snippets = extractContextSnippets(fullText, name);
      if (snippets[0]) snippetMap.set(name, snippets[0]);
      const snippetText = snippets.length > 0
        ? snippets.map((s) => `  "${s.replace(/"/g, "'")}"` ).join("\n")
        : "  (스니펫 없음)";
      return `- **${name}**\n${snippetText}`;
    })
    .join("\n\n");

  const confirmedList = formatKnownEntitiesForPrompt(confirmedEntities);

  // 10개 초과면 분할한다. 실제 장편 원고에서는 후보 15~20개 응답도
  // 길어져 JSON이 깨질 수 있어 작은 배치가 더 안정적이다.
  const BATCH_SIZE = 10;
  const allResults: ClassifiedEntity[] = [];

  if (candidates.length <= BATCH_SIZE) {
    const result = await callStage2LLM(
      candidatesWithSnippets,
      confirmedList,
      options.onComplete,
      guidanceBlock
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
      STAGE2_CONCURRENCY,
      async (batch) => {
        const batchSnippetMap = new Map<string, string>();
        const batchSnippets = batch
          .map((name) => {
            const snippets = extractContextSnippets(fullText, name);
            if (snippets[0]) batchSnippetMap.set(name, snippets[0]);
            const snippetText = snippets.length > 0
              ? snippets.map((s) => `  "${s.replace(/"/g, "'")}"` ).join("\n")
              : "  (스니펫 없음)";
            return `- **${name}**\n${snippetText}`;
          })
          .join("\n\n");
        const result = await callStage2LLM(
          batchSnippets,
          confirmedList,
          options.onComplete,
          guidanceBlock
        );
        return attachValidatedContextSnippets(result, batchSnippetMap, fullText);
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
  guidanceBlock = ""
): Promise<ClassifiedEntity[]> {
  const { system, user } = buildStage2ClassificationPrompt(
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
      onComplete,
      // Identical system prompt (incl. guidance block) across stage-2 batches.
      cacheSystemPrompt: true,
    });

    const parsed = extractJSONArray(raw);
    if (parsed) {
      return parsed.filter(
        (c: unknown): c is ClassifiedEntity => {
          const obj = c as Record<string, unknown>;
          return obj != null && typeof obj.name === "string" && typeof obj.type === "string";
        }
      );
    }
    console.warn("[EntityExtraction] stage2 parse failed");
  } catch (e) {
    if (isPermanentProviderError(e)) throw e;
    console.error("[EntityExtraction] stage2 classification failed:", e instanceof Error ? e.message : e);
  }

  return [];
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
    cacheSystemPrompt: true,
  };

  // 1차 시도
  let result = await callAndParseRelations(llmParams);
  if (result) return filterSourceBackedRelations(result, chapterContent);

  // 2차 시도: minimal 프롬프트로 재시도
  console.warn("[EntityExtraction] stage3 parse failed, retrying with minimal prompt...");
  const { system: minSys, user: minUser } = buildStage3MinimalRelationPrompt(
    entityListWithTypes,
    snippetText
  );
  result = await callAndParseRelations({ ...llmParams, system: minSys, user: minUser });
  if (result) {
    console.log("[EntityExtraction] stage3 recovered with minimal prompt");
    return filterSourceBackedRelations(result, chapterContent);
  }

  console.warn("[EntityExtraction] stage3 parse failed after minimal retry");
  return [];
}

async function callAndParseRelations(params: LLMParams): Promise<ExtractedRelation[] | null> {
  try {
    const raw = await callLLM(params);
    const parsed = extractJSONArray(raw);
    if (parsed) {
      return parsed.filter(
        (r: unknown): r is ExtractedRelation => {
          const obj = r as Record<string, unknown>;
          return (
            obj != null &&
            typeof obj.from_name === "string" &&
            typeof obj.to_name === "string" &&
            typeof obj.relation_type === "string" &&
            (obj.direction === "UNI" || obj.direction === "BI") &&
            typeof obj.weight === "number" &&
            typeof obj.context_snippet === "string"
          );
        }
      );
    }
  } catch (e) {
    if (isPermanentProviderError(e)) throw e;
    console.error("[EntityExtraction] stage3 LLM call failed:", e instanceof Error ? e.message : e);
  }
  return null;
}

function filterSourceBackedRelations(
  relations: ExtractedRelation[],
  sourceText: string
): ExtractedRelation[] {
  return relations.filter((relation) =>
    sourceContainsEvidenceSnippet(sourceText, relation.context_snippet)
  );
}
