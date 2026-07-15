-- Verification for: 20260527130000_v2_fact_review_conflict_preview_rpc.sql
--
-- Pure catalog inspection. No data required.

DO $$
DECLARE
  v_function_result text;
BEGIN
  SELECT pg_get_function_result('public.list_pending_fact_review_items(uuid)'::regprocedure)
    INTO v_function_result;

  IF v_function_result NOT LIKE '%conflicting_fact_id uuid%' THEN
    RAISE EXCEPTION 'FACT REVIEW CONFLICT PREVIEW VERIFY FAILED: missing return column conflicting_fact_id';
  END IF;

  IF v_function_result NOT LIKE '%conflicting_value text%' THEN
    RAISE EXCEPTION 'FACT REVIEW CONFLICT PREVIEW VERIFY FAILED: missing return column conflicting_value';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT REVIEW CONFLICT PREVIEW VERIFY FAILED: anon still has EXECUTE';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT REVIEW CONFLICT PREVIEW VERIFY FAILED: authenticated lacks EXECUTE';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT REVIEW CONFLICT PREVIEW VERIFY FAILED: service_role lacks EXECUTE';
  END IF;

  RAISE NOTICE 'FACT REVIEW CONFLICT PREVIEW VERIFY PASSED: conflict columns present and grants preserved.';
END
$$;
