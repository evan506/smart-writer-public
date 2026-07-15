-- Rollback for: 20260522170000_llm_usage_logs.sql

DROP FUNCTION IF EXISTS public.delete_expired_llm_usage_logs(interval);
DROP TABLE IF EXISTS public.llm_usage_logs;
