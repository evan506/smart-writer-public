-- Verification for: 20260515130000_search_pg_trgm_korean.sql
--
-- Read-only / rolled-back checks. Run AFTER applying the forward migration.
-- Nothing here mutates committed state.

-- ===========================================================================
-- CHECK 1: pg_trgm extension installed (in `extensions` schema).
-- Expect: 1 row, extname = pg_trgm, schema = extensions.
-- ===========================================================================
SELECT e.extname, n.nspname AS schema, e.extversion
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'pg_trgm';

-- ===========================================================================
-- CHECK 2: the 4 trigram GIN indexes exist.
-- Expect: 4 rows.
-- ===========================================================================
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_entities_name_trgm',
    'idx_entities_summary_trgm',
    'idx_chapters_title_trgm',
    'idx_chapters_content_trgm'
  )
ORDER BY indexname;

-- ===========================================================================
-- CHECK 3: RPC return contracts are byte-identical to the generated types.
-- Expect search_entities_bm25:
--   id uuid, name text, type text, description text, settings jsonb,
--   rank double precision
-- Expect search_chapters_bm25:
--   id uuid, chapter_num integer, title text, content text, summary text,
--   rank double precision
-- (pg_get_function_result lists OUT columns in declared order.)
-- ===========================================================================
SELECT p.proname,
       p.prosecdef                       AS security_definer,   -- expect true
       pg_get_function_arguments(p.oid)  AS args,
       pg_get_function_result(p.oid)     AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('search_entities_bm25', 'search_chapters_bm25')
ORDER BY p.proname;

-- ===========================================================================
-- CHECK 4: Korean partial query now returns > 0 for an entity that exists.
-- Picks a real project + a real entity name substring (first 2 chars),
-- runs the RPC AS the project owner inside a rolled-back tx, asserts > 0.
-- Proves the "북쪽 exists but search returned 0" class of bug is fixed:
-- a partial token of an existing name now matches.
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_project   uuid;
  v_owner     uuid;
  v_name      text;
  v_partial   text;
  v_hits      int;
BEGIN
  -- Find a project that has at least one entity with a name >= 2 chars.
  SELECT e.project_id, p.user_id, e.name
    INTO v_project, v_owner, v_name
  FROM public.entities e
  JOIN public.projects p ON p.id = e.project_id
  WHERE char_length(e.name) >= 2
  ORDER BY char_length(e.name) DESC
  LIMIT 1;

  IF v_project IS NULL THEN
    RAISE NOTICE 'CHECK 4 SKIPPED: no entities with name length >= 2.';
    RETURN;
  END IF;

  -- Use the first 2 characters of the name as a partial Korean-ish query.
  v_partial := substr(v_name, 1, 2);

  -- Impersonate the project owner so the SECURITY DEFINER ownership guard
  -- (auth.uid() = projects.user_id) passes. request.jwt.claim.sub is what
  -- Supabase's auth.uid() reads.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_hits
  FROM public.search_entities_bm25(v_project, v_partial, 10);

  IF v_hits > 0 THEN
    RAISE NOTICE 'CHECK 4 PASSED: search_entities_bm25(%, %) returned % row(s) (name was "%").',
      v_project, v_partial, v_hits, v_name;
  ELSE
    RAISE EXCEPTION 'CHECK 4 FAILED: partial query "%" returned 0 rows for an existing entity "%" in project %.',
      v_partial, v_name, v_project;
  END IF;
END
$$;
ROLLBACK;  -- discard any set_config / transaction-local state

-- ===========================================================================
-- CHECK 5: trigram index is actually used (no seq scan).
-- Expect EXPLAIN output to contain a "Bitmap Index Scan on
-- idx_entities_name_trgm" (or idx_entities_summary_trgm). Inspect the
-- returned plan text. We test the underlying predicate directly (the RPC is
-- SECURITY DEFINER so EXPLAIN on it does not expose the inner plan).
-- Replace the project id / query if needed for a populated environment.
-- ===========================================================================
DO $$
DECLARE
  v_project uuid;
  v_query   text;
  v_plan    text;
BEGIN
  SELECT e.project_id, substr(e.name, 1, 2)
    INTO v_project, v_query
  FROM public.entities e
  WHERE char_length(e.name) >= 2
  LIMIT 1;

  IF v_project IS NULL THEN
    RAISE NOTICE 'CHECK 5 SKIPPED: no entities to plan against.';
    RETURN;
  END IF;

  -- pg_trgm `%` uses the GUC threshold; set it like the RPC does.
  PERFORM set_config('pg_trgm.similarity_threshold', '0.1', true);

  FOR v_plan IN
    EXECUTE format(
      'EXPLAIN SELECT e.id FROM public.entities e '
      'WHERE e.project_id = %L AND (e.name %% %L OR coalesce(e.summary,'''') %% %L)',
      v_project, v_query, v_query)
  LOOP
    RAISE NOTICE '%', v_plan;
  END LOOP;
  RAISE NOTICE 'CHECK 5: inspect plan above for "Bitmap Index Scan on idx_entities_*_trgm" (NOT "Seq Scan").';
END
$$;

-- ===========================================================================
-- CHECK 6: ownership guard still rejects non-owners.
-- Calls search_entities_bm25 for a project while impersonating a DIFFERENT
-- user; must return 0 rows. Rolled back.
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_project uuid;
  v_owner   uuid;
  v_other   uuid;
  v_hits    int;
BEGIN
  SELECT e.project_id, p.user_id
    INTO v_project, v_owner
  FROM public.entities e
  JOIN public.projects p ON p.id = e.project_id
  WHERE char_length(e.name) >= 2
  LIMIT 1;

  IF v_project IS NULL THEN
    RAISE NOTICE 'CHECK 6 SKIPPED: no test project.';
    RETURN;
  END IF;

  -- A different user id (any auth user that is not the owner; fall back to a
  -- random uuid which is guaranteed not to own the project).
  SELECT id INTO v_other FROM auth.users WHERE id <> v_owner LIMIT 1;
  IF v_other IS NULL THEN
    v_other := gen_random_uuid();
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_hits
  FROM public.search_entities_bm25(v_project, 'a', 10);

  IF v_hits = 0 THEN
    RAISE NOTICE 'CHECK 6 PASSED: non-owner got 0 rows (ownership guard intact).';
  ELSE
    RAISE EXCEPTION 'CHECK 6 FAILED: non-owner received % rows — ownership guard broken!', v_hits;
  END IF;
END
$$;
ROLLBACK;
