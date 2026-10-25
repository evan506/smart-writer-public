import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { EntitySuggestionInsert } from "@/types";
import { chunkChapter } from "./chunking.service";
import {
  type ExtractedRelation,
  type KnownEntity,
} from "./prompt-templates";
import {
  filterEntityCandidates,
  mergeRelations,
  normalizeEntityName,
  resolveRelationConflicts,
} from "./entity-extraction-utils";
import {
  stage1ExtractNouns,
  stage2Classify,
  stage3ExtractRelations,
} from "./entity-extraction/stage-llm-wrappers";
import {
  loadExistingRelationStrings,
  loadExistingSuggestionNames,
  loadEntitySuggestionRefs,
  loadGenreRules,
  loadKnownEntitiesData,
  loadKnownEntityCanonicalNames,
  loadProjectExcludedTerms,
  upsertEntitySuggestions,
} from "./entity-extraction/db-boundaries";
import { runEntityExtractionOrchestration } from "./entity-extraction/orchestration";
import { recalculateEntityImportance } from "./entity-extraction/importance";
import { insertRelationSuggestions } from "./entity-extraction/relation-writes";
import { insertFactSuggestions } from "./entity-extraction/fact-suggestion-writes";
import { createLLMBudgetGuard } from "./llm-budget.service";
import { createLLMUsageLogger } from "./llm-usage-logger.service";
import {
  getPromptTemplateVersion,
  type PromptTemplateKey,
} from "./prompt-versions";
import { assembleExtractionMemory } from "./extraction-memory/read.service";
import { renderPromptBlock } from "./extraction-memory/resolve";

export class EntityExtractionService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /** 이름 비교용 정규화: 공백 제거 + 소문자 */
  private static normalizeName(s: string): string {
    return normalizeEntityName(s);
  }

  async extractAndSuggest(
    projectId: string,
    chapterId: string,
    content: string
  ): Promise<{
    suggestionCount: number;
    relationSuggestionCount: number;
    factSuggestionCount: number;
  }> {
    const userId = await this.getProjectUserId(projectId);
    const beforeRequest = createLLMBudgetGuard(this.supabase, { projectId, userId });
    const createExtractionLogger = (promptTemplateKey: PromptTemplateKey) =>
      createLLMUsageLogger(this.supabase, {
        projectId,
        userId,
        feature: "entity_extraction",
        promptTemplateKey,
        promptTemplateVersion: getPromptTemplateVersion(promptTemplateKey),
      }, { failOnError: true });

    return runEntityExtractionOrchestration(
      { projectId, chapterId, content },
      {
        getKnownEntitiesData: (id) => this.getKnownEntitiesData(id),
        getExistingSuggestionNames: (id) => this.getExistingSuggestionNames(id),
        loadGenreRules: (id) => this.loadGenreRules(id),
        loadExistingRelationStrings: (id) =>
          this.loadExistingRelationStrings(id),
        loadProjectExcludedTerms: (id) => this.loadProjectExcludedTerms(id),
        loadExtractionGuidance: (id) => this.loadExtractionGuidance(id),
        splitForExtraction: (value) => this.splitForExtraction(value),
        stage1ExtractNouns: (chunkText, excludeNames, guidanceBlock) =>
          stage1ExtractNouns(chunkText, excludeNames, {
            onComplete: createExtractionLogger("entity_extraction.stage1_nouns"),
            guidanceBlock,
            beforeRequest,
          }),
        filterCandidates: (candidates, confirmedNames, excludedTerms, genreExcluded) =>
          this.filterCandidates(
            candidates,
            confirmedNames,
            excludedTerms,
            genreExcluded
          ),
        stage2Classify: (candidates, fullText, confirmedEntities, guidanceBlock) =>
          stage2Classify(candidates, fullText, confirmedEntities, {
            onComplete: createExtractionLogger("entity_extraction.stage2_classify"),
            guidanceBlock,
            beforeRequest,
          }),
        upsertEntitySuggestions: (inserts) =>
          this.upsertEntitySuggestions(inserts),
        loadEntitySuggestionRefs: (input) =>
          loadEntitySuggestionRefs(this.supabase, input),
        insertFactSuggestions: (input) =>
          insertFactSuggestions(this.supabase, input),
        stage3ExtractRelations: (confirmedEntities, chapterContent, relations) =>
          stage3ExtractRelations(
            confirmedEntities,
            chapterContent,
            relations,
            {
              onComplete: createExtractionLogger("entity_extraction.stage3_relations"),
              beforeRequest,
            }
          ),
        mergeRelations: (relations) => this.mergeRelations(relations),
        resolveRelationConflicts: (relations) =>
          this.resolveRelationConflicts(relations),
        getKnownEntityCanonicalNames: (id) =>
          this.getKnownEntityCanonicalNames(id),
        insertRelationSuggestions: (id, currentChapterId, relations, validNames, analysisEntities) =>
          this.insertRelationSuggestions(
            id,
            currentChapterId,
            relations,
            validNames,
            analysisEntities
          ),
      }
    );
  }

  private async getProjectUserId(projectId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .maybeSingle();
    return data?.user_id ?? null;
  }

  // 엔티티 추출용 청크 목표 크기 (chars)
  private static readonly EXTRACTION_TARGET_CHARS = 800;

  // ── 필터링 (코드 레벨, LLM 호출 없음) ──
  // confirmedNames/excludedTerms/genreExcluded는 이미 정규화된 Set
  private filterCandidates(
    candidates: string[],
    confirmedNames: Set<string>,
    excludedTerms: Set<string>,
    genreExcluded: Set<string>
  ): string[] {
    return filterEntityCandidates(candidates, confirmedNames, excludedTerms, genreExcluded);
  }

  /**
   * 엔티티 추출용 텍스트 분할:
   * 1) chunkChapter (씬 구분자 + 문단) 시도
   * 2) 1개 이하면 줄 단위 폴백 분할 (단일 \n 텍스트 대응)
   */
  private splitForExtraction(content: string): string[] {
    const TARGET = EntityExtractionService.EXTRACTION_TARGET_CHARS;

    // 1차: RAG 청크 시도
    const ragChunks = chunkChapter(content)
      .filter((c) => c.type !== "CHAPTER")
      .map((c) => c.content);

    if (ragChunks.length >= 2) {
      return ragChunks;
    }

    // 2차: 줄 단위 분할 → 병합 (단일 \n 포맷 대응)
    const lines = content
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return content.length > 0 ? [content] : [];
    }

    // 줄을 TARGET 크기로 병합
    const segments: string[] = [];
    let buffer = "";

    for (const line of lines) {
      if (buffer && buffer.length + line.length + 1 > TARGET) {
        segments.push(buffer);
        buffer = line;
      } else {
        buffer = buffer ? buffer + "\n" + line : line;
      }
    }
    if (buffer) segments.push(buffer);

    return segments;
  }

  /**
   * 동일 (from, to, type) 관계 병합 — 높은 weight 우선
   */
  private mergeRelations(relations: ExtractedRelation[]): ExtractedRelation[] {
    return mergeRelations(relations);
  }

  /**
   * 관계 충돌 감지 및 해결:
   * 1. ALLY + ENEMY 동시 존재 → 둘 다 conflict_note 표시 (항상 PENDING)
   * 2. SERVES/MENTOR_OF/LEADER_OF 양방향 역전 (A→B + B→A 같은 타입) → 둘 다 conflict_note
   * 3. 같은 엔티티 쌍에 여러 관계 타입 → 가장 높은 weight만 유지, 나머지 제거
   */
  private resolveRelationConflicts(relations: ExtractedRelation[]): ExtractedRelation[] {
    return resolveRelationConflicts(relations);
  }

  /**
   * Returns both: flat names+aliases for exclude set, and typed canonical entities for the prompt.
   */
  private async getKnownEntitiesData(projectId: string): Promise<{
    names: string[];
    typed: KnownEntity[];
  }> {
    return loadKnownEntitiesData(this.supabase, projectId);
  }

  private async loadGenreRules(projectId: string): Promise<{
    rulesText: string;
    excludedCharacterTerms: string[];
  }> {
    return loadGenreRules(this.supabase, projectId);
  }

  private async loadProjectExcludedTerms(projectId: string): Promise<string[]> {
    return loadProjectExcludedTerms(this.supabase, projectId);
  }

  /**
   * Soft guidance from layered extraction memory (genre baseline + active
   * project rules). Exact-name exclusions already flow through
   * loadProjectExcludedTerms, so guidance carries only pattern/type rules.
   */
  private async loadExtractionGuidance(projectId: string): Promise<string> {
    const memory = await assembleExtractionMemory(this.supabase, projectId);
    return renderPromptBlock(memory.rules, []).text;
  }

  private async loadExistingRelationStrings(projectId: string): Promise<string[]> {
    return loadExistingRelationStrings(this.supabase, projectId);
  }

  private async getExistingSuggestionNames(
    projectId: string
  ): Promise<string[]> {
    return loadExistingSuggestionNames(this.supabase, projectId);
  }

  private async upsertEntitySuggestions(
    inserts: EntitySuggestionInsert[]
  ): Promise<number> {
    return upsertEntitySuggestions(this.supabase, inserts);
  }

  private async getKnownEntityCanonicalNames(
    projectId: string
  ): Promise<Set<string>> {
    return loadKnownEntityCanonicalNames(this.supabase, projectId);
  }

  private async insertRelationSuggestions(
    projectId: string,
    chapterId: string,
    relations: ExtractedRelation[],
    validEntityNames: Set<string>,
    analysisEntities: KnownEntity[]
  ): Promise<number> {
    return insertRelationSuggestions(this.supabase, {
      projectId,
      chapterId,
      relations,
      validEntityNames,
      analysisEntities,
      normalizeName: EntityExtractionService.normalizeName,
    });
  }

  /**
   * importance 재계산: 관계 수 + 등장 챕터 수 기반
   * MAIN: relations >= 5 || chapters >= 5
   * SUPPORTING: relations >= 2 || chapters >= 2
   * MINOR: otherwise
   */
  async recalculateImportance(projectId: string): Promise<void> {
    return recalculateEntityImportance(this.supabase, projectId);
  }
}
