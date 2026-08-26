-- Optional year of birth on people (month/day remains independent).

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS birth_year integer NULL;

ALTER TABLE public.people
  DROP CONSTRAINT IF EXISTS people_birth_year_chk;

ALTER TABLE public.people
  ADD CONSTRAINT people_birth_year_chk
  CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2100));
