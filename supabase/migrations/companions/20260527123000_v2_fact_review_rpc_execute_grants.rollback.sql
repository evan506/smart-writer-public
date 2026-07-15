-- Rollback for: 20260527123000_v2_fact_review_rpc_execute_grants.sql

BEGIN;

GRANT EXECUTE ON FUNCTION public.list_pending_fact_review_items(uuid)
  TO PUBLIC, anon, authenticated, service_role;

COMMIT;
