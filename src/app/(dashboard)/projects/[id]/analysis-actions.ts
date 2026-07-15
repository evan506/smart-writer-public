"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import { AnalysisJobService } from "@/lib/services";
import type { AnalysisJobStatus } from "@/lib/services";

export interface LatestAnalysisJob {
  id: string;
  status: AnalysisJobStatus;
  error: string | null;
  entityCount: number | null;
  relationCount: number | null;
  suggestionCount: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Latest analysis job for a chapter — used by the suggestion panel to
 * show RUNNING / DONE / FAILED instead of inferring progress purely from
 * entity_suggestions.updated_at + polling.
 *
 * RLS scopes analysis_jobs to the caller's projects, so an explicit
 * project ownership check here is defence-in-depth.
 */
export async function getLatestAnalysisJob(
  projectId: string,
  chapterId: string
): Promise<{ error: string | null; job: LatestAnalysisJob | null }> {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error, job: null };

  const service = new AnalysisJobService(supabase);
  const row = await service.getLatestForChapter(chapterId);

  if (!row) return { error: null, job: null };

  // Defence-in-depth: ignore rows that do not belong to the given project.
  if (row.project_id !== projectId) {
    return { error: null, job: null };
  }

  return {
    error: null,
    job: {
      id: row.id,
      status: row.status as AnalysisJobStatus,
      error: row.error,
      entityCount: row.entity_count,
      relationCount: row.relation_count,
      suggestionCount: row.suggestion_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}
