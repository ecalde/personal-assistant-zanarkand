-- Phase 16.1: optional human-readable snapshot on focus feedback rows

ALTER TABLE public.focus_feedback
  ADD COLUMN IF NOT EXISTS source_snapshot text NULL;

ALTER TABLE public.focus_feedback
  DROP CONSTRAINT IF EXISTS focus_feedback_source_snapshot_nonempty_chk;

ALTER TABLE public.focus_feedback
  ADD CONSTRAINT focus_feedback_source_snapshot_nonempty_chk
    CHECK (
      source_snapshot IS NULL
      OR char_length(source_snapshot) > 0
    );
