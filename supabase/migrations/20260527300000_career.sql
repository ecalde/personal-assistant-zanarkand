-- Phase 12: career targets + job applications

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company text NOT NULL,
  role_title text NOT NULL,
  status text NOT NULL,
  salary_min integer NULL,
  salary_max integer NULL,
  location text NULL,
  remote_policy text NULL,
  applied_date date NULL,
  url text NULL,
  notes text NULL,
  required_skill_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_skills_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_applications_company_nonempty_chk
    CHECK (char_length(company) > 0),
  CONSTRAINT job_applications_role_title_nonempty_chk
    CHECK (char_length(role_title) > 0),
  CONSTRAINT job_applications_status_chk
    CHECK (status IN (
      'saved', 'applied', 'screening', 'technical', 'onsite', 'offer', 'rejected', 'withdrawn'
    )),
  CONSTRAINT job_applications_remote_policy_chk
    CHECK (
      remote_policy IS NULL
      OR remote_policy IN ('remote', 'hybrid', 'onsite', 'unknown')
    ),
  CONSTRAINT job_applications_salary_min_chk
    CHECK (salary_min IS NULL OR salary_min > 0),
  CONSTRAINT job_applications_salary_max_chk
    CHECK (
      salary_max IS NULL
      OR (salary_max > 0 AND (salary_min IS NULL OR salary_max >= salary_min))
    ),
  CONSTRAINT job_applications_required_skill_ids_array_chk
    CHECK (jsonb_typeof(required_skill_ids) = 'array')
);

CREATE INDEX job_applications_user_id_status_idx
  ON public.job_applications (user_id, status);

CREATE INDEX job_applications_user_id_applied_date_idx
  ON public.job_applications (user_id, applied_date DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.set_job_applications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_applications_set_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_job_applications_updated_at();

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_applications_select_own
  ON public.job_applications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY job_applications_insert_own
  ON public.job_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY job_applications_update_own
  ON public.job_applications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY job_applications_delete_own
  ON public.job_applications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.job_applications FROM PUBLIC;
REVOKE ALL ON TABLE public.job_applications FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_applications TO authenticated;

-- ---------------------------------------------------------------------------

CREATE TABLE public.career_targets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role_title text NOT NULL,
  company text NULL,
  notes text NULL,
  required_skill_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_skills_text text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_targets_user_id_unique UNIQUE (user_id),
  CONSTRAINT career_targets_role_title_nonempty_chk
    CHECK (char_length(role_title) > 0),
  CONSTRAINT career_targets_required_skill_ids_array_chk
    CHECK (jsonb_typeof(required_skill_ids) = 'array')
);

CREATE OR REPLACE FUNCTION public.set_career_targets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER career_targets_set_updated_at
  BEFORE UPDATE ON public.career_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_career_targets_updated_at();

ALTER TABLE public.career_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY career_targets_select_own
  ON public.career_targets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY career_targets_insert_own
  ON public.career_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY career_targets_update_own
  ON public.career_targets
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY career_targets_delete_own
  ON public.career_targets
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.career_targets FROM PUBLIC;
REVOKE ALL ON TABLE public.career_targets FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.career_targets TO authenticated;
