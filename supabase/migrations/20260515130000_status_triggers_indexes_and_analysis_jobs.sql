-- Migration: status_triggers_indexes_and_analysis_jobs
-- Authored: 2026-05-15 (DB status/job track: wt-db-status)
--
-- Purpose:
--   1. Add the missing updated_at triggers (using the existing
--      update_updated_at_column() function) for entity_suggestions,
--      personas and chat_conversations. These three tables have an
--      updated_at column but NO trigger, so updated_at never refreshes
--      on UPDATE (the app currently sets it manually in some paths only).
--   2. Add two missing indexes on entity_suggestions:
--      (chapter_id, status)  -> per-chapter suggestion lookups
--      (updated_at)          -> "recently analysed" / polling queries
--   3. Create a new analysis_jobs table that records the post-save
--      AI extraction pipeline status (QUEUED/RUNNING/DONE/FAILED) so
--      failures are tracked in the DB instead of console.error only,
--      and concurrent runs for the same chapter are prevented.
--
-- Live-DB verified facts at authoring time:
--   * update_updated_at_column() EXISTS and sets NEW.updated_at = now().
--     Triggers named set_<tbl>_updated_at exist ONLY on
--     chapters/entities/foreshadows/projects. MISSING on
--     entity_suggestions/personas/chat_conversations.
--   * entity_suggestions has idx_entity_suggestions_project_status
--     (project_id,status) and entity_suggestions_chapter_name_unique.
--     It is MISSING (chapter_id,status) and (updated_at).
--   * No job/status table exists; post-save extraction failures are
--     console.error only, with no duplicate-run guard.
--   * RLS pattern for project-owned tables: project_id IN
--     (SELECT id FROM projects WHERE user_id = auth.uid()).
--     All existing tables have RLS enabled.
--
-- This migration does NOT touch genre_kits, entity_links or
-- match_chat_messages (owned by other tracks) and does NOT depend on
-- the integrity track dropping idx_entity_suggestions_unique.
--
-- Idempotent: DROP TRIGGER IF EXISTS + CREATE TRIGGER,
-- CREATE INDEX IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- and a DO-block existence check for the partial unique index.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Missing updated_at triggers (reuse existing update_updated_at_column())
-- ---------------------------------------------------------------------------
-- update_updated_at_column() already exists in the live DB and is the same
-- function used by set_<tbl>_updated_at on chapters/entities/foreshadows/
-- projects. These three tables have the updated_at column but no trigger.

DROP TRIGGER IF EXISTS set_entity_suggestions_updated_at ON public.entity_suggestions;
CREATE TRIGGER set_entity_suggestions_updated_at
  BEFORE UPDATE ON public.entity_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_personas_updated_at ON public.personas;
CREATE TRIGGER set_personas_updated_at
  BEFORE UPDATE ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Missing entity_suggestions indexes
-- ---------------------------------------------------------------------------
-- (chapter_id, status): per-chapter suggestion review queries.
-- (updated_at): "recently analysed" polling/ordering (the suggestion panel
-- currently infers analysis progress from updated_at).
CREATE INDEX IF NOT EXISTS idx_entity_suggestions_chapter_status
  ON public.entity_suggestions (chapter_id, status);

CREATE INDEX IF NOT EXISTS idx_entity_suggestions_updated_at
  ON public.entity_suggestions (updated_at);

-- ---------------------------------------------------------------------------
-- 3. analysis_jobs: post-save AI extraction job tracking
-- ---------------------------------------------------------------------------
-- One row per analysis run for a chapter. Lifecycle:
--   QUEUED -> RUNNING -> DONE | FAILED
-- A partial UNIQUE index blocks a second active (QUEUED/RUNNING) job for
-- the same chapter, giving the app a DB-level duplicate-run guard.
CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chapter_id       uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'QUEUED'
                     CHECK (status IN ('QUEUED','RUNNING','DONE','FAILED')),
  error            text,
  entity_count     int,
  relation_count   int,
  suggestion_count int,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.analysis_jobs IS
  'Tracks the post-save AI entity/relation extraction pipeline (IndexingService.indexChapterWithExtraction). One row per run; QUEUED->RUNNING->DONE|FAILED. Failures are recorded here instead of console.error only. analysis_jobs_active_chapter_uniq prevents concurrent active runs per chapter.';

-- updated_at trigger (same shared function)
DROP TRIGGER IF EXISTS set_analysis_jobs_updated_at ON public.analysis_jobs;
CREATE TRIGGER set_analysis_jobs_updated_at
  BEFORE UPDATE ON public.analysis_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Lookup / ordering indexes
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_chapter_created_at
  ON public.analysis_jobs (chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_project_status
  ON public.analysis_jobs (project_id, status);

-- Duplicate-run guard: at most one QUEUED/RUNNING job per chapter.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'analysis_jobs'
      AND indexname  = 'analysis_jobs_active_chapter_uniq'
  ) THEN
    CREATE UNIQUE INDEX analysis_jobs_active_chapter_uniq
      ON public.analysis_jobs (chapter_id)
      WHERE status IN ('QUEUED','RUNNING');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3b. analysis_jobs RLS — mirror the project-ownership pattern
-- ---------------------------------------------------------------------------
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: only jobs for projects the caller owns.
DROP POLICY IF EXISTS analysis_jobs_select_own ON public.analysis_jobs;
CREATE POLICY analysis_jobs_select_own
  ON public.analysis_jobs
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

-- INSERT: only into projects the caller owns.
DROP POLICY IF EXISTS analysis_jobs_insert_own ON public.analysis_jobs;
CREATE POLICY analysis_jobs_insert_own
  ON public.analysis_jobs
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

-- UPDATE: only rows for projects the caller owns (both old and new row).
DROP POLICY IF EXISTS analysis_jobs_update_own ON public.analysis_jobs;
CREATE POLICY analysis_jobs_update_own
  ON public.analysis_jobs
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

-- DELETE: only rows for projects the caller owns. (Not used by the app
-- yet; included so cleanup tooling cannot escape the ownership boundary.)
DROP POLICY IF EXISTS analysis_jobs_delete_own ON public.analysis_jobs;
CREATE POLICY analysis_jobs_delete_own
  ON public.analysis_jobs
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

COMMIT;
