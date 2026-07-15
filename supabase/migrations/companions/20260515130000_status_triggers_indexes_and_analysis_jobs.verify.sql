-- Verification for: 20260515130000_status_triggers_indexes_and_analysis_jobs.sql
--
-- Read-only structural checks plus rolled-back transactions that PROVE the
-- behaviour (trigger refreshes updated_at; partial unique blocks a second
-- active job). All mutating statements run inside BEGIN ... ROLLBACK so no
-- test data persists. Run AFTER applying the forward migration.

-- ===========================================================================
-- CHECK 1: the three missing updated_at triggers now exist.
-- Expect: 3 rows (set_entity_suggestions_updated_at,
--         set_personas_updated_at, set_chat_conversations_updated_at),
--         all calling update_updated_at_column, all BEFORE UPDATE.
-- ===========================================================================
SELECT
  c.relname            AS table_name,
  t.tgname             AS trigger_name,
  p.proname            AS function_name,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND c.relnamespace = 'public'::regnamespace
  AND t.tgname IN (
    'set_entity_suggestions_updated_at',
    'set_personas_updated_at',
    'set_chat_conversations_updated_at'
  )
ORDER BY c.relname, t.tgname;

-- ===========================================================================
-- CHECK 2: the trigger ACTUALLY refreshes updated_at on UPDATE.
-- Picks any existing entity_suggestions row, forces updated_at into the
-- past, performs a no-op UPDATE, and asserts updated_at advanced to ~now().
-- Entire block is ROLLED BACK -> no committed change.
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_id      uuid;
  v_before  timestamptz;
  v_after   timestamptz;
BEGIN
  SELECT id INTO v_id FROM public.entity_suggestions LIMIT 1;

  IF v_id IS NULL THEN
    RAISE NOTICE 'CHECK 2 SKIPPED: entity_suggestions is empty.';
    RETURN;
  END IF;

  -- Push updated_at far into the past so the diff is unambiguous.
  UPDATE public.entity_suggestions
     SET updated_at = now() - interval '10 days'
   WHERE id = v_id;
  SELECT updated_at INTO v_before FROM public.entity_suggestions WHERE id = v_id;

  -- No-op-ish UPDATE: trigger must overwrite updated_at with now().
  UPDATE public.entity_suggestions
     SET name = name
   WHERE id = v_id;
  SELECT updated_at INTO v_after FROM public.entity_suggestions WHERE id = v_id;

  IF v_after > v_before AND v_after >= now() - interval '1 minute' THEN
    RAISE NOTICE 'CHECK 2 PASSED: updated_at refreshed by trigger (% -> %)', v_before, v_after;
  ELSE
    RAISE EXCEPTION 'CHECK 2 FAILED: updated_at not refreshed (before=% after=%)', v_before, v_after;
  END IF;
END
$$;
ROLLBACK;

-- ===========================================================================
-- CHECK 3: new entity_suggestions indexes exist.
-- Expect: 2 rows.
-- ===========================================================================
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'entity_suggestions'
  AND indexname IN (
    'idx_entity_suggestions_chapter_status',
    'idx_entity_suggestions_updated_at'
  )
ORDER BY indexname;

-- ===========================================================================
-- CHECK 4: analysis_jobs table, columns, FKs and CHECK constraint.
-- Expect column list incl. status CHECK IN (QUEUED,RUNNING,DONE,FAILED)
-- and two ON DELETE CASCADE FKs to projects/chapters.
-- ===========================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'analysis_jobs'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.analysis_jobs'::regclass
ORDER BY conname;

-- analysis_jobs indexes (incl. the partial unique guard + updated_at trigger).
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'analysis_jobs'
ORDER BY indexname;

SELECT t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.oid = 'public.analysis_jobs'::regclass
  AND NOT t.tgisinternal;

-- ===========================================================================
-- CHECK 5: analysis_jobs RLS is ENABLED and the 4 ownership policies exist.
-- Expect: relrowsecurity = true; 4 policies, each with the
--         "project_id IN (SELECT id FROM projects WHERE user_id = ...)" qual.
-- ===========================================================================
SELECT relname, relrowsecurity
FROM pg_class
WHERE oid = 'public.analysis_jobs'::regclass;

SELECT polname, cmd, qual, with_check
FROM (
  SELECT
    pol.polname,
    pol.polcmd::text AS cmd,
    pg_get_expr(pol.polqual,      pol.polrelid) AS qual,
    pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.analysis_jobs'::regclass
) p
ORDER BY polname;

-- ===========================================================================
-- CHECK 6: the partial UNIQUE index BLOCKS a second active job per chapter.
-- Inserts a QUEUED job for some chapter, then a second RUNNING job for the
-- SAME chapter (must raise unique_violation). A DONE job for the same
-- chapter must still be allowed (proves the WHERE predicate is correct).
-- Entire block ROLLED BACK -> no test data persists.
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_project uuid;
  v_chapter uuid;
BEGIN
  SELECT c.project_id, c.id
    INTO v_project, v_chapter
  FROM public.chapters c
  LIMIT 1;

  IF v_chapter IS NULL THEN
    RAISE NOTICE 'CHECK 6 SKIPPED: need >= 1 chapter to test.';
    RETURN;
  END IF;

  -- First active job: QUEUED — should succeed.
  INSERT INTO public.analysis_jobs (project_id, chapter_id, status)
  VALUES (v_project, v_chapter, 'QUEUED');

  -- Second active job for the SAME chapter: RUNNING — must be rejected.
  BEGIN
    INSERT INTO public.analysis_jobs (project_id, chapter_id, status)
    VALUES (v_project, v_chapter, 'RUNNING');
    RAISE EXCEPTION 'CHECK 6 FAILED: 2nd active job ACCEPTED (guard not enforced)';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'CHECK 6a PASSED: 2nd active job rejected by analysis_jobs_active_chapter_uniq';
  END;

  -- A terminal (DONE) job for the same chapter must still be allowed.
  INSERT INTO public.analysis_jobs (project_id, chapter_id, status)
  VALUES (v_project, v_chapter, 'DONE');
  RAISE NOTICE 'CHECK 6b PASSED: terminal (DONE) job for same chapter allowed';
END
$$;
ROLLBACK;
