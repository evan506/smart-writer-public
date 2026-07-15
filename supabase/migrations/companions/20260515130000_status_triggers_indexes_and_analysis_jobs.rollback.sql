-- Rollback for: 20260515130000_status_triggers_indexes_and_analysis_jobs.sql
--
-- Reverts every change made by the forward migration.
--
-- NOTE: the forward migration only ADDED objects (triggers / indexes /
-- table) that did not exist before in the live DB at authoring time, so
-- the rollback simply drops them. It does NOT drop the shared
-- update_updated_at_column() function (other tables depend on it) and
-- does NOT remove any pre-existing entity_suggestions index.

BEGIN;

-- ---------------------------------------------------------------------------
-- 3. Drop analysis_jobs (table, trigger, indexes, policies all cascade)
-- ---------------------------------------------------------------------------
-- Dropping the table removes its trigger, indexes, the partial unique
-- index and all RLS policies automatically.
DROP TABLE IF EXISTS public.analysis_jobs;

-- ---------------------------------------------------------------------------
-- 2. Drop the entity_suggestions indexes added by the migration
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_entity_suggestions_updated_at;
DROP INDEX IF EXISTS public.idx_entity_suggestions_chapter_status;

-- ---------------------------------------------------------------------------
-- 1. Drop the updated_at triggers added by the migration
-- ---------------------------------------------------------------------------
-- These tables had NO updated_at trigger before the migration, so
-- dropping restores the original (pre-migration) state. The shared
-- update_updated_at_column() function is intentionally left in place.
DROP TRIGGER IF EXISTS set_chat_conversations_updated_at ON public.chat_conversations;
DROP TRIGGER IF EXISTS set_personas_updated_at ON public.personas;
DROP TRIGGER IF EXISTS set_entity_suggestions_updated_at ON public.entity_suggestions;

COMMIT;
