-- Rollback for: 20260601120000_v2_progressive_planning.sql

BEGIN;

DROP TABLE IF EXISTS public.planning_links;
DROP TABLE IF EXISTS public.planning_blocks;
DROP FUNCTION IF EXISTS public.enforce_planning_block_parent_project();

COMMIT;
