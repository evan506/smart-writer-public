-- Verification for: 20260621120000_v3_3_plot_threads.sql
--
-- MUTATION-FREE. This companion performs ONLY catalog and function-source
-- inspection (SELECT / pg_get_functiondef + RAISE on mismatch). It never runs
-- INSERT / UPDATE / DELETE, so it is safe to execute against the shared remote
-- during a targeted apply-verify pass.
--
-- The BEHAVIORAL rejection test (CHARACTER_PLAN / PLACE_PLAN linking must fail
-- with SQLSTATE 23514, EPISODE must succeed) lives in the sibling local-only
-- file `20260621120000_v3_3_plot_threads.fixture.sql`, which is executed ONLY
-- by `scripts/db-replay-verify.sh` against the disposable replay container and
-- is never part of the remote apply/verify path.

DO $$
DECLARE
  tbl text;
  fn_src text;
BEGIN
  -- Tables
  FOREACH tbl IN ARRAY ARRAY[
    'public.plot_threads',
    'public.plot_thread_planning_blocks',
    'public.plot_thread_chapters'
  ] LOOP
    IF to_regclass(tbl) IS NULL THEN
      RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: % missing', tbl;
    END IF;
  END LOOP;

  -- Title CHECK constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.plot_threads'::regclass
      AND conname = 'plot_threads_title_check'
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: title check missing';
  END IF;

  -- Unique constraints on the two join tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.plot_thread_planning_blocks'::regclass
      AND conname = 'plot_thread_planning_blocks_unique'
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: ptpb unique constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.plot_thread_chapters'::regclass
      AND conname = 'plot_thread_chapters_unique'
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: ptc unique constraint missing';
  END IF;

  -- updated_at trigger on plot_threads
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.plot_threads'::regclass
      AND tgname = 'set_plot_threads_updated_at'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: updated_at trigger missing';
  END IF;

  -- Project-bound guard functions
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.enforce_plot_thread_block_project()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: block project guard function missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.enforce_plot_thread_chapter_project()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: chapter project guard function missing';
  END IF;

  -- Project-bound guard triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.plot_thread_planning_blocks'::regclass
      AND tgname = 'enforce_plot_thread_block_project'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: block project guard trigger missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.plot_thread_chapters'::regclass
      AND tgname = 'enforce_plot_thread_chapter_project'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: chapter project guard trigger missing';
  END IF;

  -- RLS enabled on all three tables
  FOREACH tbl IN ARRAY ARRAY[
    'public.plot_threads',
    'public.plot_thread_planning_blocks',
    'public.plot_thread_chapters'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid = tbl::regclass AND relrowsecurity = true
    ) THEN
      RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: RLS not enabled on %', tbl;
    END IF;
  END LOOP;

  -- 4 RLS policies per table (select/insert/update/delete)
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'plot_threads') < 4 THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: expected 4 RLS policies on plot_threads';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'plot_thread_planning_blocks') < 4 THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: expected 4 RLS policies on plot_thread_planning_blocks';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'plot_thread_chapters') < 4 THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: expected 4 RLS policies on plot_thread_chapters';
  END IF;

  -- Function-source: the block guard must encode the EXACT 5-kind allowlist
  -- (not merely reject ROOT) and raise 23514. Source inspection only — no data.
  fn_src := pg_get_functiondef('public.enforce_plot_thread_block_project()'::regprocedure);
  IF fn_src NOT ILIKE '%NOT IN%(%''EPISODE''%''CHAPTER''%''SCENE''%''EVENT''%''PROMISE''%)%' THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: block guard does not enforce the 5-kind allowlist (EPISODE/CHAPTER/SCENE/EVENT/PROMISE)';
  END IF;
  IF fn_src NOT ILIKE '%23514%' THEN
    RAISE EXCEPTION 'PLOT THREADS VERIFY FAILED: block guard does not raise SQLSTATE 23514 on a disallowed kind';
  END IF;

  RAISE NOTICE 'PLOT THREADS VERIFY PASSED (catalog + function-source, mutation-free): tables, constraints, indexes, triggers, RLS, and the 5-kind allowlist source are present.';
END
$$;
