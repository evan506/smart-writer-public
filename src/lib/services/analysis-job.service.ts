import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type AnalysisJobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export interface AnalysisJobCounts {
  entityCount: number;
  relationCount: number;
  suggestionCount: number;
}

export const ANALYSIS_JOB_STALE_TIMEOUT_MS = 10 * 60 * 1000;
const STALE_TIMEOUT_ERROR = "stale_timeout";

/**
 * Tracks the post-save AI extraction pipeline in the analysis_jobs table.
 *
 * All methods are resilient: job-tracking failures are logged but NEVER
 * thrown, so they cannot break the chapter save / indexing flow. The
 * analysis_jobs_active_chapter_uniq partial unique index is the DB-level
 * duplicate-run guard — createJob() handles the unique violation by
 * returning the existing active job id instead of inserting a second row.
 */
export class AnalysisJobService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Expire old active jobs so a stuck QUEUED/RUNNING row cannot block future
   * analysis forever. Stale jobs are marked FAILED instead of introducing a
   * new DB enum value.
   */
  async expireStaleJobs(
    projectId: string,
    chapterId: string,
    timeoutMs = ANALYSIS_JOB_STALE_TIMEOUT_MS
  ): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs).toISOString();
    const { data, error } = await this.supabase
      .from("analysis_jobs")
      .update({
        status: "FAILED",
        error: STALE_TIMEOUT_ERROR,
        finished_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)
      .eq("chapter_id", chapterId)
      .in("status", ["QUEUED", "RUNNING"])
      .lt("created_at", cutoff)
      .select("id");

    if (error) {
      console.error(
        "[AnalysisJobService] expireStaleJobs failed (non-critical):",
        error.message
      );
      return 0;
    }

    return data?.length ?? 0;
  }

  /**
   * Create a QUEUED job for a chapter.
   *
   * If an active (QUEUED/RUNNING) job already exists for the chapter the
   * partial unique index rejects the insert; in that case we return the
   * existing active job id (a run is already in progress) and the caller
   * should treat that as "do not start a duplicate run".
   *
   * Returns the job id, or null if tracking could not be established
   * (the caller must still proceed with extraction — tracking is best
   * effort and must not block the pipeline).
   */
  async createJob(
    projectId: string,
    chapterId: string
  ): Promise<{ jobId: string | null; alreadyRunning: boolean }> {
    await this.expireStaleJobs(projectId, chapterId);

    let { data, error } = await this.insertQueuedJob(projectId, chapterId);

    if (!error && data) {
      return { jobId: data.id, alreadyRunning: false };
    }

    // 23505 = unique_violation -> an active job already exists for this
    // chapter (analysis_jobs_active_chapter_uniq). Before reporting that as
    // already-running, run stale cleanup once more and retry the insert. This
    // handles jobs that became stale between the first cleanup and insert.
    if (error?.code === "23505") {
      const expiredCount = await this.expireStaleJobs(projectId, chapterId);
      if (expiredCount > 0) {
        ({ data, error } = await this.insertQueuedJob(projectId, chapterId));
        if (!error && data) {
          return { jobId: data.id, alreadyRunning: false };
        }
      }

      const { data: active } = await this.supabase
        .from("analysis_jobs")
        .select("id")
        .eq("chapter_id", chapterId)
        .in("status", ["QUEUED", "RUNNING"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return { jobId: active?.id ?? null, alreadyRunning: true };
    }

    console.error(
      "[AnalysisJobService] createJob failed (non-critical):",
      error?.message ?? "unknown error"
    );
    return { jobId: null, alreadyRunning: false };
  }

  private async insertQueuedJob(projectId: string, chapterId: string) {
    return this.supabase
      .from("analysis_jobs")
      .insert({
        project_id: projectId,
        chapter_id: chapterId,
        status: "QUEUED",
      })
      .select("id")
      .single();
  }

  /** Mark a job RUNNING and stamp started_at. No-op if jobId is null. */
  async markRunning(jobId: string | null): Promise<void> {
    if (!jobId) return;
    const { error } = await this.supabase
      .from("analysis_jobs")
      .update({ status: "RUNNING", started_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) {
      console.error(
        "[AnalysisJobService] markRunning failed (non-critical):",
        error.message
      );
    }
  }

  /** Mark a job DONE with the produced counts. No-op if jobId is null. */
  async markDone(
    jobId: string | null,
    counts: AnalysisJobCounts
  ): Promise<void> {
    if (!jobId) return;
    const { error } = await this.supabase
      .from("analysis_jobs")
      .update({
        status: "DONE",
        entity_count: counts.entityCount,
        relation_count: counts.relationCount,
        suggestion_count: counts.suggestionCount,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (error) {
      console.error(
        "[AnalysisJobService] markDone failed (non-critical):",
        error.message
      );
    }
  }

  /** Mark a job FAILED with a truncated error message. No-op if jobId is null. */
  async markFailed(jobId: string | null, message: string): Promise<void> {
    if (!jobId) return;
    const { error } = await this.supabase
      .from("analysis_jobs")
      .update({
        status: "FAILED",
        error: message.slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (error) {
      console.error(
        "[AnalysisJobService] markFailed failed (non-critical):",
        error.message
      );
    }
  }

  /** Latest job for a chapter (for UI status display). */
  async getLatestForChapter(
    chapterId: string
  ): Promise<Database["public"]["Tables"]["analysis_jobs"]["Row"] | null> {
    const { data, error } = await this.supabase
      .from("analysis_jobs")
      .select("*")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        "[AnalysisJobService] getLatestForChapter failed (non-critical):",
        error.message
      );
      return null;
    }
    return data;
  }
}
