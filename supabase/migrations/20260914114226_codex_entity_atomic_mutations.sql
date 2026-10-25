-- Make entity merge/delete all-or-nothing database operations.

BEGIN;

CREATE FUNCTION public.merge_codex_entity_as_alias(
  p_project_id uuid,
  p_source_entity_id uuid,
  p_target_entity_id uuid
)
RETURNS TABLE (
  source_name text,
  target_name text,
  target_summary text,
  target_aliases jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO public
AS $$
DECLARE
  v_source public.entities%ROWTYPE;
  v_target public.entities%ROWTYPE;
  v_aliases jsonb;
  v_duplicate record;
BEGIN
  IF p_source_entity_id = p_target_entity_id THEN
    RAISE EXCEPTION '같은 항목으로는 합칠 수 없습니다';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = p_project_id
      AND user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION '프로젝트를 수정할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  -- Lock in stable UUID order so concurrent merges do not deadlock.
  PERFORM id
  FROM public.entities
  WHERE id IN (p_source_entity_id, p_target_entity_id)
    AND project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_source
  FROM public.entities
  WHERE id = p_source_entity_id
    AND project_id = p_project_id;

  SELECT * INTO v_target
  FROM public.entities
  WHERE id = p_target_entity_id
    AND project_id = p_project_id;

  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION '같은 프로젝트의 작품 기억 항목만 합칠 수 있습니다';
  END IF;

  SELECT COALESCE(jsonb_agg(item.value ORDER BY item.group_order, item.item_order), '[]'::jsonb)
  INTO v_aliases
  FROM (
    SELECT DISTINCT ON (lower(candidate.value))
      candidate.value,
      candidate.group_order,
      candidate.item_order
    FROM (
      SELECT btrim(value) AS value, 1 AS group_order, ordinality::integer AS item_order
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_target.aliases) = 'array' THEN v_target.aliases ELSE '[]'::jsonb END
      ) WITH ORDINALITY
      UNION ALL
      SELECT btrim(v_source.name), 2, 1
      UNION ALL
      SELECT btrim(value), 3, ordinality::integer
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_source.aliases) = 'array' THEN v_source.aliases ELSE '[]'::jsonb END
      ) WITH ORDINALITY
    ) candidate
    WHERE candidate.value <> ''
      AND lower(candidate.value) <> lower(v_target.name)
    ORDER BY lower(candidate.value), candidate.group_order, candidate.item_order
  ) item;

  UPDATE public.entities
  SET aliases = v_aliases
  WHERE id = p_target_entity_id;

  UPDATE public.entity_suggestions
  SET matched_entity_id = p_target_entity_id
  WHERE project_id = p_project_id
    AND matched_entity_id = p_source_entity_id;

  -- Pending fact candidates have a partial unique index. Keep the target copy.
  DELETE FROM public.fact_suggestions source
  WHERE source.project_id = p_project_id
    AND source.matched_entity_id = p_source_entity_id
    AND source.status = 'PENDING'
    AND EXISTS (
      SELECT 1
      FROM public.fact_suggestions target
      WHERE target.project_id = source.project_id
        AND target.chapter_id = source.chapter_id
        AND target.matched_entity_id = p_target_entity_id
        AND target.fact_type = source.fact_type
        AND COALESCE(target.fact_key, '') = COALESCE(source.fact_key, '')
        AND target.value = source.value
        AND target.status = 'PENDING'
    );

  UPDATE public.fact_suggestions
  SET matched_entity_id = p_target_entity_id
  WHERE project_id = p_project_id
    AND matched_entity_id = p_source_entity_id;

  INSERT INTO public.mentions AS existing (chunk_id, entity_id, count, last_mentioned_at)
  SELECT chunk_id, p_target_entity_id, count, last_mentioned_at
  FROM public.mentions
  WHERE entity_id = p_source_entity_id
  ON CONFLICT (chunk_id, entity_id) DO UPDATE
  SET count = COALESCE(existing.count, 0) + COALESCE(EXCLUDED.count, 0),
      last_mentioned_at = GREATEST(existing.last_mentioned_at, EXCLUDED.last_mentioned_at);

  DELETE FROM public.mentions WHERE entity_id = p_source_entity_id;

  INSERT INTO public.entity_links AS existing (
    from_id, to_id, relation_type, weight, direction, description, created_at
  )
  SELECT
    CASE WHEN from_id = p_source_entity_id THEN p_target_entity_id ELSE from_id END,
    CASE WHEN to_id = p_source_entity_id THEN p_target_entity_id ELSE to_id END,
    relation_type,
    weight,
    direction,
    description,
    created_at
  FROM public.entity_links
  WHERE (from_id = p_source_entity_id OR to_id = p_source_entity_id)
    AND CASE WHEN from_id = p_source_entity_id THEN p_target_entity_id ELSE from_id END
        <> CASE WHEN to_id = p_source_entity_id THEN p_target_entity_id ELSE to_id END
  ON CONFLICT (from_id, to_id, relation_type) DO UPDATE
  SET weight = GREATEST(existing.weight, EXCLUDED.weight),
      direction = CASE
        WHEN existing.direction = 'BI' OR EXCLUDED.direction = 'BI' THEN 'BI'
        ELSE existing.direction
      END,
      description = COALESCE(existing.description, EXCLUDED.description),
      created_at = LEAST(existing.created_at, EXCLUDED.created_at);

  DELETE FROM public.entity_links
  WHERE from_id = p_source_entity_id OR to_id = p_source_entity_id;

  PERFORM id
  FROM public.canon_facts
  WHERE project_id = p_project_id
    AND entity_id IN (p_source_entity_id, p_target_entity_id)
  ORDER BY id
  FOR UPDATE;

  FOR v_duplicate IN
    SELECT source.id AS source_fact_id, target.id AS target_fact_id
    FROM public.canon_facts source
    JOIN public.canon_facts target
      ON target.project_id = source.project_id
     AND target.entity_id = p_target_entity_id
     AND target.fact_type = source.fact_type
     AND COALESCE(target.fact_key, '') = COALESCE(source.fact_key, '')
     AND target.value = source.value
     AND target.status IN ('PENDING', 'APPROVED')
    WHERE source.project_id = p_project_id
      AND source.entity_id = p_source_entity_id
      AND source.status IN ('PENDING', 'APPROVED')
  LOOP
    UPDATE public.canon_fact_sources
    SET fact_id = v_duplicate.target_fact_id
    WHERE fact_id = v_duplicate.source_fact_id;

    UPDATE public.fact_suggestions
    SET resulting_fact_id = v_duplicate.target_fact_id
    WHERE resulting_fact_id = v_duplicate.source_fact_id;

    UPDATE public.canon_facts
    SET superseded_by = v_duplicate.target_fact_id
    WHERE superseded_by = v_duplicate.source_fact_id;

    DELETE FROM public.canon_facts WHERE id = v_duplicate.source_fact_id;
  END LOOP;

  UPDATE public.canon_facts
  SET entity_id = p_target_entity_id
  WHERE project_id = p_project_id
    AND entity_id = p_source_entity_id;

  UPDATE public.personas
  SET entity_id = p_target_entity_id
  WHERE entity_id = p_source_entity_id;

  UPDATE public.foreshadows
  SET entity_ids = (
    SELECT array_agg(deduped.entity_id ORDER BY deduped.first_position)
    FROM (
      SELECT entity_id, min(position) AS first_position
      FROM unnest(array_replace(entity_ids, p_source_entity_id, p_target_entity_id))
        WITH ORDINALITY AS ids(entity_id, position)
      GROUP BY entity_id
    ) deduped
  )
  WHERE project_id = p_project_id
    AND p_source_entity_id = ANY(entity_ids);

  DELETE FROM public.entities WHERE id = p_source_entity_id;

  RETURN QUERY SELECT v_source.name, v_target.name, v_target.summary, v_aliases;
END;
$$;

CREATE FUNCTION public.delete_codex_entity(
  p_project_id uuid,
  p_entity_id uuid,
  p_block_term boolean DEFAULT false
)
RETURNS TABLE (
  entity_name text,
  excluded_term_added boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO public
AS $$
DECLARE
  v_entity public.entities%ROWTYPE;
  v_term_added boolean := false;
  v_excluded_terms jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = p_project_id
      AND user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION '프로젝트를 수정할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_entity
  FROM public.entities
  WHERE id = p_entity_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF v_entity.id IS NULL THEN
    RAISE EXCEPTION '삭제할 작품 기억 항목을 찾을 수 없습니다';
  END IF;

  UPDATE public.foreshadows
  SET entity_ids = ARRAY(
    SELECT item_id
    FROM unnest(entity_ids) AS ids(item_id)
    WHERE item_id <> p_entity_id
  )
  WHERE project_id = p_project_id
    AND p_entity_id = ANY(entity_ids);

  IF p_block_term THEN
    SELECT CASE
      WHEN jsonb_typeof(COALESCE(excluded_terms, '[]'::jsonb)) = 'array'
        THEN COALESCE(excluded_terms, '[]'::jsonb)
      ELSE '[]'::jsonb
    END
    INTO v_excluded_terms
    FROM public.projects
    WHERE id = p_project_id
    FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_excluded_terms) AS term
      WHERE term = v_entity.name
    ) THEN
      UPDATE public.projects
      SET excluded_terms = v_excluded_terms || jsonb_build_array(v_entity.name)
      WHERE id = p_project_id;
      v_term_added := true;
    END IF;
  END IF;

  DELETE FROM public.entities WHERE id = p_entity_id;

  RETURN QUERY SELECT v_entity.name, v_term_added;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_codex_entity_as_alias(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_codex_entity(uuid, uuid, boolean)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_codex_entity_as_alias(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_codex_entity(uuid, uuid, boolean)
  TO authenticated, service_role;

COMMIT;
