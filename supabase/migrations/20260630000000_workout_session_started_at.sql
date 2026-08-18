-- Phase 42: optional workout session start time (calendar block start).
-- Sessions without started_at fall back to completed_at for legacy rows.

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL;
