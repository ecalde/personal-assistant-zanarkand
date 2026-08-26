-- Optional calendar overlay color for a school course (palette token, e.g. "blue.base").
-- Kind colors (exam/quiz/…) stay on calendar preferences; this token is a right-to-left overlay.

ALTER TABLE public.school_courses
  ADD COLUMN IF NOT EXISTS color_token text NULL;

ALTER TABLE public.school_courses
  DROP CONSTRAINT IF EXISTS school_courses_color_token_chk;

ALTER TABLE public.school_courses
  ADD CONSTRAINT school_courses_color_token_chk
  CHECK (
    color_token IS NULL
    OR color_token ~ '^(red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate)\.(soft|base|strong)$'
  );
