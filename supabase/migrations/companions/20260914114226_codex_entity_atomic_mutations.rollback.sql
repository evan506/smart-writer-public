BEGIN;

DROP FUNCTION IF EXISTS public.merge_codex_entity_as_alias(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_codex_entity(uuid, uuid, boolean);

COMMIT;
