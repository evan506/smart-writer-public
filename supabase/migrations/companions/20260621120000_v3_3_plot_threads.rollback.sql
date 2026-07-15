-- Rollback for: 20260621120000_v3_3_plot_threads.sql
--
-- The forward migration only ADDED the three plot-thread tables (with their
-- indexes, triggers, and RLS policies) plus two project-bound guard functions.
-- Dropping the tables removes their triggers/indexes/policies automatically.
-- It does NOT drop the shared update_updated_at_column() function, which other
-- tables depend on.

BEGIN;

DROP TABLE IF EXISTS public.plot_thread_chapters;
DROP TABLE IF EXISTS public.plot_thread_planning_blocks;
DROP TABLE IF EXISTS public.plot_threads;

DROP FUNCTION IF EXISTS public.enforce_plot_thread_block_project();
DROP FUNCTION IF EXISTS public.enforce_plot_thread_chapter_project();

COMMIT;
