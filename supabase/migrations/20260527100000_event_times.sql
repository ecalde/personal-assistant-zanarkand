-- Phase 8.1: optional event start/end times

ALTER TABLE public.events
  ADD COLUMN start_time text NULL,
  ADD COLUMN end_time text NULL;

ALTER TABLE public.events
  ADD CONSTRAINT events_start_time_hhmm_chk
    CHECK (start_time IS NULL OR start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT events_end_time_hhmm_chk
    CHECK (end_time IS NULL OR end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT events_end_requires_start_chk
    CHECK (end_time IS NULL OR start_time IS NOT NULL),
  ADD CONSTRAINT events_end_after_start_chk
    CHECK (
      start_time IS NULL
      OR end_time IS NULL
      OR end_time >= start_time
    );
