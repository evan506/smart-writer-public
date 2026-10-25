-- QA may explicitly select 0.25; omitted arguments retain the previous 0.3.
-- Replace the old signature rather than leave ambiguous PostgREST overloads.
-- Rank, whole-string threshold, ordering, limit, ownership and ACLs are preserved.
BEGIN;

DROP FUNCTION public.search_chapters_bm25(uuid, text, integer);

CREATE FUNCTION public.search_chapters_bm25(
  p_project_id uuid,
  p_query text,
  p_limit integer DEFAULT 10,
  p_word_threshold double precision DEFAULT 0.3
)
 RETURNS TABLE(
   id uuid,
   chapter_num integer,
   title text,
   content text,
   summary text,
   rank double precision
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Project-ownership guard (same semantics as search_entities_bm25).
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  IF p_word_threshold IS NULL OR p_word_threshold NOT IN (0.25, 0.3) THEN
    RAISE EXCEPTION 'Unsupported chapter word similarity threshold'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('pg_trgm.similarity_threshold', '0.1', true);

  RETURN QUERY
  SELECT
    c.id,
    c.chapter_num,
    c.title,
    c.content,
    c.summary,
    GREATEST(
      similarity(coalesce(c.title, ''), p_query),
      similarity(coalesce(c.content, ''), p_query),
      word_similarity(p_query, coalesce(c.title, '')),
      word_similarity(p_query, coalesce(c.content, ''))
    )::double precision     AS rank
  FROM public.chapters c
  WHERE c.project_id = p_project_id
    AND (
      coalesce(c.title, '') % p_query
      OR coalesce(c.content, '') % p_query
      OR word_similarity(p_query, coalesce(c.title, '')) > p_word_threshold
      OR word_similarity(p_query, coalesce(c.content, '')) > p_word_threshold
    )
    AND GREATEST(
      similarity(coalesce(c.title, ''), p_query),
      similarity(coalesce(c.content, ''), p_query),
      word_similarity(p_query, coalesce(c.title, '')),
      word_similarity(p_query, coalesce(c.content, ''))
    ) > 0.1
  ORDER BY rank DESC, c.chapter_num ASC
  LIMIT p_limit;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.search_chapters_bm25(uuid, text, integer, double precision)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_chapters_bm25(uuid, text, integer, double precision)
  TO authenticated, service_role;

COMMIT;
