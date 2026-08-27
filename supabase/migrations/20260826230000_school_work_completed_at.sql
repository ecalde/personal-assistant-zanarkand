-- Per-item completion for school reminders and graded work. Null means incomplete.

ALTER TABLE public.school_reminders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

ALTER TABLE public.school_graded_items
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;
