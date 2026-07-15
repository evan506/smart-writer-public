import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { chunkChapter } from "./chunking.service";
import { embedTexts } from "./embedding.service";
import { createLLMUsageLogger } from "./llm-usage-logger.service";
import { MentionService } from "./mention.service";
import { EntityExtractionService } from "./entity-extraction.service";
import { AnalysisJobService } from "./analysis-job.service";

export type IndexExtractionResult = {
  chunkCount: number;
  mentionCount: number;
  suggestionCount: number;
  relationSuggestionCount: number;
  factSuggestionCount: number;
};

const EMPTY_INDEX_EXTRACTION_RESULT: IndexExtractionResult = {
  chunkCount: 0,
  mentionCount: 0,
  suggestionCount: 0,
  relationSuggestionCount: 0,
  factSuggestionCount: 0,
};

// Max re-extraction passes per chain when a chapter keeps changing mid-analysis.
// Bounds runaway extraction from rapid consecutive saves; leftover drift is
// caught by the next save's own run.
const MAX_STALE_FOLLOWUPS = 3;

export class IndexingService {
  private mentionService: MentionService;
  private jobService: AnalysisJobService;

  constructor(private supabase: SupabaseClient<Database>) {
    this.mentionService = new MentionService(supabase);
    this.jobService = new AnalysisJobService(supabase);
  }

  async indexChapter(
    chapterId: string,
    projectId: string,
    content: string
  ): Promise<{ chunkCount: number; mentionCount: number }> {
    // 0. Snapshot existing chunk embeddings so unchanged chunk contents
    //    (e.g. a forced re-save for re-extraction) skip re-embedding.
    const { data: previousChunks } = await this.supabase
      .from("chunks")
      .select("content, embedding")
      .eq("chapter_id", chapterId);
    const reusableEmbeddings = new Map<string, string>();
    for (const prev of previousChunks ?? []) {
      if (prev.embedding) reusableEmbeddings.set(prev.content, prev.embedding);
    }

    // 1. Delete existing chunks (mentions cascade-deleted via FK). A silent
    //    failure here would stack new chunks on top of stale ones, doubling
    //    RAG results for this chapter — abort instead.
    const { error: deleteError } = await this.supabase
      .from("chunks")
      .delete()
      .eq("chapter_id", chapterId);
    if (deleteError) {
      throw new Error(`chunk cleanup failed: ${deleteError.message}`);
    }

    // 2. Chunk the content
    const rawChunks = chunkChapter(content);
    if (rawChunks.length === 0) return { chunkCount: 0, mentionCount: 0 };

    // 3. Batch embed only chunk contents without a reusable embedding
    const missingChunks = rawChunks.filter(
      (c) => !reusableEmbeddings.has(c.content)
    );
    const computedEmbeddings = await embedTexts(
      missingChunks.map((c) => c.content),
      {
        onComplete: createLLMUsageLogger(this.supabase, {
          projectId,
          feature: "embedding",
          promptTemplateKey: "indexing.chunk_embedding",
          promptTemplateVersion: "v1",
        }),
      }
    );
    const computedByContent = new Map<string, string>();
    missingChunks.forEach((chunk, i) => {
      computedByContent.set(chunk.content, JSON.stringify(computedEmbeddings[i]));
    });

    // 4. Insert chunks
    const chunkInserts = rawChunks.map((chunk) => ({
      chapter_id: chapterId,
      type: chunk.type,
      content: chunk.content,
      position: chunk.position,
      embedding:
        reusableEmbeddings.get(chunk.content) ??
        computedByContent.get(chunk.content) ??
        null,
    }));

    const { data: insertedChunks, error: chunkError } = await this.supabase
      .from("chunks")
      .insert(chunkInserts)
      .select("id, content");

    if (chunkError) throw chunkError;
    if (!insertedChunks) return { chunkCount: 0, mentionCount: 0 };

    // 5. Extract mentions
    const mentions = await this.mentionService.extractMentions(
      projectId,
      insertedChunks
    );

    // 6. Insert mentions
    if (mentions.length > 0) {
      const mentionInserts = mentions.map((m) => ({
        entity_id: m.entityId,
        chunk_id: m.chunkId,
        count: m.count,
      }));

      const { error: mentionError } = await this.supabase
        .from("mentions")
        .insert(mentionInserts);

      if (mentionError) throw mentionError;
    }

    // 7. Update entity_tags on each chunk
    const chunkEntityMap = new Map<string, string[]>();
    for (const m of mentions) {
      const existing = chunkEntityMap.get(m.chunkId) ?? [];
      if (!existing.includes(m.entityId)) {
        existing.push(m.entityId);
      }
      chunkEntityMap.set(m.chunkId, existing);
    }

    const tagUpdates = Array.from(chunkEntityMap.entries()).map(
      async ([chunkId, entityIds]) => {
        const { error } = await this.supabase
          .from("chunks")
          .update({ entity_tags: entityIds })
          .eq("id", chunkId);
        if (error) {
          // Non-fatal: missing entity_tags degrades GraphRAG recall for this
          // chunk but the index itself is intact.
          console.error(
            `[IndexingService] entity_tags update failed for chunk ${chunkId}:`,
            error.message
          );
        }
      }
    );
    await Promise.all(tagUpdates);

    return { chunkCount: insertedChunks.length, mentionCount: mentions.length };
  }

  async indexChapterWithExtraction(
    chapterId: string,
    projectId: string,
    content: string
  ): Promise<IndexExtractionResult> {
    // 0. Open an analysis job (DB-level duplicate-run guard). If a run is
    //    already active for this chapter, skip — the other run owns it, and
    //    that run's stale-content follow-up (below) picks up whatever this
    //    save just wrote, so no edit is lost.
    //    Job tracking is best-effort: AnalysisJobService swallows its own
    //    errors so it can never break the save/indexing flow.
    const { jobId, alreadyRunning } = await this.jobService.createJob(
      projectId,
      chapterId
    );
    if (alreadyRunning) {
      console.log(
        `[IndexingService] analysis already in progress for chapter ${chapterId}, skipping duplicate run`
      );
      return EMPTY_INDEX_EXTRACTION_RESULT;
    }

    await this.jobService.markRunning(jobId);
    let result = await this.runIndexingJob(
      jobId,
      chapterId,
      projectId,
      content
    );

    // Stale-save follow-up: a save landing while this job was RUNNING is
    // skipped (alreadyRunning above) and its newer content would otherwise
    // never be extracted. Compare what we just processed against the chapter's
    // current content; if it changed, extract the latest once more. Bounded to
    // MAX_STALE_FOLLOWUPS per chain so rapid saves can't spin extraction.
    let processedContent = content;
    for (let attempt = 1; attempt <= MAX_STALE_FOLLOWUPS; attempt += 1) {
      const current = await this.fetchChapterContent(chapterId);
      if (current === null || current === processedContent) break;

      const followup = await this.jobService.createJob(projectId, chapterId);
      if (followup.alreadyRunning) {
        // A newer save already claimed a run; let it handle the latest content.
        break;
      }
      console.log(
        `[IndexingService] chapter ${chapterId} changed during analysis, re-extracting latest content (follow-up ${attempt})`
      );
      await this.jobService.markRunning(followup.jobId);
      processedContent = current;
      result = await this.runIndexingJob(
        followup.jobId,
        chapterId,
        projectId,
        current
      );

      if (attempt === MAX_STALE_FOLLOWUPS) {
        const stillPending = await this.fetchChapterContent(chapterId);
        if (stillPending !== null && stillPending !== processedContent) {
          console.warn(
            `[IndexingService] chapter ${chapterId} still changing after ${MAX_STALE_FOLLOWUPS} follow-ups; deferring to next save`
          );
        }
      }
    }

    return result;
  }

  /** Current stored content of a chapter, or null if unreadable/missing. */
  private async fetchChapterContent(
    chapterId: string
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("chapters")
      .select("content")
      .eq("id", chapterId)
      .maybeSingle();
    if (error) {
      console.error(
        "[IndexingService] failed to re-read chapter content:",
        error.message
      );
      return null;
    }
    return data?.content ?? null;
  }

  /** Runs indexing + extraction for one open job and records its terminal
   *  status. Throws only if indexing itself fails (extraction errors are
   *  recorded as FAILED but return partial counts), matching the original
   *  after() error behaviour. */
  private async runIndexingJob(
    jobId: string | null,
    chapterId: string,
    projectId: string,
    content: string
  ): Promise<IndexExtractionResult> {
    try {
      // 1. Run standard indexing first
      const { chunkCount, mentionCount } = await this.indexChapter(
        chapterId,
        projectId,
        content
      );

      // 2. Run entity + relation extraction (non-critical — catch errors).
      //    A failure here is recorded on the job but does not abort save.
      let suggestionCount = 0;
      let relationSuggestionCount = 0;
      let factSuggestionCount = 0;
      let extractionError: string | null = null;
      try {
        const extractor = new EntityExtractionService(this.supabase);
        const result = await extractor.extractAndSuggest(
          projectId,
          chapterId,
          content
        );
        suggestionCount = result.suggestionCount;
        relationSuggestionCount = result.relationSuggestionCount;
        factSuggestionCount = result.factSuggestionCount;
      } catch (e) {
        extractionError = e instanceof Error ? e.message : String(e);
        console.error(
          "[IndexingService] Entity extraction failed (non-critical):",
          extractionError
        );
      }

      if (extractionError) {
        await this.jobService.markFailed(
          jobId,
          `extraction: ${extractionError}`
        );
      } else {
        await this.jobService.markDone(jobId, {
          // entity_count = entity suggestions; relation_count = relation
          // suggestions; suggestion_count = total produced this run.
          entityCount: suggestionCount,
          relationCount: relationSuggestionCount,
          suggestionCount:
            suggestionCount + relationSuggestionCount + factSuggestionCount,
        });
      }

      return {
        chunkCount,
        mentionCount,
        suggestionCount,
        relationSuggestionCount,
        factSuggestionCount,
      };
    } catch (e) {
      // indexChapter (chunk/embed/insert) threw — record FAILED and
      // re-throw so the existing after() error behaviour is preserved.
      const message = e instanceof Error ? e.message : String(e);
      await this.jobService.markFailed(jobId, `indexing: ${message}`);
      throw e;
    }
  }
}
