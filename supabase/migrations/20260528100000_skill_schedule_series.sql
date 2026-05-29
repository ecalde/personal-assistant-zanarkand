-- Phase 23: optional skill schedule-series bounds
--
-- Additive and nullable: existing rows are preserved (schedule_series NULL means
-- indefinite / legacy behavior). Deep validation lives in the mapper
-- (parseSkillScheduleSeries); SQL only enforces the jsonb object shape. RLS,
-- policies, grants, and the updated_at trigger on public.skills remain unchanged.

ALTER TABLE public.skills
  ADD COLUMN schedule_series jsonb NULL;

ALTER TABLE public.skills
  ADD CONSTRAINT skills_schedule_series_object_chk
    CHECK (schedule_series IS NULL OR jsonb_typeof(schedule_series) = 'object');
