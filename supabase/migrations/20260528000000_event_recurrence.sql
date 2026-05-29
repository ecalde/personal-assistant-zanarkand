-- Phase 22B: optional event recurrence + series linkage
--
-- Additive and nullable: existing rows are preserved (recurrence/series_id NULL
-- means a one-time event). Deep recurrence-rule validation lives in the mapper
-- (parseRecurrenceRule); SQL only enforces the jsonb object shape. RLS, policies,
-- grants, and the updated_at trigger on public.events remain unchanged.

ALTER TABLE public.events
  ADD COLUMN recurrence jsonb NULL,
  ADD COLUMN series_id uuid NULL;

ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_object_chk
    CHECK (recurrence IS NULL OR jsonb_typeof(recurrence) = 'object');

CREATE INDEX events_user_id_series_id_idx
  ON public.events (user_id, series_id)
  WHERE series_id IS NOT NULL;
