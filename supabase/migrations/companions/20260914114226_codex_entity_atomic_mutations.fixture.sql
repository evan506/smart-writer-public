-- LOCAL-ONLY behavior test. Runs only in the disposable db-replay container.

BEGIN;

INSERT INTO auth.users (id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO public.projects (id, user_id, title, excluded_terms)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '__atomic_entity_fixture__',
  '[]'::jsonb
);
INSERT INTO public.chapters (id, project_id, chapter_num, title, content)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  1,
  'fixture',
  'fixture'
);
INSERT INTO public.chunks (id, chapter_id, type, content)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  'SCENE',
  'fixture'
);
INSERT INTO public.entities (id, project_id, type, name, aliases)
VALUES
  ('55555555-5555-5555-5555-555555555551', '22222222-2222-2222-2222-222222222222', 'CHARACTER', 'source', '["src"]'),
  ('55555555-5555-5555-5555-555555555552', '22222222-2222-2222-2222-222222222222', 'CHARACTER', 'target', '["dst"]'),
  ('55555555-5555-5555-5555-555555555553', '22222222-2222-2222-2222-222222222222', 'PLACE', 'other', '[]'),
  ('55555555-5555-5555-5555-555555555554', '22222222-2222-2222-2222-222222222222', 'ITEM', 'delete-me', '[]');

INSERT INTO public.mentions (chunk_id, entity_id, count)
VALUES
  ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555551', 2),
  ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555552', 3);
INSERT INTO public.entity_links (from_id, to_id, relation_type, weight, direction)
VALUES
  ('55555555-5555-5555-5555-555555555551', '55555555-5555-5555-5555-555555555553', 'ALLY', 0.9, 'UNI'),
  ('55555555-5555-5555-5555-555555555552', '55555555-5555-5555-5555-555555555553', 'ALLY', 0.5, 'BI');
INSERT INTO public.entity_suggestions (project_id, chapter_id, name, type, matched_entity_id)
VALUES ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'source suggestion', 'CHARACTER', '55555555-5555-5555-5555-555555555551');
INSERT INTO public.foreshadows (project_id, planted_chapter, entity_ids)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  1,
  ARRAY[
    '55555555-5555-5555-5555-555555555551'::uuid,
    '55555555-5555-5555-5555-555555555552'::uuid,
    '55555555-5555-5555-5555-555555555554'::uuid
  ]
);

INSERT INTO public.canon_facts (id, project_id, entity_id, fact_type, fact_key, value, status)
VALUES
  ('66666666-6666-6666-6666-666666666661', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555551', 'ROLE', 'title', 'king', 'APPROVED'),
  ('66666666-6666-6666-6666-666666666662', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555552', 'ROLE', 'title', 'king', 'APPROVED'),
  ('66666666-6666-6666-6666-666666666663', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555551', 'ATTRIBUTE', 'race', 'elf', 'APPROVED');
INSERT INTO public.canon_fact_sources (fact_id, chapter_id, evidence_text)
VALUES ('66666666-6666-6666-6666-666666666661', '33333333-3333-3333-3333-333333333333', 'source evidence');

CREATE FUNCTION public.__fail_atomic_entity_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id = '55555555-5555-5555-5555-555555555551'::uuid THEN
    RAISE EXCEPTION 'forced final delete failure';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER __fail_atomic_entity_delete
BEFORE DELETE ON public.entities
FOR EACH ROW EXECUTE FUNCTION public.__fail_atomic_entity_delete();

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.merge_codex_entity_as_alias(
      '22222222-2222-2222-2222-222222222222',
      '55555555-5555-5555-5555-555555555551',
      '55555555-5555-5555-5555-555555555552'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: forced failure did not occur';
  END IF;
  IF (SELECT aliases FROM public.entities WHERE id = '55555555-5555-5555-5555-555555555552') <> '["dst"]'::jsonb THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: partial alias update survived rollback';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entities WHERE id = '55555555-5555-5555-5555-555555555551') THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: source disappeared after rollback';
  END IF;
END
$$;

RESET ROLE;
DROP TRIGGER __fail_atomic_entity_delete ON public.entities;
DROP FUNCTION public.__fail_atomic_entity_delete();
SET LOCAL ROLE authenticated;

SELECT * FROM public.merge_codex_entity_as_alias(
  '22222222-2222-2222-2222-222222222222',
  '55555555-5555-5555-5555-555555555551',
  '55555555-5555-5555-5555-555555555552'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.entities WHERE id = '55555555-5555-5555-5555-555555555551') THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: source still exists';
  END IF;
  IF (SELECT count FROM public.mentions WHERE entity_id = '55555555-5555-5555-5555-555555555552') <> 5 THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: mention counts were not merged';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.entity_links
    WHERE from_id = '55555555-5555-5555-5555-555555555552'
      AND to_id = '55555555-5555-5555-5555-555555555553'
      AND weight = 0.9 AND direction = 'BI'
  ) THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: duplicate links were not reconciled';
  END IF;
  IF (SELECT count(*) FROM public.canon_facts WHERE entity_id = '55555555-5555-5555-5555-555555555552') <> 2 THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: facts were not reconciled';
  END IF;
  IF (SELECT fact_id FROM public.canon_fact_sources WHERE evidence_text = 'source evidence')
     <> '66666666-6666-6666-6666-666666666662'::uuid THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: fact evidence was not moved';
  END IF;
  IF (SELECT cardinality(entity_ids) FROM public.foreshadows LIMIT 1) <> 2 THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: foreshadow ids were not deduplicated';
  END IF;
END
$$;

SELECT * FROM public.delete_codex_entity(
  '22222222-2222-2222-2222-222222222222',
  '55555555-5555-5555-5555-555555555554',
  true
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.foreshadows
    WHERE '55555555-5555-5555-5555-555555555554'::uuid = ANY(entity_ids)
  ) THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: deleted id remains in foreshadow';
  END IF;
  IF NOT (SELECT excluded_terms ? 'delete-me' FROM public.projects WHERE id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'ATOMIC ENTITY FIXTURE FAILED: blocked term was not stored';
  END IF;
  RAISE NOTICE 'ATOMIC ENTITY FIXTURE PASSED';
END
$$;

RESET ROLE;
ROLLBACK;
