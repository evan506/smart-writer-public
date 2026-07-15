-- Migration: v2_fact_review_rpc_execute_grants
-- Authored: 2026-05-27
--
-- Purpose:
--   Tighten EXECUTE privileges for the V2 pending fact review read-model RPC.
--   The function is SECURITY INVOKER and has an auth.uid() owner gate, but the
--   callable role surface should still follow least privilege.
--
-- Scope:
--   No data changes. No function body changes.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.list_pending_fact_review_items(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_pending_fact_review_items(uuid)
  TO authenticated, service_role;

COMMIT;
