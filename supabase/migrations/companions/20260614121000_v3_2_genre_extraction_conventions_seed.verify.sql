-- Verification for: 20260614121000_v3_2_genre_extraction_conventions_seed.sql
--
-- Behavioral check. Self-skips on a fresh replay DB where no global genre
-- kits are seeded (only remote carries the 4 public kits).

DO $$
BEGIN
  -- Only assert when global genre kits actually exist in this DB.
  IF EXISTS (
    SELECT 1 FROM public.genre_kits
    WHERE user_id IS NULL AND is_public = true
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.genre_kits k
      WHERE k.user_id IS NULL
        AND k.is_public = true
        AND jsonb_typeof(k.rules) = 'array'
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(k.rules) elem
          WHERE elem ? 'extraction_conventions'
        )
    ) THEN
      RAISE EXCEPTION 'GENRE EXTRACTION CONVENTIONS VERIFY FAILED: a public genre kit lacks extraction_conventions';
    END IF;
  END IF;
END $$;
