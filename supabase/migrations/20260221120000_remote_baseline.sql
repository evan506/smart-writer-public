-- ============================================================================
-- BASELINE — remote schema snapshot (Smart Writer)  [MATERIALIZED]
-- ============================================================================
-- Strategy (confirmed 2026-05-15): SQUASH BASELINE.
-- The remote Supabase DB (project REDACTED-SUPABASE-PROJECT-REF) is the source of truth.
-- Its migration history has 29 entries that were applied via dashboard/CLI and
-- were NEVER committed as SQL to this repo. Reconstructing them individually is
-- not worthwhile. This file is the single squash-baseline capturing the FULL
-- current public schema; the four 20260515* fix migrations layer on top.
--
-- Timestamp 20260221120000 sorts BEFORE the earliest real remote migration
-- (20260221123222_enable_pgvector) so `supabase db reset` replays:
--   baseline (full current schema)  ->  20260515120000_security ...
--   -> 20260515123154_integrity -> 20260515130000_status -> 20260515140000_search
-- The four 20260515* migrations are idempotent (IF NOT EXISTS / DO-blocks), so
-- replaying them on top of this post-fix snapshot is a no-op.
--
-- ---------------------------------------------------------------------------
-- HOW THIS WAS MATERIALIZED (2026-05-16)
--   This file was reconstructed via Supabase MCP catalog introspection
--   (pg_get_constraintdef / pg_get_indexdef / pg_get_functiondef /
--   pg_get_triggerdef / pg_policies / pg_attribute), NOT via a shell
--   `supabase db dump`, because the automated session must not handle the DB
--   password / connection string. It reflects the live remote public schema
--   AFTER the four 20260515* fix migrations were applied.
--
--   Known reconstruction caveats vs. a shell `pg_dump`:
--     * Only objects the public schema depends on are emitted:
--       extensions `vector` (public) and `pg_trgm` (extensions). Supabase
--       platform-managed extensions (pgcrypto, uuid-ossp, pg_graphql,
--       supabase_vault, pg_stat_statements) are intentionally omitted — a
--       real `db dump --schema public` also omits them and they are present
--       by default on every Supabase project / local stack.
--     * pgvector's ~111 internal functions/operators are owned by the
--       `vector` extension and are created by CREATE EXTENSION; only the 9
--       application RPCs are emitted here.
--     * trgm GIN index opclasses are schema-qualified as
--       `extensions.gin_trgm_ops` (the live introspected form was unqualified
--       and relied on search_path); semantically identical, replay-robust.
--
--   Verify with: supabase/migrations/companions/20260221120000_remote_baseline.verify.sql
--
--   FRESH-REPLAY STATUS (2026-05-16): PASSED.
--   `scripts/db-replay-verify.sh` replayed this baseline + the four 20260515*
--   migrations on a disposable pgvector Postgres in filename-sort order
--   (the order `supabase db reset` uses) and the verify companion's
--   hard assertion passed: 14 tables / 68 indexes / 45 policies / 9 RPCs /
--   8 triggers / 23 FK / 10 CHECK / 17 PK+UNIQUE, key objects present.
--   One real replay bug was found & fixed in that pass: constraints were
--   emitted table-alphabetical so FKs ran before the referenced PKs existed
--   (see section 3 ORDERING note). The db-push gate is therefore satisfied;
--   `supabase db push` may now be used through the normal reviewed path.
-- ---------------------------------------------------------------------------
--
-- Remote migration history captured (29) as of 2026-05-15:
--   20260221123222 enable_pgvector .. 20260410003931 add_auth_checks_to_security_definer_rpcs
--   (full list retained in git history of this file's stub revision)
-- ============================================================================

-- ===========================================================================
-- 1. Extensions (public-schema dependencies only)
-- ===========================================================================
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA extensions;

-- ===========================================================================
-- 2. Tables
-- ===========================================================================
CREATE TABLE public.analysis_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  chapter_id uuid NOT NULL,
  status text DEFAULT 'QUEUED'::text NOT NULL,
  error text,
  entity_count integer,
  relation_count integer,
  suggestion_count integer,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.analysis_jobs IS 'Tracks the post-save AI entity/relation extraction pipeline (IndexingService.indexChapterWithExtraction). One row per run; QUEUED->RUNNING->DONE|FAILED. Failures are recorded here instead of console.error only. analysis_jobs_active_chapter_uniq prevents concurrent active runs per chapter.';

CREATE TABLE public.chapters (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  chapter_num integer NOT NULL,
  title text,
  content text,
  summary text,
  arc_summary text,
  word_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.chat_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  persona_id uuid NOT NULL,
  project_id uuid,
  title text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  emotion_key text,
  context_marker text,
  model text,
  latency_ms integer,
  token_count integer,
  created_at timestamp with time zone DEFAULT now(),
  embedding vector(1536)
);

CREATE TABLE public.chunks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  chapter_id uuid NOT NULL,
  type text NOT NULL,
  content text NOT NULL,
  summary text,
  entity_tags jsonb DEFAULT '[]'::jsonb,
  embedding vector(1536),
  position integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.entities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  type text NOT NULL,
  name text NOT NULL,
  aliases jsonb DEFAULT '[]'::jsonb,
  summary text,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.entity_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  from_id uuid NOT NULL,
  to_id uuid NOT NULL,
  relation_type text NOT NULL,
  weight double precision DEFAULT 0.5,
  direction text DEFAULT 'UNI'::text,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.entity_suggestions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  chapter_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  summary text,
  aliases jsonb DEFAULT '[]'::jsonb,
  confidence real DEFAULT 0.5 NOT NULL,
  context_snippet text,
  status text DEFAULT 'PENDING'::text NOT NULL,
  matched_entity_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  suggested_action text DEFAULT 'CREATE'::text
);

CREATE TABLE public.foreshadows (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  planted_chapter integer NOT NULL,
  expected_reveal integer,
  status text DEFAULT 'PLANTED'::text,
  description text,
  entity_ids uuid[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.genre_kits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  genre_type text NOT NULL,
  rules jsonb DEFAULT '{}'::jsonb,
  templates jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  is_public boolean DEFAULT false NOT NULL
);

CREATE TABLE public.mentions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  chunk_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  count integer DEFAULT 1,
  last_mentioned_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.personas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  world_id uuid,
  entity_id uuid,
  name text NOT NULL,
  description text,
  avatar_url text,
  system_prompt text,
  personality text,
  tone character varying(30) DEFAULT 'neutral'::character varying,
  background text,
  greeting_message text,
  emotion_images jsonb DEFAULT '{}'::jsonb,
  chat_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  title text NOT NULL,
  description text,
  genre text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  excluded_terms jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE public.rag_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  query_original text,
  query_rewrites jsonb,
  mode_classification text,
  search_results_top_n jsonb,
  reranked_top_8 jsonb,
  final_response text,
  cited_entities uuid[],
  latency_ms integer,
  created_at timestamp with time zone DEFAULT now()
);

-- ===========================================================================
-- 3. Constraints (PRIMARY KEY / UNIQUE / CHECK / FOREIGN KEY)
-- ===========================================================================
-- ORDERING (fresh-replay correctness — fixed 2026-05-16):
--   The MCP catalog introspection emitted these table-alphabetical, so
--   analysis_jobs' FKs to chapters/projects ran before chapters_pkey /
--   projects_pkey existed -> "no unique constraint matching given keys for
--   referenced table" on a fresh `supabase db reset`. On the live remote DB
--   the PKs already existed so the original order never failed there.
--   They are now grouped: (3a) ALL PRIMARY KEY + UNIQUE, then (3b) ALL
--   FOREIGN KEY, then (3c) ALL CHECK. Constraint names/definitions are
--   byte-identical to the introspected forms — only statement order changed.
--   Inventory unchanged: 17 PK+UNIQUE / 23 FK / 10 CHECK.

-- 3a. PRIMARY KEY + UNIQUE (create the unique indexes every FK depends on).
ALTER TABLE public.analysis_jobs ADD CONSTRAINT analysis_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.chapters ADD CONSTRAINT chapters_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.chunks ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);
ALTER TABLE public.entities ADD CONSTRAINT entities_pkey PRIMARY KEY (id);
ALTER TABLE public.entities ADD CONSTRAINT entities_project_name_unique UNIQUE (project_id, name);
ALTER TABLE public.entity_links ADD CONSTRAINT entity_links_pkey PRIMARY KEY (id);
ALTER TABLE public.entity_links ADD CONSTRAINT entity_links_from_to_rel_unique UNIQUE (from_id, to_id, relation_type);
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_pkey PRIMARY KEY (id);
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_chapter_name_unique UNIQUE (chapter_id, name);
ALTER TABLE public.foreshadows ADD CONSTRAINT foreshadows_pkey PRIMARY KEY (id);
ALTER TABLE public.genre_kits ADD CONSTRAINT genre_kits_pkey PRIMARY KEY (id);
ALTER TABLE public.mentions ADD CONSTRAINT mentions_pkey PRIMARY KEY (id);
ALTER TABLE public.personas ADD CONSTRAINT personas_pkey PRIMARY KEY (id);
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE public.rag_logs ADD CONSTRAINT rag_logs_pkey PRIMARY KEY (id);

-- 3b. FOREIGN KEY (every referenced PK/UNIQUE now exists).
ALTER TABLE public.analysis_jobs ADD CONSTRAINT analysis_jobs_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public.analysis_jobs ADD CONSTRAINT analysis_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.chapters ADD CONSTRAINT chapters_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_persona_fkey FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_project_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_conversation_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.chunks ADD CONSTRAINT chunks_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public.entities ADD CONSTRAINT entities_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.entity_links ADD CONSTRAINT entity_links_from_id_fkey FOREIGN KEY (from_id) REFERENCES entities(id) ON DELETE CASCADE;
ALTER TABLE public.entity_links ADD CONSTRAINT entity_links_to_id_fkey FOREIGN KEY (to_id) REFERENCES entities(id) ON DELETE CASCADE;
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_matched_entity_id_fkey FOREIGN KEY (matched_entity_id) REFERENCES entities(id) ON DELETE SET NULL;
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.foreshadows ADD CONSTRAINT foreshadows_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.genre_kits ADD CONSTRAINT genre_kits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mentions ADD CONSTRAINT mentions_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE;
ALTER TABLE public.mentions ADD CONSTRAINT mentions_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE;
ALTER TABLE public.personas ADD CONSTRAINT personas_entity_fkey FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL;
ALTER TABLE public.personas ADD CONSTRAINT personas_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.personas ADD CONSTRAINT personas_world_fkey FOREIGN KEY (world_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.rag_logs ADD CONSTRAINT rag_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 3c. CHECK (no cross-table dependencies).
ALTER TABLE public.analysis_jobs ADD CONSTRAINT analysis_jobs_status_check CHECK ((status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'DONE'::text, 'FAILED'::text])));
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])));
ALTER TABLE public.chunks ADD CONSTRAINT chunks_type_check CHECK ((type = ANY (ARRAY['CHAPTER'::text, 'SCENE'::text, 'DIALOGUE'::text])));
ALTER TABLE public.entities ADD CONSTRAINT entities_type_check CHECK ((type = ANY (ARRAY['CHARACTER'::text, 'PLACE'::text, 'ITEM'::text, 'ORGANIZATION'::text, 'CONCEPT'::text, 'MAGIC_SYSTEM'::text])));
ALTER TABLE public.entity_links ADD CONSTRAINT entity_links_direction_check CHECK ((direction = ANY (ARRAY['UNI'::text, 'BI'::text])));
ALTER TABLE public.entity_links ADD CONSTRAINT entity_links_weight_check CHECK (((weight >= (0)::double precision) AND (weight <= (1)::double precision)));
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'DISMISSED'::text])));
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_suggested_action_check CHECK ((suggested_action = ANY (ARRAY['CREATE'::text, 'MERGE'::text, 'UPDATE'::text])));
ALTER TABLE public.entity_suggestions ADD CONSTRAINT entity_suggestions_type_check CHECK ((type = ANY (ARRAY['CHARACTER'::text, 'PLACE'::text, 'ITEM'::text, 'ORGANIZATION'::text, 'CONCEPT'::text, 'MAGIC_SYSTEM'::text, 'RELATION'::text])));
ALTER TABLE public.foreshadows ADD CONSTRAINT foreshadows_status_check CHECK ((status = ANY (ARRAY['PLANTED'::text, 'REVEALED'::text, 'ABANDONED'::text])));

-- ===========================================================================
-- 4. Indexes (non-constraint)
-- trgm GIN opclasses schema-qualified as extensions.gin_trgm_ops
-- (introspected form was unqualified; semantically identical, replay-robust).
-- ===========================================================================
CREATE UNIQUE INDEX analysis_jobs_active_chapter_uniq ON public.analysis_jobs USING btree (chapter_id) WHERE (status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text]));
CREATE INDEX idx_analysis_jobs_chapter_created_at ON public.analysis_jobs USING btree (chapter_id, created_at DESC);
CREATE INDEX idx_analysis_jobs_project_status ON public.analysis_jobs USING btree (project_id, status);
CREATE INDEX idx_chapters_content_fts ON public.chapters USING gin (to_tsvector('english'::regconfig, COALESCE(content, ''::text)));
CREATE INDEX idx_chapters_content_trgm ON public.chapters USING gin (COALESCE(content, ''::text) extensions.gin_trgm_ops);
CREATE INDEX idx_chapters_project_id ON public.chapters USING btree (project_id);
CREATE UNIQUE INDEX idx_chapters_project_num ON public.chapters USING btree (project_id, chapter_num);
CREATE INDEX idx_chapters_title_fts ON public.chapters USING gin (to_tsvector('english'::regconfig, COALESCE(title, ''::text)));
CREATE INDEX idx_chapters_title_trgm ON public.chapters USING gin (COALESCE(title, ''::text) extensions.gin_trgm_ops);
CREATE INDEX idx_chat_conversations_persona ON public.chat_conversations USING btree (persona_id);
CREATE INDEX idx_chat_conversations_project ON public.chat_conversations USING btree (project_id);
CREATE INDEX idx_chat_conversations_user_id ON public.chat_conversations USING btree (user_id);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id);
CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at);
CREATE INDEX idx_chat_messages_embedding ON public.chat_messages USING ivfflat (embedding vector_cosine_ops) WITH (lists='50');
CREATE INDEX idx_chunks_chapter_id ON public.chunks USING btree (chapter_id);
CREATE INDEX idx_chunks_content_fts ON public.chunks USING gin (to_tsvector('english'::regconfig, content));
CREATE INDEX idx_chunks_embedding ON public.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX idx_chunks_entity_tags ON public.chunks USING gin (entity_tags);
CREATE INDEX idx_chunks_position ON public.chunks USING btree (chapter_id, "position");
CREATE INDEX idx_chunks_type ON public.chunks USING btree (type);
CREATE INDEX idx_entities_aliases ON public.entities USING gin (aliases);
CREATE INDEX idx_entities_embedding ON public.entities USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX idx_entities_name ON public.entities USING btree (name);
CREATE INDEX idx_entities_name_fts ON public.entities USING gin (to_tsvector('english'::regconfig, name));
CREATE INDEX idx_entities_name_trgm ON public.entities USING gin (name extensions.gin_trgm_ops);
CREATE INDEX idx_entities_project_id ON public.entities USING btree (project_id);
CREATE INDEX idx_entities_summary_fts ON public.entities USING gin (to_tsvector('english'::regconfig, COALESCE(summary, ''::text)));
CREATE INDEX idx_entities_summary_trgm ON public.entities USING gin (COALESCE(summary, ''::text) extensions.gin_trgm_ops);
CREATE INDEX idx_entities_type ON public.entities USING btree (type);
CREATE INDEX idx_entity_links_from_id ON public.entity_links USING btree (from_id);
CREATE INDEX idx_entity_links_relation ON public.entity_links USING btree (relation_type);
CREATE INDEX idx_entity_links_to_id ON public.entity_links USING btree (to_id);
CREATE INDEX idx_entity_suggestions_chapter_status ON public.entity_suggestions USING btree (chapter_id, status);
CREATE INDEX idx_entity_suggestions_matched_entity_id ON public.entity_suggestions USING btree (matched_entity_id);
CREATE INDEX idx_entity_suggestions_project_status ON public.entity_suggestions USING btree (project_id, status);
CREATE INDEX idx_entity_suggestions_updated_at ON public.entity_suggestions USING btree (updated_at);
CREATE INDEX idx_foreshadows_project_id ON public.foreshadows USING btree (project_id);
CREATE INDEX idx_foreshadows_status ON public.foreshadows USING btree (status);
CREATE UNIQUE INDEX genre_kits_global_genre_type_uniq ON public.genre_kits USING btree (genre_type) WHERE (user_id IS NULL);
CREATE UNIQUE INDEX genre_kits_user_genre_type_uniq ON public.genre_kits USING btree (user_id, genre_type) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX idx_mentions_chunk_entity ON public.mentions USING btree (chunk_id, entity_id);
CREATE INDEX idx_mentions_chunk_id ON public.mentions USING btree (chunk_id);
CREATE INDEX idx_mentions_entity_id ON public.mentions USING btree (entity_id);
CREATE INDEX idx_personas_entity ON public.personas USING btree (entity_id);
CREATE INDEX idx_personas_user ON public.personas USING btree (user_id);
CREATE INDEX idx_personas_world ON public.personas USING btree (world_id);
CREATE INDEX idx_projects_metadata ON public.projects USING gin (metadata);
CREATE INDEX idx_projects_user_id ON public.projects USING btree (user_id);
CREATE INDEX idx_rag_logs_created_at ON public.rag_logs USING btree (created_at DESC);
CREATE INDEX idx_rag_logs_project_id ON public.rag_logs USING btree (project_id);

-- ===========================================================================
-- 5. Functions (application RPCs; pgvector internals owned by the extension)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.check_relationship(entity_a uuid, entity_b uuid)
 RETURNS TABLE(path uuid[], depth integer, relation_types text[])
 LANGUAGE sql
 STABLE
AS $function$
WITH RECURSIVE search AS (
  SELECT el.to_id AS current, ARRAY[el.from_id, el.to_id] AS path, 1 AS depth, ARRAY[el.relation_type] AS relation_types
  FROM entity_links el WHERE el.from_id = entity_a
  UNION ALL
  SELECT el.to_id, s.path || el.to_id, s.depth + 1, s.relation_types || el.relation_type
  FROM entity_links el JOIN search s ON el.from_id = s.current
  WHERE s.depth < 5 AND NOT el.to_id = ANY(s.path)
)
SELECT path, depth, relation_types FROM search WHERE current = entity_b ORDER BY depth LIMIT 5;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_conflicts(p_chapter_id uuid)
 RETURNS TABLE(conflict_type text, entity_id uuid, entity_name text, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Verify caller owns the project that contains this chapter
  IF NOT EXISTS (
    SELECT 1 FROM chapters ch
    JOIN projects p ON p.id = ch.project_id
    WHERE ch.id = p_chapter_id AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  -- 1. Summary 없는 엔티티
  RETURN QUERY
  SELECT
    'MISSING_SUMMARY'::text,
    e.id,
    e.name,
    format('Entity "%s" is mentioned in chapter but has no summary in codex', e.name)
  FROM mentions m
  JOIN chunks c ON c.id = m.chunk_id
  JOIN entities e ON e.id = m.entity_id
  WHERE c.chapter_id = p_chapter_id
    AND (e.summary IS NULL OR e.summary = '');

  -- 2. entity_tags에는 있지만 mentions에 없는 엔티티 (LATERAL 명시)
  RETURN QUERY
  SELECT
    'UNTRACKED_MENTION'::text,
    e.id,
    e.name,
    format('Entity "%s" appears in chunk entity_tags but has no mention record', e.name)
  FROM chunks c
  CROSS JOIN LATERAL jsonb_array_elements_text(c.entity_tags) AS tag_id
  JOIN entities e ON e.id = tag_id::uuid
  LEFT JOIN mentions m ON m.chunk_id = c.id AND m.entity_id = e.id
  WHERE c.chapter_id = p_chapter_id
    AND m.id IS NULL;

  -- 3. 이전 챕터에서 자주 등장했지만 현재 챕터에 없는 엔티티
  RETURN QUERY
  WITH chapter_info AS (
    SELECT ch.project_id, ch.chapter_num
    FROM chapters ch
    WHERE ch.id = p_chapter_id
  ),
  frequent_entities AS (
    SELECT m2.entity_id, count(*) AS total_mentions
    FROM mentions m2
    JOIN chunks c2 ON c2.id = m2.chunk_id
    JOIN chapters ch2 ON ch2.id = c2.chapter_id
    JOIN chapter_info ci ON ch2.project_id = ci.project_id AND ch2.chapter_num < ci.chapter_num
    GROUP BY m2.entity_id
    HAVING count(*) >= 3
  ),
  current_chapter_entities AS (
    SELECT DISTINCT m3.entity_id
    FROM mentions m3
    JOIN chunks c3 ON c3.id = m3.chunk_id
    WHERE c3.chapter_id = p_chapter_id
  )
  SELECT
    'EXPECTED_ENTITY_ABSENT'::text,
    fe.entity_id,
    e.name,
    format('Entity "%s" appeared %s times in prior chapters but is absent from this chapter', e.name, fe.total_mentions)
  FROM frequent_entities fe
  JOIN entities e ON e.id = fe.entity_id
  LEFT JOIN current_chapter_entities cce ON cce.entity_id = fe.entity_id
  WHERE cce.entity_id IS NULL;

  -- 4. 미회수 복선
  RETURN QUERY
  SELECT
    'DANGLING_FORESHADOW'::text,
    NULL::uuid,
    f.description,
    format('Foreshadow planted in chapter %s (expected reveal: %s) is still PLANTED',
      f.planted_chapter,
      coalesce(f.expected_reveal::text, 'unknown')
    )
  FROM foreshadows f
  JOIN chapters ch ON ch.id = p_chapter_id
  WHERE f.project_id = ch.project_id
    AND f.planted_chapter < ch.chapter_num
    AND f.status = 'PLANTED'
    AND (f.expected_reveal IS NULL OR f.expected_reveal <= ch.chapter_num);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_related_entities(target_entity_id uuid, max_depth integer DEFAULT 3)
 RETURNS TABLE(entity_id uuid, entity_name text, entity_type text, relation_type text, depth integer, path uuid[], cumulative_weight double precision)
 LANGUAGE sql
 STABLE
AS $function$
WITH RECURSIVE rel AS (
  SELECT
    sub.entity_id, sub.entity_name, sub.entity_type, sub.relation_type,
    sub.depth, sub.path, sub.cumulative_weight
  FROM (
    SELECT el.to_id AS entity_id, e.name AS entity_name, e.type AS entity_type,
           el.relation_type, 1 AS depth, ARRAY[el.from_id, el.to_id] AS path, el.weight AS cumulative_weight
    FROM entity_links el JOIN entities e ON e.id = el.to_id
    WHERE el.from_id = target_entity_id
    UNION ALL
    SELECT el.from_id, e.name, e.type, el.relation_type,
           1, ARRAY[el.to_id, el.from_id], el.weight
    FROM entity_links el JOIN entities e ON e.id = el.from_id
    WHERE el.to_id = target_entity_id AND el.direction = 'BI'
    UNION ALL
    SELECT el.from_id, e.name, e.type, el.relation_type || '_BY',
           1, ARRAY[el.to_id, el.from_id], el.weight
    FROM entity_links el JOIN entities e ON e.id = el.from_id
    WHERE el.to_id = target_entity_id AND el.direction = 'UNI'
  ) sub

  UNION ALL

  SELECT
    next.entity_id, next.entity_name, next.entity_type, next.relation_type,
    next.depth, next.path, next.cumulative_weight
  FROM rel r,
  LATERAL (
    SELECT el.to_id AS entity_id, e.name AS entity_name, e.type AS entity_type,
           el.relation_type, r.depth + 1 AS depth, r.path || el.to_id AS path,
           r.cumulative_weight * el.weight AS cumulative_weight
    FROM entity_links el JOIN entities e ON e.id = el.to_id
    WHERE el.from_id = r.entity_id AND NOT el.to_id = ANY(r.path)
    UNION ALL
    SELECT el.from_id, e.name, e.type,
           CASE WHEN el.direction = 'UNI' THEN el.relation_type || '_BY' ELSE el.relation_type END,
           r.depth + 1, r.path || el.from_id,
           r.cumulative_weight * el.weight
    FROM entity_links el JOIN entities e ON e.id = el.from_id
    WHERE el.to_id = r.entity_id AND NOT el.from_id = ANY(r.path)
  ) next
  WHERE r.depth < max_depth
)
SELECT DISTINCT ON (rel.entity_id)
  rel.entity_id, rel.entity_name, rel.entity_type,
  rel.relation_type, rel.depth, rel.path, rel.cumulative_weight
FROM rel
ORDER BY rel.entity_id, rel.depth, rel.cumulative_weight DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_entity_context(target_entity_id uuid)
 RETURNS TABLE(entity_id uuid, name text, type text, summary text, aliases jsonb, relation_type text, relation_direction text, relation_weight double precision, related_id uuid, related_name text, related_type text, related_summary text)
 LANGUAGE sql
 STABLE
AS $function$
SELECT
  e.id, e.name, e.type, e.summary, e.aliases,
  el.relation_type, el.direction, el.weight,
  re.id, re.name, re.type, re.summary
FROM entities e
JOIN entity_links el ON el.from_id = e.id
JOIN entities re ON re.id = el.to_id
WHERE e.id = target_entity_id

UNION ALL

SELECT
  e.id, e.name, e.type, e.summary, e.aliases,
  CASE WHEN el.direction = 'UNI' THEN el.relation_type || '_BY' ELSE el.relation_type END,
  el.direction, el.weight,
  re.id, re.name, re.type, re.summary
FROM entities e
JOIN entity_links el ON el.to_id = e.id
JOIN entities re ON re.id = el.from_id
WHERE e.id = target_entity_id

UNION ALL

SELECT
  e.id, e.name, e.type, e.summary, e.aliases,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM entities e
WHERE e.id = target_entity_id
AND NOT EXISTS (
  SELECT 1 FROM entity_links WHERE from_id = e.id OR to_id = e.id
);
$function$
;

CREATE OR REPLACE FUNCTION public.match_chat_messages(query_embedding text, p_conversation_id uuid, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, role text, content text, emotion_key text, similarity double precision, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_conversations c
    WHERE c.id = p_conversation_id
      AND c.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.role, m.content, m.emotion_key,
    1 - (m.embedding <=> query_embedding::vector) AS similarity, m.created_at
  FROM public.chat_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY m.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_chunks(query_embedding text, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 30, p_project_id uuid DEFAULT NULL::uuid, p_chunk_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, chapter_id uuid, type text, content text, summary text, entity_tags jsonb, similarity double precision, "position" integer)
 LANGUAGE plpgsql
AS $function$ DECLARE embedding_vector vector(1536); BEGIN embedding_vector := query_embedding::vector; RETURN QUERY SELECT c.id, c.chapter_id, c.type, c.content, c.summary, c.entity_tags, (1 - (c.embedding <=> embedding_vector))::float AS similarity, c."position" FROM chunks c JOIN chapters ch ON ch.id = c.chapter_id WHERE c.embedding IS NOT NULL AND (1 - (c.embedding <=> embedding_vector)) >= match_threshold AND (p_project_id IS NULL OR ch.project_id = p_project_id) AND (p_chunk_types IS NULL OR c.type = ANY(p_chunk_types)) ORDER BY c.embedding <=> embedding_vector LIMIT match_count; END; $function$
;

CREATE OR REPLACE FUNCTION public.search_chapters_bm25(p_project_id uuid, p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, chapter_num integer, title text, content text, summary text, rank double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.similarity_threshold', '0.1', true);

  RETURN QUERY
  SELECT
    c.id,
    c.chapter_num,
    c.title,
    c.content,
    c.summary,
    GREATEST(
      similarity(coalesce(c.title, ''), p_query),
      similarity(coalesce(c.content, ''), p_query),
      word_similarity(p_query, coalesce(c.title, '')),
      word_similarity(p_query, coalesce(c.content, ''))
    )::double precision     AS rank
  FROM public.chapters c
  WHERE c.project_id = p_project_id
    AND (
      coalesce(c.title, '') % p_query
      OR coalesce(c.content, '') % p_query
      OR word_similarity(p_query, coalesce(c.title, '')) > 0.3
      OR word_similarity(p_query, coalesce(c.content, '')) > 0.3
    )
    AND GREATEST(
      similarity(coalesce(c.title, ''), p_query),
      similarity(coalesce(c.content, ''), p_query),
      word_similarity(p_query, coalesce(c.title, '')),
      word_similarity(p_query, coalesce(c.content, ''))
    ) > 0.1
  ORDER BY rank DESC, c.chapter_num ASC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_entities_bm25(p_project_id uuid, p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, name text, type text, description text, settings jsonb, rank double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.similarity_threshold', '0.1', true);

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.type,
    e.summary               AS description,
    e.metadata              AS settings,
    GREATEST(
      similarity(e.name, p_query),
      similarity(coalesce(e.summary, ''), p_query),
      word_similarity(p_query, e.name),
      word_similarity(p_query, coalesce(e.summary, ''))
    )::double precision     AS rank
  FROM public.entities e
  WHERE e.project_id = p_project_id
    AND (
      e.name % p_query
      OR coalesce(e.summary, '') % p_query
      OR word_similarity(p_query, e.name) > 0.3
      OR word_similarity(p_query, coalesce(e.summary, '')) > 0.3
    )
    AND GREATEST(
      similarity(e.name, p_query),
      similarity(coalesce(e.summary, ''), p_query),
      word_similarity(p_query, e.name),
      word_similarity(p_query, coalesce(e.summary, ''))
    ) > 0.1
  ORDER BY rank DESC, e.name ASC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

-- ===========================================================================
-- 6. Triggers
-- ===========================================================================
CREATE TRIGGER set_analysis_jobs_updated_at BEFORE UPDATE ON public.analysis_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_entities_updated_at BEFORE UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_entity_suggestions_updated_at BEFORE UPDATE ON public.entity_suggestions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_foreshadows_updated_at BEFORE UPDATE ON public.foreshadows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_personas_updated_at BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================================================
-- 7. Row Level Security — enable
-- ===========================================================================
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foreshadows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genre_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_logs ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 8. Row Level Security — policies
-- ===========================================================================
CREATE POLICY analysis_jobs_delete_own ON public.analysis_jobs AS PERMISSIVE FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY analysis_jobs_insert_own ON public.analysis_jobs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY analysis_jobs_select_own ON public.analysis_jobs AS PERMISSIVE FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY analysis_jobs_update_own ON public.analysis_jobs AS PERMISSIVE FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = ( SELECT auth.uid() AS uid)))))
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Users can delete chapters in own projects" ON public.chapters AS PERMISSIVE FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can insert chapters in own projects" ON public.chapters AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can update chapters in own projects" ON public.chapters AS PERMISSIVE FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))))
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can view chapters in own projects" ON public.chapters AS PERMISSIVE FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users manage own conversations" ON public.chat_conversations AS PERMISSIVE FOR ALL TO public
  USING ((user_id = auth.uid()));

CREATE POLICY "Users manage own messages" ON public.chat_messages AS PERMISSIVE FOR ALL TO public
  USING ((conversation_id IN ( SELECT chat_conversations.id
   FROM chat_conversations
  WHERE (chat_conversations.user_id = auth.uid()))));

CREATE POLICY "Users can delete chunks in own projects" ON public.chunks AS PERMISSIVE FOR DELETE TO public
  USING ((chapter_id IN ( SELECT chapters.id
   FROM chapters
  WHERE (chapters.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can insert chunks in own projects" ON public.chunks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((chapter_id IN ( SELECT chapters.id
   FROM chapters
  WHERE (chapters.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can update chunks in own projects" ON public.chunks AS PERMISSIVE FOR UPDATE TO public
  USING ((chapter_id IN ( SELECT chapters.id
   FROM chapters
  WHERE (chapters.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))))
  WITH CHECK ((chapter_id IN ( SELECT chapters.id
   FROM chapters
  WHERE (chapters.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can view chunks in own projects" ON public.chunks AS PERMISSIVE FOR SELECT TO public
  USING ((chapter_id IN ( SELECT chapters.id
   FROM chapters
  WHERE (chapters.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can delete entities in own projects" ON public.entities AS PERMISSIVE FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can insert entities in own projects" ON public.entities AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can update entities in own projects" ON public.entities AS PERMISSIVE FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))))
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can view entities in own projects" ON public.entities AS PERMISSIVE FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can delete own entity links" ON public.entity_links AS PERMISSIVE FOR DELETE TO public
  USING ((from_id IN ( SELECT entities.id
   FROM entities
  WHERE (entities.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can insert own entity links" ON public.entity_links AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((from_id IN ( SELECT entities.id
   FROM entities
  WHERE (entities.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can update own entity links" ON public.entity_links AS PERMISSIVE FOR UPDATE TO public
  USING ((from_id IN ( SELECT entities.id
   FROM entities
  WHERE (entities.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))))
  WITH CHECK ((from_id IN ( SELECT entities.id
   FROM entities
  WHERE (entities.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can view own entity links" ON public.entity_links AS PERMISSIVE FOR SELECT TO public
  USING ((from_id IN ( SELECT entities.id
   FROM entities
  WHERE (entities.project_id IN ( SELECT projects.id
           FROM projects
          WHERE (projects.user_id = auth.uid()))))));

CREATE POLICY "Users can delete suggestions for their projects" ON public.entity_suggestions AS PERMISSIVE FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can insert suggestions for their projects" ON public.entity_suggestions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can update suggestions for their projects" ON public.entity_suggestions AS PERMISSIVE FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can view suggestions for their projects" ON public.entity_suggestions AS PERMISSIVE FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can delete foreshadows in own projects" ON public.foreshadows AS PERMISSIVE FOR DELETE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can insert foreshadows in own projects" ON public.foreshadows AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can update foreshadows in own projects" ON public.foreshadows AS PERMISSIVE FOR UPDATE TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))))
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can view foreshadows in own projects" ON public.foreshadows AS PERMISSIVE FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY delete_genre_kits ON public.genre_kits AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY insert_genre_kits ON public.genre_kits AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY select_genre_kits ON public.genre_kits AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)) OR (is_public = true)));

CREATE POLICY update_genre_kits ON public.genre_kits AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Users can delete mentions in own projects" ON public.mentions AS PERMISSIVE FOR DELETE TO public
  USING ((chunk_id IN ( SELECT chunks.id
   FROM chunks
  WHERE (chunks.chapter_id IN ( SELECT chapters.id
           FROM chapters
          WHERE (chapters.project_id IN ( SELECT projects.id
                   FROM projects
                  WHERE (projects.user_id = auth.uid()))))))));

CREATE POLICY "Users can insert mentions in own projects" ON public.mentions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((chunk_id IN ( SELECT chunks.id
   FROM chunks
  WHERE (chunks.chapter_id IN ( SELECT chapters.id
           FROM chapters
          WHERE (chapters.project_id IN ( SELECT projects.id
                   FROM projects
                  WHERE (projects.user_id = auth.uid()))))))));

CREATE POLICY "Users can update mentions in own projects" ON public.mentions AS PERMISSIVE FOR UPDATE TO public
  USING ((chunk_id IN ( SELECT chunks.id
   FROM chunks
  WHERE (chunks.chapter_id IN ( SELECT chapters.id
           FROM chapters
          WHERE (chapters.project_id IN ( SELECT projects.id
                   FROM projects
                  WHERE (projects.user_id = auth.uid()))))))))
  WITH CHECK ((chunk_id IN ( SELECT chunks.id
   FROM chunks
  WHERE (chunks.chapter_id IN ( SELECT chapters.id
           FROM chapters
          WHERE (chapters.project_id IN ( SELECT projects.id
                   FROM projects
                  WHERE (projects.user_id = auth.uid()))))))));

CREATE POLICY "Users can view mentions in own projects" ON public.mentions AS PERMISSIVE FOR SELECT TO public
  USING ((chunk_id IN ( SELECT chunks.id
   FROM chunks
  WHERE (chunks.chapter_id IN ( SELECT chapters.id
           FROM chapters
          WHERE (chapters.project_id IN ( SELECT projects.id
                   FROM projects
                  WHERE (projects.user_id = auth.uid()))))))));

CREATE POLICY "Users manage own personas" ON public.personas AS PERMISSIVE FOR ALL TO public
  USING ((user_id = auth.uid()));

CREATE POLICY "Users can delete own projects" ON public.projects AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own projects" ON public.projects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own projects" ON public.projects AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own projects" ON public.projects AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert rag logs in own projects" ON public.rag_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "Users can view rag logs in own projects" ON public.rag_logs AS PERMISSIVE FOR SELECT TO public
  USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

-- ===========================================================================
-- 9. Constraint comments
-- ===========================================================================
COMMENT ON CONSTRAINT entity_links_from_to_rel_unique ON public.entity_links IS 'Prevents duplicate relationship rows for the same (from_id, to_id, relation_type). App-level dedup/upsert remains valid and is now DB-enforced. Note: (A,B) and (B,A) are distinct rows; bidirectional relations may be stored as two rows or via direction=BI.';
COMMENT ON CONSTRAINT entity_suggestions_chapter_name_unique ON public.entity_suggestions IS 'Canonical uniqueness for suggestions. App upsert onConflict:''chapter_id,name'' targets this constraint. The redundant partial index idx_entity_suggestions_unique (chapter_id,name,type) WHERE status=''PENDING'' was dropped in migration integrity_constraints_fk_and_indexes.';

-- ===========================================================================
-- 10. Grants (Supabase default: full table privileges to anon/authenticated/
--     service_role; RLS is the actual access control). EXECUTE on app RPCs.
-- ===========================================================================
GRANT ALL ON public.analysis_jobs TO anon, authenticated, service_role;
GRANT ALL ON public.chapters TO anon, authenticated, service_role;
GRANT ALL ON public.chat_conversations TO anon, authenticated, service_role;
GRANT ALL ON public.chat_messages TO anon, authenticated, service_role;
GRANT ALL ON public.chunks TO anon, authenticated, service_role;
GRANT ALL ON public.entities TO anon, authenticated, service_role;
GRANT ALL ON public.entity_links TO anon, authenticated, service_role;
GRANT ALL ON public.entity_suggestions TO anon, authenticated, service_role;
GRANT ALL ON public.foreshadows TO anon, authenticated, service_role;
GRANT ALL ON public.genre_kits TO anon, authenticated, service_role;
GRANT ALL ON public.mentions TO anon, authenticated, service_role;
GRANT ALL ON public.personas TO anon, authenticated, service_role;
GRANT ALL ON public.projects TO anon, authenticated, service_role;
GRANT ALL ON public.rag_logs TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.check_relationship(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_conflicts(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_related_entities(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_entity_context(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_chat_messages(text, uuid, double precision, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_chunks(text, double precision, integer, uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_chapters_bm25(uuid, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_entities_bm25(uuid, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon, authenticated, service_role;

-- ============================================================================
-- END BASELINE
-- ============================================================================
