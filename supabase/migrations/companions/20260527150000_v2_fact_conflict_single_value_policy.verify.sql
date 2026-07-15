-- Verification for: 20260527150000_v2_fact_conflict_single_value_policy.sql
--
-- Pure catalog inspection. No data required.

DO $$
DECLARE
  v_function_result text;
  v_function_def text;
BEGIN
  SELECT pg_get_function_result('public.list_pending_fact_review_items(uuid)'::regprocedure)
    INTO v_function_result;

  SELECT pg_get_functiondef('public.list_pending_fact_review_items(uuid)'::regprocedure)
    INTO v_function_def;

  IF v_function_result NOT LIKE '%conflicting_fact_id uuid%' THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: missing return column conflicting_fact_id';
  END IF;

  IF v_function_result NOT LIKE '%conflicting_value text%' THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: missing return column conflicting_value';
  END IF;

  IF v_function_def NOT LIKE '%conflict_keys AS%' THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: missing conflict key allowlist';
  END IF;

  IF v_function_def NOT LIKE '%ATTRIBUTE%' OR v_function_def NOT LIKE '%species%' THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: missing ATTRIBUTE/species policy';
  END IF;

  IF v_function_def NOT LIKE '%ROLE%' OR v_function_def NOT LIKE '%current_position%' THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: missing ROLE/current_position policy';
  END IF;

  IF v_function_def NOT LIKE '%STATE%' OR v_function_def NOT LIKE '%current_status%' THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: missing STATE/current_status policy';
  END IF;

  IF v_function_def NOT LIKE '%LOCATION_INFO%' OR v_function_def NOT LIKE '%current_location%' THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: missing LOCATION_INFO/current_location policy';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: anon still has EXECUTE';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: authenticated lacks EXECUTE';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT CONFLICT POLICY VERIFY FAILED: service_role lacks EXECUTE';
  END IF;

  RAISE NOTICE 'FACT CONFLICT POLICY VERIFY PASSED: conflict preview is restricted to single-value keys and grants are preserved.';
END
$$;
