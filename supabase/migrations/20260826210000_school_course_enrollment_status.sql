-- Enrollment lifecycle for school courses: enrolled (active), completed (stored,
-- hidden from the Term Timeline), or dropped (stored unless the user deletes).

ALTER TABLE public.school_courses
  ADD COLUMN IF NOT EXISTS enrollment_status text NOT NULL DEFAULT 'enrolled';

ALTER TABLE public.school_courses
  DROP CONSTRAINT IF EXISTS school_courses_enrollment_status_chk;

ALTER TABLE public.school_courses
  ADD CONSTRAINT school_courses_enrollment_status_chk
  CHECK (enrollment_status IN ('enrolled', 'completed', 'dropped'));
