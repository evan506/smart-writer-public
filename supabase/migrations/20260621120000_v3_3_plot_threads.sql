-- Migration: v3_3_plot_threads
-- Authored: 2026-06-21
--
-- Purpose:
--   Add author-defined plot threads for the V3.3 "플롯 스레드 × 회차" matrix.
--   A plot thread is an author-owned, cross-cutting narrative axis. It is
--   explicitly linked (many-to-many) to existing planning blocks and chapters
--   so the planning route can render a read-only matrix of author connections
--   and existing manuscript/canon evidence.
--
-- Scope:
--   - plot_threads: project-scoped author-defined thread (title/summary/position).
--   - plot_thread_planning_blocks: thread <-> planning_block links.
--   - plot_thread_chapters: thread <-> chapter direct links.
--
-- Boundaries (V3.3 is read/navigation-first):
--   - Does NOT modify or reinterpret planning_blocks, planning_links, chapters,
--     entities, canon_facts, canon_fact_sources, aliases, relations, or Q&A.
--   - Does NOT add a PLOT_THREAD kind to planning_blocks (no kind extension).
--   - No status, no auto-classification, no time-axis, no beat framework.
--   - Layer/reconciliation/drift verdicts are intentionally out of scope.
--
-- Cross-project safety:
--   FKs only prove the referenced row exists, not that it shares project_id.
--   Two project-bound BEFORE triggers enforce that the thread + target row all
--   belong to NEW.project_id. The block trigger additionally enforces the V3.3
--   row-kind allowlist (EPISODE, CHAPTER, SCENE, EVENT, PROMISE) — rejecting
--   ROOT, CHARACTER_PLAN, and PLACE_PLAN — so a direct DB insert that bypasses
--   the server action is still rejected. This is in addition to owner-bound RLS
--   and server-action validation.

BEGIN;

-- ── plot_threads ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plot_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  summary     text,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plot_threads_title_check CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 120
  )
);

CREATE INDEX IF NOT EXISTS idx_plot_threads_project_position
  ON public.plot_threads (project_id, position);

DROP TRIGGER IF EXISTS set_plot_threads_updated_at ON public.plot_threads;
CREATE TRIGGER set_plot_threads_updated_at
  BEFORE UPDATE ON public.plot_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── plot_thread_planning_blocks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plot_thread_planning_blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plot_thread_id     uuid NOT NULL REFERENCES public.plot_threads(id) ON DELETE CASCADE,
  planning_block_id  uuid NOT NULL REFERENCES public.planning_blocks(id) ON DELETE CASCADE,
  position           integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plot_thread_planning_blocks_unique
    UNIQUE (plot_thread_id, planning_block_id)
);

CREATE INDEX IF NOT EXISTS idx_ptpb_project_thread_position
  ON public.plot_thread_planning_blocks (project_id, plot_thread_id, position);

CREATE INDEX IF NOT EXISTS idx_ptpb_planning_block
  ON public.plot_thread_planning_blocks (planning_block_id);

-- ── plot_thread_chapters ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plot_thread_chapters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plot_thread_id  uuid NOT NULL REFERENCES public.plot_threads(id) ON DELETE CASCADE,
  chapter_id      uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plot_thread_chapters_unique
    UNIQUE (plot_thread_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_ptc_project_thread
  ON public.plot_thread_chapters (project_id, plot_thread_id);

CREATE INDEX IF NOT EXISTS idx_ptc_chapter
  ON public.plot_thread_chapters (chapter_id);

-- ── Project-bound guards (cross-project link prevention) ─────────────────────
CREATE OR REPLACE FUNCTION public.enforce_plot_thread_block_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  block_kind text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.plot_threads t
    WHERE t.id = NEW.plot_thread_id
      AND t.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'plot thread must belong to the same project'
      USING ERRCODE = '23514';
  END IF;

  SELECT b.kind INTO block_kind
  FROM public.planning_blocks b
  WHERE b.id = NEW.planning_block_id
    AND b.project_id = NEW.project_id;

  IF block_kind IS NULL THEN
    RAISE EXCEPTION 'planning block must belong to the same project'
      USING ERRCODE = '23514';
  END IF;

  -- V3.3 row-kind allowlist enforced at the DB level. This MUST mirror the
  -- server action's isPlotThreadRowKind allowlist exactly, because a server
  -- action check alone cannot stop a direct DB insert that passes RLS. Only
  -- cross-cutting narrative card kinds may be thread rows; ROOT, CHARACTER_PLAN,
  -- and PLACE_PLAN are all rejected here.
  IF block_kind NOT IN ('EPISODE', 'CHAPTER', 'SCENE', 'EVENT', 'PROMISE') THEN
    RAISE EXCEPTION
      'planning block kind % cannot be linked to a plot thread (allowed: EPISODE, CHAPTER, SCENE, EVENT, PROMISE)',
      block_kind
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_plot_thread_block_project
  ON public.plot_thread_planning_blocks;
CREATE TRIGGER enforce_plot_thread_block_project
  BEFORE INSERT OR UPDATE OF plot_thread_id, planning_block_id, project_id
  ON public.plot_thread_planning_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_plot_thread_block_project();

CREATE OR REPLACE FUNCTION public.enforce_plot_thread_chapter_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.plot_threads t
    WHERE t.id = NEW.plot_thread_id
      AND t.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'plot thread must belong to the same project'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chapters c
    WHERE c.id = NEW.chapter_id
      AND c.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'chapter must belong to the same project'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_plot_thread_chapter_project
  ON public.plot_thread_chapters;
CREATE TRIGGER enforce_plot_thread_chapter_project
  BEFORE INSERT OR UPDATE OF plot_thread_id, chapter_id, project_id
  ON public.plot_thread_chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_plot_thread_chapter_project();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.plot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_thread_planning_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_thread_chapters ENABLE ROW LEVEL SECURITY;

-- plot_threads
DROP POLICY IF EXISTS plot_threads_select_own ON public.plot_threads;
CREATE POLICY plot_threads_select_own
  ON public.plot_threads
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS plot_threads_insert_own ON public.plot_threads;
CREATE POLICY plot_threads_insert_own
  ON public.plot_threads
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS plot_threads_update_own ON public.plot_threads;
CREATE POLICY plot_threads_update_own
  ON public.plot_threads
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS plot_threads_delete_own ON public.plot_threads;
CREATE POLICY plot_threads_delete_own
  ON public.plot_threads
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

-- plot_thread_planning_blocks
DROP POLICY IF EXISTS plot_thread_planning_blocks_select_own
  ON public.plot_thread_planning_blocks;
CREATE POLICY plot_thread_planning_blocks_select_own
  ON public.plot_thread_planning_blocks
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS plot_thread_planning_blocks_insert_own
  ON public.plot_thread_planning_blocks;
CREATE POLICY plot_thread_planning_blocks_insert_own
  ON public.plot_thread_planning_blocks
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
    AND plot_thread_id IN (
      SELECT id FROM public.plot_threads
      WHERE project_id = plot_thread_planning_blocks.project_id
    )
  );

DROP POLICY IF EXISTS plot_thread_planning_blocks_update_own
  ON public.plot_thread_planning_blocks;
CREATE POLICY plot_thread_planning_blocks_update_own
  ON public.plot_thread_planning_blocks
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
    AND plot_thread_id IN (
      SELECT id FROM public.plot_threads
      WHERE project_id = plot_thread_planning_blocks.project_id
    )
  );

DROP POLICY IF EXISTS plot_thread_planning_blocks_delete_own
  ON public.plot_thread_planning_blocks;
CREATE POLICY plot_thread_planning_blocks_delete_own
  ON public.plot_thread_planning_blocks
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

-- plot_thread_chapters
DROP POLICY IF EXISTS plot_thread_chapters_select_own
  ON public.plot_thread_chapters;
CREATE POLICY plot_thread_chapters_select_own
  ON public.plot_thread_chapters
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS plot_thread_chapters_insert_own
  ON public.plot_thread_chapters;
CREATE POLICY plot_thread_chapters_insert_own
  ON public.plot_thread_chapters
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
    AND plot_thread_id IN (
      SELECT id FROM public.plot_threads
      WHERE project_id = plot_thread_chapters.project_id
    )
  );

DROP POLICY IF EXISTS plot_thread_chapters_update_own
  ON public.plot_thread_chapters;
CREATE POLICY plot_thread_chapters_update_own
  ON public.plot_thread_chapters
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
    AND plot_thread_id IN (
      SELECT id FROM public.plot_threads
      WHERE project_id = plot_thread_chapters.project_id
    )
  );

DROP POLICY IF EXISTS plot_thread_chapters_delete_own
  ON public.plot_thread_chapters;
CREATE POLICY plot_thread_chapters_delete_own
  ON public.plot_thread_chapters
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = (select auth.uid())
    )
  );

COMMIT;
