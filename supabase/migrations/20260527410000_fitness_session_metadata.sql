-- Phase 13.1a: optional workout session duration and completion timestamp

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes integer NULL;

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS workout_sessions_duration_minutes_chk;

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT workout_sessions_duration_minutes_chk
    CHECK (duration_minutes IS NULL OR duration_minutes > 0);
