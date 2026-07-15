-- Migration: v3_2_genre_extraction_conventions_seed
-- Authored: 2026-06-14
--
-- Purpose:
--   Seed Layer-1 (genre baseline) extraction conventions into the 4 global
--   genre kits so new projects start from sensible defaults instead of zero.
--   This is the curated/operator layer of the V3.2.1 layered extraction
--   memory. It only describes EXTRACTION TOOL behavior (which candidates to
--   skip, genre-typical type hints) — never story content.
--
-- Shape:
--   genre_kits.rules is a JSONB array of rule objects. We APPEND one element:
--     { "extraction_conventions": {
--         "exclude_patterns": [ { "key", "text" }, ... ],
--         "type_conventions":  [ { "key", "text" }, ... ]
--     } }
--   Universal exclude patterns are duplicated into each kit in this slice
--   (no separate genre-independent base kit yet).
--
-- Idempotent: skips kits that already carry an extraction_conventions element.
-- Replay-safe: on a fresh replay DB with no seeded kits, this updates 0 rows.

BEGIN;

-- 로맨스물 -----------------------------------------------------------------
UPDATE public.genre_kits
SET rules = rules || jsonb_build_array(
  jsonb_build_object('extraction_conventions', jsonb_build_object(
    'exclude_patterns', jsonb_build_array(
      jsonb_build_object('key', 'unspecified_individual',
        'text', '이름이 없는 불특정 인물(예: 지나가던 행인, 카페 점원)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'collective_crowd',
        'text', '고유명이 없는 집단·군중(예: 사람들, 친구들)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'pronoun_reference',
        'text', '대명사나 일반 지칭(그, 그녀, 그것)은 독립 설정 후보로 만들지 않습니다.'),
      jsonb_build_object('key', 'flashback_duplicate',
        'text', '회상 속에서 다시 언급된 기존 인물은 새로운 후보로 중복 생성하지 않습니다.')
    ),
    'type_conventions', jsonb_build_array(
      jsonb_build_object('key', 'romance_place_hint',
        'text', '데이트 장소·약속 장소로만 등장하는 일반 공간은 중요 장소가 아니면 후보 우선순위를 낮춥니다.')
    )
  ))
)
WHERE genre_type = '로맨스물'
  AND user_id IS NULL
  AND is_public = true
  AND jsonb_typeof(rules) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(rules) elem
    WHERE elem ? 'extraction_conventions'
  );

-- 빙의물 -------------------------------------------------------------------
UPDATE public.genre_kits
SET rules = rules || jsonb_build_array(
  jsonb_build_object('extraction_conventions', jsonb_build_object(
    'exclude_patterns', jsonb_build_array(
      jsonb_build_object('key', 'unspecified_individual',
        'text', '이름이 없는 불특정 인물(예: 무명 시종, 지나가던 상인)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'collective_crowd',
        'text', '고유명이 없는 집단·군중(예: 귀족들, 하인들)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'pronoun_reference',
        'text', '대명사나 일반 지칭(그, 그녀, 그것)은 독립 설정 후보로 만들지 않습니다.'),
      jsonb_build_object('key', 'flashback_duplicate',
        'text', '회상 속에서 다시 언급된 기존 인물은 새로운 후보로 중복 생성하지 않습니다.')
    ),
    'type_conventions', jsonb_build_array(
      jsonb_build_object('key', 'possession_concept',
        'text', '빙의·빙의 트리거 같은 설정 장치는 인물이 아니라 개념(CONCEPT)으로 분류합니다.')
    )
  ))
)
WHERE genre_type = '빙의물'
  AND user_id IS NULL
  AND is_public = true
  AND jsonb_typeof(rules) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(rules) elem
    WHERE elem ? 'extraction_conventions'
  );

-- 헌터물 -------------------------------------------------------------------
UPDATE public.genre_kits
SET rules = rules || jsonb_build_array(
  jsonb_build_object('extraction_conventions', jsonb_build_object(
    'exclude_patterns', jsonb_build_array(
      jsonb_build_object('key', 'unspecified_individual',
        'text', '이름이 없는 불특정 인물(예: 무명 헌터, 지나가던 각성자)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'collective_crowd',
        'text', '고유명이 없는 집단·군중(예: 몬스터 무리, 헌터들)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'pronoun_reference',
        'text', '대명사나 일반 지칭(그, 그녀, 그것)은 독립 설정 후보로 만들지 않습니다.'),
      jsonb_build_object('key', 'flashback_duplicate',
        'text', '회상 속에서 다시 언급된 기존 인물은 새로운 후보로 중복 생성하지 않습니다.')
    ),
    'type_conventions', jsonb_build_array(
      jsonb_build_object('key', 'gate_dungeon_place',
        'text', '게이트·던전·레이드 구역은 장소(PLACE)로 분류합니다.'),
      jsonb_build_object('key', 'guild_org',
        'text', '길드·협회는 단체(ORGANIZATION)로 분류합니다.'),
      jsonb_build_object('key', 'skill_system',
        'text', '스킬·스탯·등급 체계는 개념(CONCEPT) 또는 마법 체계(MAGIC_SYSTEM)로 분류합니다.')
    )
  ))
)
WHERE genre_type = '헌터물'
  AND user_id IS NULL
  AND is_public = true
  AND jsonb_typeof(rules) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(rules) elem
    WHERE elem ? 'extraction_conventions'
  );

-- 회귀물 -------------------------------------------------------------------
UPDATE public.genre_kits
SET rules = rules || jsonb_build_array(
  jsonb_build_object('extraction_conventions', jsonb_build_object(
    'exclude_patterns', jsonb_build_array(
      jsonb_build_object('key', 'unspecified_individual',
        'text', '이름이 없는 불특정 인물(예: 무명 병사, 지나가던 상인)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'collective_crowd',
        'text', '고유명이 없는 집단·군중(예: 마을 사람들, 병사들)은 설정 후보로 추출하지 않습니다.'),
      jsonb_build_object('key', 'pronoun_reference',
        'text', '대명사나 일반 지칭(그, 그녀, 그것)은 독립 설정 후보로 만들지 않습니다.'),
      jsonb_build_object('key', 'flashback_duplicate',
        'text', '회상·전생 장면에서 다시 언급된 기존 인물은 새로운 후보로 중복 생성하지 않습니다.')
    ),
    'type_conventions', jsonb_build_array(
      jsonb_build_object('key', 'regression_concept',
        'text', '회귀·타임루프 같은 설정 장치는 인물이 아니라 개념(CONCEPT)으로 분류합니다.')
    )
  ))
)
WHERE genre_type = '회귀물'
  AND user_id IS NULL
  AND is_public = true
  AND jsonb_typeof(rules) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(rules) elem
    WHERE elem ? 'extraction_conventions'
  );

COMMIT;
