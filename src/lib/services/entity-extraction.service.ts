import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { EntitySuggestionInsert } from "@/types";
import { chunkChapter } from "./chunking.service";
import {
  type ExtractedEntity,
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
  canAutoMergeSubstringEntities,
  shouldAutoMergeCharacterSubstring,
} from "./entity-extraction/merge-policy";
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
import { autoConfirmEntity as autoConfirmExtractedEntity } from "./entity-extraction/auto-confirm";
import { recalculateEntityImportance } from "./entity-extraction/importance";
import { insertRelationSuggestions } from "./entity-extraction/relation-writes";
import { insertFactSuggestions } from "./entity-extraction/fact-suggestion-writes";
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
    const createExtractionLogger = (promptTemplateKey: PromptTemplateKey) =>
      createLLMUsageLogger(this.supabase, {
        projectId,
        userId,
        feature: "entity_extraction",
        promptTemplateKey,
        promptTemplateVersion: getPromptTemplateVersion(promptTemplateKey),
      });

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
          }),
        autoConfirmEntity: (entity, id, currentChapterId) =>
          this.autoConfirmEntity(entity, id, currentChapterId),
        upsertEntitySuggestions: (inserts) =>
          this.upsertEntitySuggestions(inserts),
        loadEntitySuggestionRefs: (input) =>
          loadEntitySuggestionRefs(this.supabase, input),
        insertFactSuggestions: (input) =>
          insertFactSuggestions(this.supabase, input),
        mergeSubstringEntities: (id) => this.mergeSubstringEntities(id),
        stage3ExtractRelations: (confirmedEntities, chapterContent, relations) =>
          stage3ExtractRelations(
            confirmedEntities,
            chapterContent,
            relations,
            {
              onComplete: createExtractionLogger("entity_extraction.stage3_relations"),
            }
          ),
        mergeRelations: (relations) => this.mergeRelations(relations),
        resolveRelationConflicts: (relations) =>
          this.resolveRelationConflicts(relations),
        getKnownEntityCanonicalNames: (id) =>
          this.getKnownEntityCanonicalNames(id),
        insertRelationSuggestions: (id, currentChapterId, relations, validNames) =>
          this.insertRelationSuggestions(
            id,
            currentChapterId,
            relations,
            validNames
          ),
        recalculateImportance: (id) => this.recalculateImportance(id),
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
   * 이름이 서로 포함 관계인 confirmed 엔티티 병합:
   * "리엔"과 "리엔 하르트" → 짧은 쪽을 긴 쪽의 alias로 병합, 짧은 쪽 DB 레코드 삭제
   */
  private async mergeSubstringEntities(projectId: string): Promise<void> {
    const { data: entities } = await this.supabase
      .from("entities")
      .select("id, name, type, summary, aliases")
      .eq("project_id", projectId);

    if (!entities || entities.length < 2) return;

    const norm = EntityExtractionService.normalizeName;
    const merged = new Set<string>(); // 이미 병합된 entity id

    for (let i = 0; i < entities.length; i++) {
      if (merged.has(entities[i].id)) continue;
      for (let j = i + 1; j < entities.length; j++) {
        if (merged.has(entities[j].id)) continue;
        // 같은 타입이어야 하며, 자동 substring 병합은 인물명 축약에만 제한한다.
        // 종족/개념/직책은 "엘프"와 "하이엘프", "마족"과 "하피 마족"처럼
        // 포함 관계여도 별칭이 아닌 상하위 개념일 수 있으므로 작가 확인 없이 병합하지 않는다.
        if (entities[i].type !== entities[j].type) continue;
        if (!canAutoMergeSubstringEntities(entities[i].type)) continue;

        const normA = norm(entities[i].name);
        const normB = norm(entities[j].name);
        if (normA === normB) continue;

        let longer: typeof entities[0];
        let shorter: typeof entities[0];

        if (normA.includes(normB)) {
          longer = entities[i];
          shorter = entities[j];
        } else if (normB.includes(normA)) {
          longer = entities[j];
          shorter = entities[i];
        } else {
          continue;
        }

        if (!shouldAutoMergeCharacterSubstring(shorter.name, longer.name)) {
          continue;
        }

        // 긴 쪽에 짧은 쪽 이름을 alias로 추가
        const longerAliases = Array.isArray(longer.aliases) ? (longer.aliases as string[]) : [];
        const shorterAliases = Array.isArray(shorter.aliases) ? (shorter.aliases as string[]) : [];
        const allAliases = new Set([...longerAliases, ...shorterAliases, shorter.name]);
        allAliases.delete(longer.name);

        // summary: 더 긴 쪽 우선
        const mergedSummary =
          longer.summary && longer.summary.length >= (shorter.summary?.length ?? 0)
            ? longer.summary
            : shorter.summary || longer.summary;

        // Each step is error-checked; on any failure we abort THIS pair's
        // merge before the delete so both entities stay intact (no orphaned
        // links / half-merged state). No transaction available client-side.
        const aliasUpdate = await this.supabase
          .from("entities")
          .update({
            aliases: Array.from(allAliases),
            summary: mergedSummary,
          })
          .eq("id", longer.id);
        if (aliasUpdate.error) {
          console.error(
            `[EntityExtraction] substring merge aborted (alias update): ${aliasUpdate.error.message}`
          );
          continue;
        }

        // 짧은 쪽의 entity_links를 긴 쪽으로 이관
        const fromMove = await this.supabase
          .from("entity_links")
          .update({ from_id: longer.id })
          .eq("from_id", shorter.id);
        const toMove = await this.supabase
          .from("entity_links")
          .update({ to_id: longer.id })
          .eq("to_id", shorter.id);
        if (fromMove.error || toMove.error) {
          console.error(
            `[EntityExtraction] substring merge aborted (link move): ${
              fromMove.error?.message ?? toMove.error?.message
            }`
          );
          continue;
        }

        // 짧은 쪽 entity_suggestions의 matched_entity_id도 이관
        const suggestionMove = await this.supabase
          .from("entity_suggestions")
          .update({ matched_entity_id: longer.id })
          .eq("matched_entity_id", shorter.id);
        if (suggestionMove.error) {
          console.error(
            `[EntityExtraction] substring merge aborted (suggestion move): ${suggestionMove.error.message}`
          );
          continue;
        }

        // 짧은 쪽 삭제 — 이관이 전부 성공한 뒤에만 실행
        const deletion = await this.supabase
          .from("entities")
          .delete()
          .eq("id", shorter.id);
        if (deletion.error) {
          console.error(
            `[EntityExtraction] substring merge: delete failed (links already moved): ${deletion.error.message}`
          );
          continue;
        }

        merged.add(shorter.id);
        console.log(
          `[EntityExtraction] substring merge: "${shorter.name}" → "${longer.name}" (alias added, entity deleted)`
        );
      }
    }
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
    validEntityNames: Set<string>
  ): Promise<number> {
    return insertRelationSuggestions(this.supabase, {
      projectId,
      chapterId,
      relations,
      validEntityNames,
      normalizeName: EntityExtractionService.normalizeName,
    });
  }

  /**
   * Auto-confirm a high-confidence entity: insert to entities + record as CONFIRMED suggestion.
   * Returns the entity id if successful, null otherwise.
   */
  private async autoConfirmEntity(
    entity: ExtractedEntity,
    projectId: string,
    chapterId: string
  ): Promise<string | null> {
    return autoConfirmExtractedEntity(this.supabase, {
      entity,
      projectId,
      chapterId,
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
