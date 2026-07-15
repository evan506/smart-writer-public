-- Migration: v2_progressive_planning
-- Authored: 2026-06-01
--
-- Purpose:
--   Add author-owned planning data for the Progressive Four-Block Planning MVP.
--
-- Scope:
--   - planning_blocks: separate project planning blocks/cards
--   - planning_links: future manual links from plans to manuscript/canon evidence
--
-- This migration intentionally does not mutate manuscript text, entities.summary,
-- aliases, canon facts, fact suggestions, or Q&A context.

BEGIN;

CREATE TABLE IF NOT EXISTS public.planning_blocks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id      uuid REFERENCES public.planning_blocks(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  title          text NOT NULL,
  summary        text,
  notes          text,
  status         text NOT NULL DEFAULT 'PLANNED',
  position       integer NOT NULL DEFAULT 0,
  structure_key  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_blocks_kind_check CHECK (
    kind IN (
      'ROOT',
      'EPISODE',
      'CHAPTER',
      'SCENE',
      'EVENT',
      'PROMISE',
      'CHARACTER_PLAN',
      'PLACE_PLAN'
    )
  ),
  CONSTRAINT planning_blocks_status_check CHECK (
    status IN (
      'PLANNED',
      'EXPANDED',
      'NEEDS_DETAIL',
      'MANUSCRIPT_SEEN',
      'MEMORY_LINKED',
      'NEEDS_REVIEW'
    )
  ),
  CONSTRAINT planning_blocks_structure_key_check CHECK (
    structure_key IS NULL OR structure_key IN (
      'START',
      'DEVELOPMENT',
      'TURN',
      'ENDING'
    )
  ),
  CONSTRAINT planning_blocks_root_shape_check CHECK (
    (parent_id IS NULL AND kind = 'ROOT')
    OR
    (parent_id IS NOT NULL AND kind <> 'ROOT' AND structure_key IS NULL)
  )
);

DROP TRIGGER IF EXISTS set_planning_blocks_updated_at ON public.planning_blocks;
CREATE TRIGGER set_planning_blocks_updated_at
  BEFORE UPDATE ON public.planning_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS planning_blocks_root_structure_unique
  ON public.planning_blocks (project_id, structure_key)
  WHERE parent_id IS NULL AND structure_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planning_blocks_project_parent_position
  ON public.planning_blocks (project_id, parent_id, position);

CREATE INDEX IF NOT EXISTS idx_planning_blocks_project_status
  ON public.planning_blocks (project_id, status);

CREATE OR REPLACE FUNCTION public.enforce_planning_block_parent_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.planning_blocks parent
    WHERE parent.id = NEW.parent_id
      AND parent.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'planning block parent must belong to the same project'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_planning_block_parent_project
  ON public.planning_blocks;
CREATE TRIGGER enforce_planning_block_parent_project
  BEFORE INSERT OR UPDATE OF parent_id, project_id
  ON public.planning_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_planning_block_parent_project();

CREATE TABLE IF NOT EXISTS public.planning_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  planning_block_id  uuid NOT NULL REFERENCES public.planning_blocks(id) ON DELETE CASCADE,
  target_type        text NOT NULL,
  target_id          uuid NOT NULL,
  link_kind          text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_links_target_type_check CHECK (
    target_type IN (
      'chapter',
      'entity',
      'canon_fact',
      'entity_suggestion',
      'fact_suggestion'
    )
  ),
  CONSTRAINT planning_links_link_kind_check CHECK (
    link_kind IN (
      'PLANNED_FOR',
      'MENTIONED_IN',
      'MEMORY_LINKED',
      'PROMISE_SEEDED',
      'PROMISE_RESOLVED',
      'NEEDS_REVIEW'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_planning_links_project_block
  ON public.planning_links (project_id, planning_block_id);

CREATE INDEX IF NOT EXISTS idx_planning_links_target
  ON public.planning_links (target_type, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS planning_links_unique_manual_link
  ON public.planning_links (
    planning_block_id,
    target_type,
    target_id,
    link_kind
  );

ALTER TABLE public.planning_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_blocks_select_own ON public.planning_blocks;
CREATE POLICY planning_blocks_select_own
  ON public.planning_blocks
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS planning_blocks_insert_own ON public.planning_blocks;
CREATE POLICY planning_blocks_insert_own
  ON public.planning_blocks
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS planning_blocks_update_own ON public.planning_blocks;
CREATE POLICY planning_blocks_update_own
  ON public.planning_blocks
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

DROP POLICY IF EXISTS planning_blocks_delete_own ON public.planning_blocks;
CREATE POLICY planning_blocks_delete_own
  ON public.planning_blocks
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS planning_links_select_own ON public.planning_links;
CREATE POLICY planning_links_select_own
  ON public.planning_links
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS planning_links_insert_own ON public.planning_links;
CREATE POLICY planning_links_insert_own
  ON public.planning_links
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
    AND planning_block_id IN (
      SELECT id FROM public.planning_blocks
      WHERE project_id = planning_links.project_id
    )
  );

DROP POLICY IF EXISTS planning_links_update_own ON public.planning_links;
CREATE POLICY planning_links_update_own
  ON public.planning_links
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
    AND planning_block_id IN (
      SELECT id FROM public.planning_blocks
      WHERE project_id = planning_links.project_id
    )
  );

DROP POLICY IF EXISTS planning_links_delete_own ON public.planning_links;
CREATE POLICY planning_links_delete_own
  ON public.planning_links
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

COMMIT;
