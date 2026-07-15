-- Rollback for: 20260515123154_integrity_constraints_fk_and_indexes.sql
--
-- Reverts every change made by the forward migration. Restores the FK
-- constraints to their PRE-migration state: NO ON DELETE action (matching
-- the live-DB facts at authoring time). Recreates the redundant partial
-- unique index on entity_suggestions exactly as it existed before.
--
-- NOTE: idx_entity_suggestions_unique is recreated only so the schema is
-- byte-for-byte restorable; it is intentionally redundant.

BEGIN;

-- ---------------------------------------------------------------------------
-- 4. Drop the FK indexes added by the migration
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_chat_conversations_user_id;
DROP INDEX IF EXISTS public.idx_entity_suggestions_matched_entity_id;

-- ---------------------------------------------------------------------------
-- 3. Restore user_id FKs to their original (no ON DELETE action) form
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_user_fkey;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_user_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_user_fkey;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_user_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- ---------------------------------------------------------------------------
-- 2. Recreate the redundant partial unique index on entity_suggestions
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_suggestions_unique
  ON public.entity_suggestions (chapter_id, name, type)
  WHERE (status = 'PENDING');

-- Restore the original (or remove the migration-set) constraint comment.
COMMENT ON CONSTRAINT entity_suggestions_chapter_name_unique ON public.entity_suggestions IS NULL;

-- ---------------------------------------------------------------------------
-- 1. Drop the entity_links UNIQUE constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.entity_links
  DROP CONSTRAINT IF EXISTS entity_links_from_to_rel_unique;

COMMIT;
