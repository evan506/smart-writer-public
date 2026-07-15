-- Verification queries for: security_match_chat_messages_and_genre_kits_model
--
-- Run AFTER applying the forward migration. These are read-only / probing
-- checks. Some require running as a specific authenticated role (use Supabase
-- SQL editor "Run as" or set the JWT claims via set_config). They are NOT run
-- by this track; they document how to prove the fix.

-- ===========================================================================
-- A. match_chat_messages — non-owner gets 0 rows
-- ===========================================================================

-- A1. Structural: ownership guard text is present in the function body.
SELECT
  p.proname,
  p.prosecdef AS is_security_definer,
  (pg_get_functiondef(p.oid) ILIKE '%chat_conversations%user_id = auth.uid()%')
    AS has_ownership_gate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'match_chat_messages';
-- EXPECT: is_security_definer = true, has_ownership_gate = true

-- A2. Return contract unchanged (6 cols, exact names/types/order).
SELECT
  t.ordinality AS arg_pos,
  t.proargname,
  format_type(t.proargtype, NULL) AS proargtype
FROM (
  SELECT
    unnest(p.proallargtypes) AS proargtype,
    unnest(p.proargnames)    AS proargname,
    generate_subscripts(p.proargnames, 1) AS ordinality
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'match_chat_messages'
) t
WHERE t.proargname IN ('id','role','content','emotion_key','similarity','created_at')
ORDER BY t.ordinality;
-- EXPECT: id uuid, role text, content text, emotion_key text,
--         similarity double precision, created_at timestamptz (OUT params)

-- A3. Behavioral: simulate a NON-OWNER caller.
-- Replace :victim_conversation_id with a conversation owned by user X, and
-- run this with the JWT of user Y (Y != X). EXPECT: 0 rows.
--   select set_config('request.jwt.claims',
--     json_build_object('sub','<USER_Y_UUID>','role','authenticated')::text, true);
-- SELECT count(*) AS rows_for_non_owner
-- FROM public.match_chat_messages(
--   (SELECT ('[' || array_to_string(array_fill(0.0::float8, ARRAY[1536]), ',') || ']')),
--   '<VICTIM_CONVERSATION_ID>'::uuid,
--   -1.0,   -- threshold low enough to match everything
--   50
-- );
-- EXPECT: rows_for_non_owner = 0

-- A4. Behavioral: simulate the OWNER caller -> should return its messages.
--   select set_config('request.jwt.claims',
--     json_build_object('sub','<OWNER_UUID>','role','authenticated')::text, true);
-- (same SELECT as A3 with the owner JWT) EXPECT: > 0 rows when messages exist.

-- ===========================================================================
-- B. genre_kits — normal user cannot UPDATE/DELETE a global kit
-- ===========================================================================

-- B1. Policies are owner-scoped (no USING (true) remaining).
SELECT polname, cmd, qual, with_check
FROM (
  SELECT
    pol.polname,
    CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                     WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                     ELSE pol.polcmd::text END AS cmd,
    pg_get_expr(pol.polqual, pol.polrelid)       AS qual,
    pg_get_expr(pol.polwithcheck, pol.polrelid)  AS with_check
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'genre_kits'
) s
ORDER BY cmd;
-- EXPECT: 4 policies. SELECT qual references user_id IS NULL / auth.uid() /
--         is_public. INSERT/UPDATE/DELETE reference user_id = auth.uid().
--         No "true" literal as a standalone qual/with_check.

-- B2. Behavioral: as a normal user, attempting to UPDATE a global kit
-- (user_id IS NULL) must affect 0 rows (RLS filters it out).
--   select set_config('request.jwt.claims',
--     json_build_object('sub','<NORMAL_USER_UUID>','role','authenticated')::text, true);
-- WITH upd AS (
--   UPDATE public.genre_kits SET name = name || ' (hacked)'
--   WHERE user_id IS NULL
--   RETURNING 1
-- )
-- SELECT count(*) AS rows_updated FROM upd;
-- EXPECT: rows_updated = 0

-- B3. Behavioral: as a normal user, DELETE of a global kit affects 0 rows.
-- WITH del AS (
--   DELETE FROM public.genre_kits WHERE user_id IS NULL RETURNING 1
-- )
-- SELECT count(*) AS rows_deleted FROM del;
-- EXPECT: rows_deleted = 0

-- B4. Behavioral: INSERT with a foreign / NULL user_id is rejected by
-- WITH CHECK (only user_id = auth.uid() allowed for normal users).
-- INSERT INTO public.genre_kits (name, genre_type, rules, user_id)
-- VALUES ('x','회귀물','[]'::jsonb, NULL);
-- EXPECT: ERROR new row violates row-level security policy

-- ===========================================================================
-- C. Duplicate uniques removed; partial uniques present
-- ===========================================================================

-- C1. The two old duplicate uniques on (genre_type) are gone.
SELECT conname
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'genre_kits'
  AND con.contype = 'u';
-- EXPECT: no rows named genre_kits_genre_type_key / genre_kits_genre_type_unique

-- C2. The two new partial unique indexes exist.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'genre_kits'
  AND indexname IN ('genre_kits_global_genre_type_uniq',
                    'genre_kits_user_genre_type_uniq');
-- EXPECT: 2 rows. Defs include "WHERE (user_id IS NULL)" and
--         "WHERE (user_id IS NOT NULL)" respectively.

-- C3. New columns exist with expected types/defaults.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'genre_kits'
  AND column_name IN ('user_id','is_public')
ORDER BY column_name;
-- EXPECT: is_public boolean NOT NULL default false; user_id uuid nullable

-- C4. Existing seed rows backfilled to global+public.
SELECT count(*) AS global_public_rows
FROM public.genre_kits
WHERE user_id IS NULL AND is_public = true;
-- EXPECT: = number of pre-existing seed rows (4 per LIVE DB facts)

-- C5. Partial-unique behavior smoke test (run as service_role or in a tx you
-- rollback): a global kit and a user kit may share a genre_type, but two
-- globals of the same genre_type cannot coexist.
-- BEGIN;
--   -- duplicate global should fail:
--   INSERT INTO public.genre_kits (name, genre_type, rules, user_id, is_public)
--   VALUES ('dup-global', (SELECT genre_type FROM public.genre_kits
--                          WHERE user_id IS NULL LIMIT 1), '[]'::jsonb, NULL, true);
--   -- EXPECT: ERROR duplicate key value violates unique constraint
--   --         "genre_kits_global_genre_type_uniq"
-- ROLLBACK;
