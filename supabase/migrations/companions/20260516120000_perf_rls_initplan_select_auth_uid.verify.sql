-- Verification for: 20260516120000_perf_rls_initplan_select_auth_uid.sql
--
-- Pure catalog inspection — NO data required, so this does NOT self-skip on the
-- empty replay DB. It is an authoritative schema-level gate. Run AFTER applying
-- the forward migration. Read-only: one DO block that RAISEs EXCEPTION on any
-- mismatch.
--
-- Asserts:
--   CHECK 1  public policy inventory matches the current replayed schema.
--   CHECK 2  every `auth.uid()` / `auth.role()` reference in EVERY public RLS
--            policy (qual + with_check) is wrapped in a sub-select (InitPlan).
--            i.e. zero bare per-row re-evaluations remain anywhere in public.
--            This also guarantees genre_kits / analysis_jobs (already wrapped)
--            were not regressed.
--   CHECK 3  the 37 target policies still exist by exact (table, name, cmd) —
--            proves the optimization preserved name + command (not recreated
--            with a different shape).
--
-- MAINTENANCE LOG (CHECK 1 global policy count only):
--   2026-05-16  initial: 67 public policies.
--   2026-06-22  re-baselined 67 -> 83 (MEASURED from the disposable
--               `pnpm db:replay-verify` DB, not estimated). The +16 policies come
--               from two later table-adding migrations: 20260614120000_v3_2_
--               extraction_memory (+4) and 20260621120000_v3_3_plot_threads
--               (+12: 4 owner policies on each of plot_threads,
--               plot_thread_planning_blocks, plot_thread_chapters).
--               CHECK 2 and CHECK 3 are behavioral/existence checks and are
--               intentionally unchanged.

DO $$
DECLARE
  v_policies     int;
  v_bare         text;
  v_missing      text;
BEGIN
  -- -------------------------------------------------------------------------
  -- CHECK 1: policy inventory unchanged.
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname = 'public';
  IF v_policies <> 83 THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: public policies expected 83, got %', v_policies;
  END IF;

  -- -------------------------------------------------------------------------
  -- CHECK 2: no bare auth.uid()/auth.role() anywhere in public RLS policies.
  -- For each policy, the number of auth.<fn>() tokens must equal the number
  -- that are immediately preceded by `select` (i.e. wrapped as an InitPlan
  -- sub-select). A leftover bare call makes total > wrapped.
  -- -------------------------------------------------------------------------
  SELECT string_agg(tablename || '.' || policyname || ' [' || cmd || ']', ', ')
    INTO v_bare
  FROM (
    SELECT
      p.tablename,
      p.policyname,
      p.cmd,
      coalesce(pg_get_expr(pol.polqual,      pol.polrelid), '') || ' '
        || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS expr
    FROM pg_policies p
    JOIN pg_class      c   ON c.relname  = p.tablename
    JOIN pg_namespace  n   ON n.oid      = c.relnamespace
                          AND n.nspname  = p.schemaname
                          AND n.nspname  = 'public'
    JOIN pg_policy     pol ON pol.polrelid = c.oid
                          AND pol.polname  = p.policyname
  ) q
  WHERE regexp_count(expr, 'auth\.(uid|role)\(\)', 1, 'i')
      > regexp_count(expr, 'select\s+auth\.(uid|role)\(\)', 1, 'i');

  IF v_bare IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK 2 FAILED: bare per-row auth.<fn>() still present in: %', v_bare;
  END IF;

  -- -------------------------------------------------------------------------
  -- CHECK 3: all 37 optimized policies still exist with the same name+command.
  -- -------------------------------------------------------------------------
  SELECT string_agg(t || ' :: ' || pn || ' [' || cm || ']', ', ')
    INTO v_missing
  FROM (
    VALUES
      ('projects','Users can delete own projects','DELETE'),
      ('projects','Users can insert own projects','INSERT'),
      ('projects','Users can update own projects','UPDATE'),
      ('projects','Users can view own projects','SELECT'),
      ('chapters','Users can delete chapters in own projects','DELETE'),
      ('chapters','Users can insert chapters in own projects','INSERT'),
      ('chapters','Users can update chapters in own projects','UPDATE'),
      ('chapters','Users can view chapters in own projects','SELECT'),
      ('entities','Users can delete entities in own projects','DELETE'),
      ('entities','Users can insert entities in own projects','INSERT'),
      ('entities','Users can update entities in own projects','UPDATE'),
      ('entities','Users can view entities in own projects','SELECT'),
      ('entity_suggestions','Users can delete suggestions for their projects','DELETE'),
      ('entity_suggestions','Users can insert suggestions for their projects','INSERT'),
      ('entity_suggestions','Users can update suggestions for their projects','UPDATE'),
      ('entity_suggestions','Users can view suggestions for their projects','SELECT'),
      ('foreshadows','Users can delete foreshadows in own projects','DELETE'),
      ('foreshadows','Users can insert foreshadows in own projects','INSERT'),
      ('foreshadows','Users can update foreshadows in own projects','UPDATE'),
      ('foreshadows','Users can view foreshadows in own projects','SELECT'),
      ('rag_logs','Users can insert rag logs in own projects','INSERT'),
      ('rag_logs','Users can view rag logs in own projects','SELECT'),
      ('chunks','Users can delete chunks in own projects','DELETE'),
      ('chunks','Users can insert chunks in own projects','INSERT'),
      ('chunks','Users can update chunks in own projects','UPDATE'),
      ('chunks','Users can view chunks in own projects','SELECT'),
      ('entity_links','Users can delete own entity links','DELETE'),
      ('entity_links','Users can insert own entity links','INSERT'),
      ('entity_links','Users can update own entity links','UPDATE'),
      ('entity_links','Users can view own entity links','SELECT'),
      ('mentions','Users can delete mentions in own projects','DELETE'),
      ('mentions','Users can insert mentions in own projects','INSERT'),
      ('mentions','Users can update mentions in own projects','UPDATE'),
      ('mentions','Users can view mentions in own projects','SELECT'),
      ('chat_conversations','Users manage own conversations','ALL'),
      ('chat_messages','Users manage own messages','ALL'),
      ('personas','Users manage own personas','ALL')
  ) AS want(t, pn, cm)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename  = want.t
      AND p.policyname = want.pn
      AND p.cmd        = want.cm
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: expected target policies missing/renamed: %', v_missing;
  END IF;

  RAISE NOTICE 'RLS INITPLAN VERIFY PASSED: 83 public policies, 0 bare auth.<fn>() (all InitPlan-wrapped), 37 target policies intact.';
END
$$;
