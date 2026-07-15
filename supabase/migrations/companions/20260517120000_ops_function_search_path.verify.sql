-- Verification for: 20260517120000_ops_function_search_path.sql
--
-- Pure catalog inspection. No data required.

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(sig, ', ')
    INTO v_missing
  FROM (
    VALUES
      ('public.check_relationship(uuid,uuid)'::regprocedure, 'public.check_relationship(uuid,uuid)'),
      ('public.detect_conflicts(uuid)'::regprocedure, 'public.detect_conflicts(uuid)'),
      ('public.find_related_entities(uuid,integer)'::regprocedure, 'public.find_related_entities(uuid,integer)'),
      ('public.get_entity_context(uuid)'::regprocedure, 'public.get_entity_context(uuid)'),
      ('public.match_chunks(text,double precision,integer,uuid,text[])'::regprocedure, 'public.match_chunks(text,double precision,integer,uuid,text[])'),
      ('public.update_updated_at_column()'::regprocedure, 'public.update_updated_at_column()')
  ) AS want(fn_oid, sig)
  JOIN pg_proc p ON p.oid = want.fn_oid
  WHERE NOT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
    WHERE setting = 'search_path=public'
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FUNCTION SEARCH_PATH VERIFY FAILED: missing search_path=public on %', v_missing;
  END IF;

  RAISE NOTICE 'FUNCTION SEARCH_PATH VERIFY PASSED: all target functions pin search_path=public.';
END
$$;
