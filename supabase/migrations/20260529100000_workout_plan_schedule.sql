-- Phase 28: workout plan weekly schedule + optional schedule-series bounds
--
-- Additive: existing rows get empty schedule object (not schedulable until blocks added).
-- Deep validation lives in dbMappers (parseWeeklySchedule / parseSkillScheduleSeries).

ALTER TABLE public.workout_plans
  ADD COLUMN schedule jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.workout_plans
  ADD COLUMN schedule_series jsonb NULL;

ALTER TABLE public.workout_plans
  ADD COLUMN series_id uuid NULL;

ALTER TABLE public.workout_plans
  ADD CONSTRAINT workout_plans_schedule_object_chk
    CHECK (jsonb_typeof(schedule) = 'object');

ALTER TABLE public.workout_plans
  ADD CONSTRAINT workout_plans_schedule_series_object_chk
    CHECK (schedule_series IS NULL OR jsonb_typeof(schedule_series) = 'object');

CREATE INDEX workout_plans_user_id_series_id_idx
  ON public.workout_plans (user_id, series_id)
  WHERE series_id IS NOT NULL;
