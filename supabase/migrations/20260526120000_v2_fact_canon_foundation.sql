-- Migration: v2_fact_canon_foundation
-- Authored: 2026-05-26
--
-- Purpose:
--   Add the first V2 fact-level canon tables without changing the V1
--   entities.summary, entity_suggestions, Search/RAG, or Q&A flows.
--
-- Scope:
--   - canon_facts: durable fact nodes attached to approved entities
--   - canon_fact_sources: source evidence for facts
--   - fact_suggestions: review queue for future extracted fact candidates
--
-- This migration intentionally does not backfill facts from existing summaries.

BEGIN;

CREATE TABLE IF NOT EXISTS public.canon_facts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_id                  uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  fact_type                  text NOT NULL,
  fact_key                   text,
  value                      text NOT NULL,
  value_structured           jsonb,
  status                     text NOT NULL DEFAULT 'PENDING'
                               CHECK (status IN ('PENDING','APPROVED','SUPERSEDED','DISMISSED')),
  superseded_by              uuid REFERENCES public.canon_facts(id) ON DELETE SET NULL,
  confidence                 real NOT NULL DEFAULT 0.5
                               CHECK (confidence >= 0 AND confidence <= 1),
  established_chapter_id     uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  valid_from_chapter_id      uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  valid_until_chapter_id     uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  approved_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canon_facts_fact_type_check CHECK (
    fact_type IN (
      'ATTRIBUTE',
      'ROLE',
      'AFFILIATION',
      'ABILITY',
      'STATE',
      'LOCATION_INFO',
      'RULE',
      'DESCRIPTION_TEXT'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.canon_fact_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id         uuid NOT NULL REFERENCES public.canon_facts(id) ON DELETE CASCADE,
  chapter_id      uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  chunk_id        uuid REFERENCES public.chunks(id) ON DELETE SET NULL,
  evidence_text   text,
  evidence_kind   text NOT NULL DEFAULT 'DIRECT'
                    CHECK (evidence_kind IN ('DIRECT','INFERRED','DIALOGUE','NARRATION','AUTHOR_NOTE')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fact_suggestions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chapter_id            uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  entity_suggestion_id  uuid REFERENCES public.entity_suggestions(id) ON DELETE SET NULL,
  matched_entity_id     uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  fact_type             text NOT NULL,
  fact_key              text,
  value                 text NOT NULL,
  confidence            real NOT NULL DEFAULT 0.5
                           CHECK (confidence >= 0 AND confidence <= 1),
  evidence_text         text,
  status                text NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','APPROVED','DISMISSED','MERGED')),
  resulting_fact_id     uuid REFERENCES public.canon_facts(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fact_suggestions_fact_type_check CHECK (
    fact_type IN (
      'ATTRIBUTE',
      'ROLE',
      'AFFILIATION',
      'ABILITY',
      'STATE',
      'LOCATION_INFO',
      'RULE',
      'DESCRIPTION_TEXT'
    )
  )
);

DROP TRIGGER IF EXISTS set_canon_facts_updated_at ON public.canon_facts;
CREATE TRIGGER set_canon_facts_updated_at
  BEFORE UPDATE ON public.canon_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_fact_suggestions_updated_at ON public.fact_suggestions;
CREATE TRIGGER set_fact_suggestions_updated_at
  BEFORE UPDATE ON public.fact_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_canon_facts_entity_status
  ON public.canon_facts (entity_id, status);

CREATE INDEX IF NOT EXISTS idx_canon_facts_project_status
  ON public.canon_facts (project_id, status);

CREATE INDEX IF NOT EXISTS idx_canon_facts_project_type
  ON public.canon_facts (project_id, fact_type);

CREATE INDEX IF NOT EXISTS idx_canon_facts_established_chapter
  ON public.canon_facts (established_chapter_id);

CREATE UNIQUE INDEX IF NOT EXISTS canon_facts_entity_unique_active
  ON public.canon_facts (entity_id, fact_type, COALESCE(fact_key, ''), value)
  WHERE status IN ('PENDING','APPROVED');

CREATE INDEX IF NOT EXISTS idx_canon_fact_sources_fact
  ON public.canon_fact_sources (fact_id);

CREATE INDEX IF NOT EXISTS idx_canon_fact_sources_chapter
  ON public.canon_fact_sources (chapter_id);

CREATE INDEX IF NOT EXISTS idx_canon_fact_sources_chunk
  ON public.canon_fact_sources (chunk_id);

CREATE INDEX IF NOT EXISTS idx_fact_suggestions_project_status
  ON public.fact_suggestions (project_id, status);

CREATE INDEX IF NOT EXISTS idx_fact_suggestions_chapter_status
  ON public.fact_suggestions (chapter_id, status);

CREATE INDEX IF NOT EXISTS idx_fact_suggestions_matched_entity
  ON public.fact_suggestions (matched_entity_id);

CREATE INDEX IF NOT EXISTS idx_fact_suggestions_entity_suggestion
  ON public.fact_suggestions (entity_suggestion_id);

CREATE UNIQUE INDEX IF NOT EXISTS fact_suggestions_pending_unique
  ON public.fact_suggestions (
    project_id,
    chapter_id,
    COALESCE(matched_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    fact_type,
    COALESCE(fact_key, ''),
    value
  )
  WHERE status = 'PENDING';

ALTER TABLE public.canon_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canon_fact_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canon_facts_select_own ON public.canon_facts;
CREATE POLICY canon_facts_select_own
  ON public.canon_facts
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS canon_facts_insert_own ON public.canon_facts;
CREATE POLICY canon_facts_insert_own
  ON public.canon_facts
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS canon_facts_update_own ON public.canon_facts;
CREATE POLICY canon_facts_update_own
  ON public.canon_facts
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

DROP POLICY IF EXISTS canon_facts_delete_own ON public.canon_facts;
CREATE POLICY canon_facts_delete_own
  ON public.canon_facts
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS canon_fact_sources_select_own ON public.canon_fact_sources;
CREATE POLICY canon_fact_sources_select_own
  ON public.canon_fact_sources
  FOR SELECT
  USING (
    fact_id IN (
      SELECT id FROM public.canon_facts
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE user_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS canon_fact_sources_insert_own ON public.canon_fact_sources;
CREATE POLICY canon_fact_sources_insert_own
  ON public.canon_fact_sources
  FOR INSERT
  WITH CHECK (
    fact_id IN (
      SELECT id FROM public.canon_facts
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE user_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS canon_fact_sources_update_own ON public.canon_fact_sources;
CREATE POLICY canon_fact_sources_update_own
  ON public.canon_fact_sources
  FOR UPDATE
  USING (
    fact_id IN (
      SELECT id FROM public.canon_facts
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE user_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (
    fact_id IN (
      SELECT id FROM public.canon_facts
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE user_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS canon_fact_sources_delete_own ON public.canon_fact_sources;
CREATE POLICY canon_fact_sources_delete_own
  ON public.canon_fact_sources
  FOR DELETE
  USING (
    fact_id IN (
      SELECT id FROM public.canon_facts
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE user_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS fact_suggestions_select_own ON public.fact_suggestions;
CREATE POLICY fact_suggestions_select_own
  ON public.fact_suggestions
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS fact_suggestions_insert_own ON public.fact_suggestions;
CREATE POLICY fact_suggestions_insert_own
  ON public.fact_suggestions
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS fact_suggestions_update_own ON public.fact_suggestions;
CREATE POLICY fact_suggestions_update_own
  ON public.fact_suggestions
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

DROP POLICY IF EXISTS fact_suggestions_delete_own ON public.fact_suggestions;
CREATE POLICY fact_suggestions_delete_own
  ON public.fact_suggestions
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE user_id = (select auth.uid())
    )
  );

GRANT ALL ON public.canon_facts TO anon, authenticated, service_role;
GRANT ALL ON public.canon_fact_sources TO anon, authenticated, service_role;
GRANT ALL ON public.fact_suggestions TO anon, authenticated, service_role;

COMMENT ON TABLE public.canon_facts IS
  'V2 fact-level canon nodes attached to entities. Parallel to entities.summary during early V2.';

COMMENT ON TABLE public.canon_fact_sources IS
  'Source evidence for canon_facts. chunk_id is nullable so re-chunking does not delete approved fact provenance.';

COMMENT ON TABLE public.fact_suggestions IS
  'Review queue for extracted fact candidates. AI candidates are not canon until author approval creates or reuses canon_facts.';

COMMIT;
