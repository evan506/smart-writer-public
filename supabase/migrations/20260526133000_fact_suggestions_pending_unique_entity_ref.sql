-- Migration: fact_suggestions_pending_unique_entity_ref
-- Authored: 2026-05-26
--
-- Purpose:
--   Refine the V2 fact suggestion duplicate guard so two unresolved entity
--   suggestions in the same chapter may carry the same fact value independently.
--   Once a fact is attached to an approved entity, matched_entity_id remains the
--   stable duplicate key.

BEGIN;

DROP INDEX IF EXISTS public.fact_suggestions_pending_unique;

CREATE UNIQUE INDEX fact_suggestions_pending_unique
  ON public.fact_suggestions (
    project_id,
    chapter_id,
    COALESCE(matched_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(entity_suggestion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    fact_type,
    COALESCE(fact_key, ''),
    value
  )
  WHERE status = 'PENDING';

COMMIT;
