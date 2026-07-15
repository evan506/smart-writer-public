-- Migration: v2_pending_fact_review_items_rpc
-- Authored: 2026-05-27
--
-- Purpose:
--   Expose the pending fact review queue as a DB read model. This keeps the
--   V2 fact review contract close to the fact-node schema:
--
--     fact_suggestions -> resolved entity -> active canon_facts -> sources
--
--   The function is read-only. It does not create, approve, supersede, dismiss,
--   or otherwise mutate canon.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_pending_fact_review_items(
  p_project_id uuid
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  chapter_id uuid,
  chapter_num integer,
  chapter_title text,
  entity_id uuid,
  entity_name text,
  entity_suggestion_id uuid,
  entity_suggestion_name text,
  fact_type text,
  fact_key text,
  value text,
  evidence_text text,
  confidence real,
  can_approve boolean,
  existing_fact_id uuid,
  existing_source_count integer,
  approval_mode text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  WITH pending AS (
    SELECT
      fs.id,
      fs.project_id,
      fs.chapter_id,
      fs.entity_suggestion_id,
      fs.matched_entity_id,
      fs.fact_type,
      fs.fact_key,
      fs.value,
      fs.evidence_text,
      fs.confidence,
      fs.created_at,
      es.name AS entity_suggestion_name,
      COALESCE(fs.matched_entity_id, es.matched_entity_id) AS resolved_entity_id
    FROM public.fact_suggestions fs
    LEFT JOIN public.entity_suggestions es
      ON es.id = fs.entity_suggestion_id
     AND es.project_id = fs.project_id
    WHERE fs.project_id = p_project_id
      AND fs.status = 'PENDING'
      AND EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = fs.project_id
          AND p.user_id = (select auth.uid())
      )
  )
  SELECT
    pending.id,
    pending.project_id,
    pending.chapter_id,
    chapters.chapter_num,
    chapters.title AS chapter_title,
    pending.resolved_entity_id AS entity_id,
    entities.name AS entity_name,
    pending.entity_suggestion_id,
    pending.entity_suggestion_name,
    pending.fact_type,
    pending.fact_key,
    pending.value,
    pending.evidence_text,
    pending.confidence,
    (pending.resolved_entity_id IS NOT NULL) AS can_approve,
    existing_fact.id AS existing_fact_id,
    COALESCE(source_counts.source_count, 0)::integer AS existing_source_count,
    CASE
      WHEN pending.resolved_entity_id IS NULL THEN 'WAIT_FOR_ENTITY'
      WHEN existing_fact.id IS NOT NULL THEN 'ADD_SOURCE'
      ELSE 'CREATE_FACT'
    END AS approval_mode
  FROM pending
  LEFT JOIN public.chapters chapters
    ON chapters.id = pending.chapter_id
   AND chapters.project_id = pending.project_id
  LEFT JOIN public.entities entities
    ON entities.id = pending.resolved_entity_id
   AND entities.project_id = pending.project_id
  LEFT JOIN LATERAL (
    SELECT cf.id
    FROM public.canon_facts cf
    WHERE cf.project_id = pending.project_id
      AND cf.entity_id = pending.resolved_entity_id
      AND cf.fact_type = pending.fact_type
      AND COALESCE(cf.fact_key, '') = COALESCE(pending.fact_key, '')
      AND cf.value = pending.value
      AND cf.status IN ('PENDING', 'APPROVED')
    ORDER BY cf.created_at ASC
    LIMIT 1
  ) existing_fact ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS source_count
    FROM public.canon_fact_sources cfs
    WHERE cfs.fact_id = existing_fact.id
  ) source_counts ON true
  ORDER BY pending.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_fact_review_items(uuid)
  TO anon, authenticated, service_role;

COMMIT;
