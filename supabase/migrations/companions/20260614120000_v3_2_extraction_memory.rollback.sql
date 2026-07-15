-- Rollback for: 20260614120000_v3_2_extraction_memory.sql
--
-- The forward migration only ADDED the extraction_memory table (with its
-- trigger, indexes, and RLS policies). Dropping the table removes all of
-- them automatically. It does NOT drop the shared update_updated_at_column()
-- function, which other tables depend on.

BEGIN;

DROP TABLE IF EXISTS public.extraction_memory;

COMMIT;
