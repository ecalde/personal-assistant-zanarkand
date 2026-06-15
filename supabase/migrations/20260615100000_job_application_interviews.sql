-- Phase 12.2: scheduled interviews on job applications

ALTER TABLE public.job_applications
  ADD COLUMN interviews jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_interviews_array_chk
  CHECK (jsonb_typeof(interviews) = 'array');
