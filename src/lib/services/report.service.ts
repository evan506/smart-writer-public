import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  loadReportAnalysisJobs,
  loadReportChapters,
  loadReportChunks,
  loadReportEntities,
  loadReportEntityLinks,
  loadReportForeshadows,
  loadReportMentions,
  loadReportProject,
  loadReportSuggestions,
} from "./report/loaders";
import {
  buildEvidenceByEntity,
  buildStats,
  toReportAnalysisJob,
  toReportChapter,
  toReportEntity,
  toReportEntityLink,
  toReportForeshadow,
  toReportSuggestion,
} from "./report/mappers";
import type { ReportData, ReportDataOptions } from "./report/types";

export type {
  AnalysisJob,
  ReportAnalysisJob,
  ReportChapter,
  ReportChunkSource,
  ReportData,
  ReportDataOptions,
  ReportEntity,
  ReportEntityEvidenceSummary,
  ReportEntityLink,
  ReportEntityRef,
  ReportEvidence,
  ReportForeshadow,
  ReportStats,
  ReportSuggestion,
} from "./report/types";

export class ReportService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getReportData(
    projectId: string,
    options: ReportDataOptions = {}
  ): Promise<ReportData> {
    const evidenceLimit = options.evidenceLimitPerEntity ?? 3;

    const [project, chapters] = await Promise.all([
      loadReportProject(this.supabase, projectId),
      loadReportChapters(this.supabase, projectId, options),
    ]);

    const chapterIds = chapters.map((chapter) => chapter.id);

    const [
      entities,
      suggestions,
      foreshadows,
      analysisJobs,
      chunks,
    ] = await Promise.all([
      loadReportEntities(this.supabase, projectId),
      loadReportSuggestions(this.supabase, projectId, chapterIds),
      loadReportForeshadows(this.supabase, projectId, options),
      loadReportAnalysisJobs(this.supabase, projectId, chapterIds),
      loadReportChunks(this.supabase, chapterIds),
    ]);

    const entityIds = entities.map((entity) => entity.id);
    const chunkIds = chunks.map((chunk) => chunk.id);

    const [entityLinks, mentions] = await Promise.all([
      loadReportEntityLinks(this.supabase, entityIds),
      loadReportMentions(this.supabase, chunkIds),
    ]);

    const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
    const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    const evidenceByEntity = buildEvidenceByEntity(
      mentions,
      chunkMap,
      chapterMap,
      evidenceLimit
    );
    const reportChapters = chapters.map(toReportChapter);
    const reportEntities = entities.map((entity) =>
      toReportEntity(entity, evidenceByEntity.get(entity.id))
    );

    return {
      project,
      range: {
        chapterFrom: options.chapterFrom ?? null,
        chapterTo: options.chapterTo ?? null,
      },
      stats: buildStats(
        reportChapters,
        reportEntities,
        suggestions,
        foreshadows,
        entityLinks
      ),
      chapters: reportChapters,
      entities: reportEntities,
      entityLinks: entityLinks.map((link) =>
        toReportEntityLink(link, entityMap)
      ),
      suggestions: suggestions.map((suggestion) =>
        toReportSuggestion(suggestion, chapterMap, entityMap)
      ),
      foreshadows: foreshadows.map((foreshadow) =>
        toReportForeshadow(foreshadow, entityMap)
      ),
      analysisJobs: analysisJobs.map((job) =>
        toReportAnalysisJob(job, chapterMap)
      ),
    };
  }
}
