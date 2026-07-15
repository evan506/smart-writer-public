-- Rollback for: 20260614121000_v3_2_genre_extraction_conventions_seed.sql
--
-- Removes the appended extraction_conventions element from each global genre
-- kit's rules array, restoring the pre-seed shape. Other rule elements
-- (the {rule, category} entries and the {excluded_character_terms} entry)
-- are preserved.

BEGIN;

UPDATE public.genre_kits
SET rules = (
  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(rules) elem
  WHERE NOT (elem ? 'extraction_conventions')
)
WHERE user_id IS NULL
  AND is_public = true
  AND jsonb_typeof(rules) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(rules) e
    WHERE e ? 'extraction_conventions'
  );

COMMIT;
