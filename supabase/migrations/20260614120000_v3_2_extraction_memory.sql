-- Migration: v3_2_extraction_memory
-- Authored: 2026-06-14
--
-- Purpose:
--   Add per-project, author-controlled extraction learning memory for the
--   V3.2.1 self-improving extraction slice. Each row is a tool-behavior rule
--   distilled from the author's own review decisions (or a per-project
--   override of an inherited genre-baseline rule). This stores how the
--   EXTRACTION TOOL should behave for this work — it never stores story
--   content, canon, entities.summary, aliases, facts, or Q&A context.
--
-- Scope:
--   - extraction_memory: project-scoped learning rules with per-item state.
--
-- Boundaries:
--   - No change to manuscript text, entities, canon_facts, fact_suggestions,
--     planning data, or Q&A context.
--   - Layer-2 (account promotion) is intentionally NOT modeled here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.extraction_memory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  rule_key    text NOT NULL,
  rule_text   text NOT NULL,
  source      text NOT NULL DEFAULT 'DISTILLED',
  status      text NOT NULL DEFAULT 'ACTIVE',
  evidence    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extraction_memory_kind_check CHECK (
    kind IN (
      'EXCLUDE_PATTERN',
      'TYPE_CONVENTION',
      'LAYER_OVERRIDE'
    )
  ),
  CONSTRAINT extraction_memory_source_check CHECK (
    source IN ('DISTILLED', 'MANUAL')
  ),
  CONSTRAINT extraction_memory_status_check CHECK (
    status IN ('ACTIVE', 'DISABLED')
  ),
  -- A LAYER_OVERRIDE row marks an inherited genre-baseline rule as disabled
  -- for this project; its rule_key matches the genre rule key it overrides.
  CONSTRAINT extraction_memory_override_shape_check CHECK (
    kind <> 'LAYER_OVERRIDE' OR status = 'DISABLED'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS extraction_memory_project_kind_rulekey_unique
  ON public.extraction_memory (project_id, kind, rule_key);

CREATE INDEX IF NOT EXISTS idx_extraction_memory_project_status
  ON public.extraction_memory (project_id, status);

DROP TRIGGER IF EXISTS set_extraction_memory_updated_at ON public.extraction_memory;
CREATE TRIGGER set_extraction_memory_updated_at
  BEFORE UPDATE ON public.extraction_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.extraction_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extraction_memory_select_own ON public.extraction_memory;
CREATE POLICY extraction_memory_select_own
  ON public.extraction_memory
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS extraction_memory_insert_own ON public.extraction_memory;
CREATE POLICY extraction_memory_insert_own
  ON public.extraction_memory
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS extraction_memory_update_own ON public.extraction_memory;
CREATE POLICY extraction_memory_update_own
  ON public.extraction_memory
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

DROP POLICY IF EXISTS extraction_memory_delete_own ON public.extraction_memory;
CREATE POLICY extraction_memory_delete_own
  ON public.extraction_memory
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

COMMIT;
