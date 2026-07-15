-- ============================================================================
-- REPLAY TEST PRELUDE (NOT a migration — never applied to remote)
-- ============================================================================
-- The squash baseline (20260221120000_remote_baseline.sql) and the four
-- 20260515* forward migrations depend on Supabase-platform objects that exist
-- on every real Supabase project / `supabase start` stack but are NOT created
-- by a plain Postgres image:
--
--   * schema  `extensions`            (pg_trgm lives here; indexes use
--                                       `extensions.gin_trgm_ops`)
--   * roles   anon / authenticated / service_role   (GRANT + policy targets)
--   * schema  `auth` + `auth.users`   (FK target for projects/personas/
--                                       chat_conversations/genre_kits.user_id)
--   * funcs   auth.uid() / auth.role()  (referenced by RLS policy expressions;
--                                        only name-resolved at CREATE POLICY)
--
-- This prelude creates the *minimal* shims so a throwaway pgvector Postgres can
-- replay the migration chain exactly in filename-sort order, the same order
-- `supabase db reset` uses. It creates NOTHING in the `public` schema, so the
-- verify-companion public-schema inventory counts are unaffected.
--
-- Leading underscore + companions/ dir => excluded from `supabase db reset`
-- (only supabase/migrations/*.sql is replayed). Used solely by
-- scripts/db-replay-verify.sh.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase default roles (NOLOGIN; only used as GRANT / policy targets here).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- FK target. Real Supabase auth.users has many columns; only id is referenced.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- RLS helper stubs. Bodies are never executed during DDL replay (policies are
-- only parsed/registered at CREATE POLICY); signatures must match call sites:
--   auth.uid()  -> uuid     auth.role() -> text
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'authenticated'
  )
$$;

-- pg_trgm provides extensions.gin_trgm_ops used by the baseline trgm indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
