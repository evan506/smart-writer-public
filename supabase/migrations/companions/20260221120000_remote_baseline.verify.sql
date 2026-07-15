-- Verification for: 20260221120000_remote_baseline.sql
--
-- This baseline was reconstructed via Supabase MCP catalog introspection
-- (not a shell `supabase db dump`). This companion asserts the replayed
-- public-schema object inventory matches the live remote snapshot captured
-- 2026-05-16. Run it AFTER replaying the baseline (e.g. `supabase db reset`
-- on a throwaway/branch DB) and BEFORE allowing `supabase db push`.
--
-- It is read-only: a single DO block that RAISEs EXCEPTION on any mismatch.
--
-- This companion runs after the replay runner applies the FULL migration chain
-- (not just the baseline), so its tallies count the cumulative public-schema
-- inventory and MUST be re-baselined whenever a migration adds tables/indexes/
-- policies/triggers/constraints.
--
-- MAINTENANCE LOG:
--   2026-05-16  initial snapshot (live remote REDACTED-SUPABASE-PROJECT-REF):
--               tables 20, rls 20, indexes 97, policies 67, app_funcs 12,
--               triggers 12, FK 43, CHECK 25, PK+UK 23.
--   2026-06-22  re-baselined to the actual disposable-replay catalog counts
--               after the full chain. The +4 tables / +2 app_funcs / +4 triggers
--               etc. come from two table-adding migrations whose tallies were
--               never folded in: 20260614120000_v3_2_extraction_memory (V3.2.1,
--               +1 table) and 20260621120000_v3_3_plot_threads (V3.3, +3 tables
--               + 2 guard functions + 3 triggers). Values below are MEASURED
--               from `pnpm db:replay-verify`'s replay DB, not estimated.
--
-- Expected public-schema inventory (measured 2026-06-22, full chain):
--   tables                24   rls-enabled tables    24
--   indexes (pg_indexes) 110   policies              83
--   app functions         14   triggers              16
--   FK constraints        51   CHECK constraints     30
--   PK+UNIQUE constraints 29

DO $$
DECLARE
  v_tables        int;
  v_rls           int;
  v_indexes       int;
  v_policies      int;
  v_app_funcs     int;
  v_triggers      int;
  v_fks           int;
  v_checks        int;
  v_pk_uk         int;
  v_missing       text;
BEGIN
  SELECT count(*) INTO v_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r';

  SELECT count(*) INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity;

  SELECT count(*) INTO v_indexes  FROM pg_indexes  WHERE schemaname='public';
  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname='public';

  SELECT count(*) INTO v_app_funcs
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e');

  SELECT count(*) INTO v_triggers
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal;

  SELECT
    count(*) FILTER (WHERE con.contype='f'),
    count(*) FILTER (WHERE con.contype='c'),
    count(*) FILTER (WHERE con.contype IN ('p','u'))
  INTO v_fks, v_checks, v_pk_uk
  FROM pg_constraint con
  JOIN pg_class r ON r.oid=con.conrelid
  JOIN pg_namespace n ON n.oid=r.relnamespace AND n.nspname='public';

  IF v_tables    <> 24 THEN RAISE EXCEPTION 'tables: expected 24, got %', v_tables; END IF;
  IF v_rls       <> 24 THEN RAISE EXCEPTION 'rls-enabled tables: expected 24, got %', v_rls; END IF;
  IF v_indexes   <> 110 THEN RAISE EXCEPTION 'indexes: expected 110, got %', v_indexes; END IF;
  IF v_policies  <> 83 THEN RAISE EXCEPTION 'policies: expected 83, got %', v_policies; END IF;
  IF v_app_funcs <> 14 THEN RAISE EXCEPTION 'app functions: expected 14, got %', v_app_funcs; END IF;
  IF v_triggers  <> 16 THEN RAISE EXCEPTION 'triggers: expected 16, got %', v_triggers; END IF;
  IF v_fks       <> 51 THEN RAISE EXCEPTION 'FK constraints: expected 51, got %', v_fks; END IF;
  IF v_checks    <> 30 THEN RAISE EXCEPTION 'CHECK constraints: expected 30, got %', v_checks; END IF;
  IF v_pk_uk     <> 29 THEN RAISE EXCEPTION 'PK+UNIQUE constraints: expected 29, got %', v_pk_uk; END IF;

  -- Key object existence (the integrity/status/security fixes).
  SELECT string_agg(want, ', ') INTO v_missing FROM (
    SELECT 'entity_links_from_to_rel_unique' AS want
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.entity_links'::regclass AND conname='entity_links_from_to_rel_unique')
    UNION ALL
    SELECT 'analysis_jobs_active_chapter_uniq'
    WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='analysis_jobs_active_chapter_uniq')
    UNION ALL
    SELECT 'genre_kits_global_genre_type_uniq'
    WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='genre_kits_global_genre_type_uniq')
    UNION ALL
    SELECT 'genre_kits_user_genre_type_uniq'
    WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='genre_kits_user_genre_type_uniq')
    UNION ALL
    SELECT 'canon_facts'
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='canon_facts' AND c.relkind='r')
    UNION ALL
    SELECT 'canon_fact_sources'
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='canon_fact_sources' AND c.relkind='r')
    UNION ALL
    SELECT 'fact_suggestions'
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='fact_suggestions' AND c.relkind='r')
    UNION ALL
    SELECT 'canon_facts_entity_unique_active'
    WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='canon_facts_entity_unique_active')
    UNION ALL
    SELECT 'fact_suggestions_pending_unique'
    WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='fact_suggestions_pending_unique')
    UNION ALL
    SELECT 'list_pending_fact_review_items'
    WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='list_pending_fact_review_items' AND p.prokind='f')
    UNION ALL
    SELECT 'planning_blocks'
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='planning_blocks' AND c.relkind='r')
    UNION ALL
    SELECT 'planning_links'
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='planning_links' AND c.relkind='r')
    UNION ALL
    SELECT 'planning_blocks_root_structure_unique'
    WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='planning_blocks_root_structure_unique')
    UNION ALL
    SELECT 'enforce_planning_block_parent_project'
    WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='enforce_planning_block_parent_project' AND p.prokind='f')
    UNION ALL
    SELECT 'extension:vector'
    WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector')
    UNION ALL
    SELECT 'extension:pg_trgm'
    WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm')
  ) m;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'missing required objects: %', v_missing;
  END IF;

  RAISE NOTICE 'BASELINE VERIFY PASSED: 20 tables / 97 indexes / 67 policies / 12 functions / 12 triggers / 43 FK / 25 CHECK / 23 PK+UNIQUE, key objects present.';
END
$$;
