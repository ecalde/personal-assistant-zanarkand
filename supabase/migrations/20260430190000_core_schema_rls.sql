-- Phase 1: core schema + RLS (Option B)
-- No secrets. Apply via Supabase CLI or SQL editor; do not commit real credentials.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Column defaults use extensions.gen_random_uuid() after pgcrypto is in extensions schema.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  priority smallint NULL,
  daily_goal_minutes integer NULL,
  weekly_goal_minutes integer NULL,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_priority_range_chk
    CHECK (priority IS NULL OR (priority >= 1 AND priority <= 4)),
  CONSTRAINT skills_schedule_object_chk
    CHECK (jsonb_typeof(schedule) = 'object')
);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills (id) ON DELETE CASCADE,
  minutes integer NOT NULL,
  started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_minutes_positive_chk
    CHECK (minutes > 0)
);

CREATE TABLE public.overrides (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX skills_user_id_idx ON public.skills (user_id);

CREATE INDEX sessions_user_id_idx ON public.sessions (user_id);

CREATE INDEX sessions_user_id_started_at_idx ON public.sessions (user_id, started_at DESC);

CREATE INDEX sessions_skill_id_idx ON public.sessions (skill_id);

CREATE INDEX overrides_user_id_idx ON public.overrides (user_id);

-- ---------------------------------------------------------------------------
-- updated_at on skills
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_skills_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER skills_set_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.set_skills_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overrides ENABLE ROW LEVEL SECURITY;

-- skills
CREATE POLICY skills_select_own
  ON public.skills
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY skills_insert_own
  ON public.skills
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY skills_update_own
  ON public.skills
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY skills_delete_own
  ON public.skills
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- sessions
CREATE POLICY sessions_select_own
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY sessions_insert_own
  ON public.sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.skills s
      WHERE s.id = skill_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY sessions_update_own
  ON public.sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.skills s
      WHERE s.id = skill_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY sessions_delete_own
  ON public.sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- overrides
CREATE POLICY overrides_select_own
  ON public.overrides
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY overrides_insert_own
  ON public.overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY overrides_update_own
  ON public.overrides
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY overrides_delete_own
  ON public.overrides
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privileges: authenticated only (no anon)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.skills FROM PUBLIC;
REVOKE ALL ON TABLE public.skills FROM anon;
REVOKE ALL ON TABLE public.sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.sessions FROM anon;
REVOKE ALL ON TABLE public.overrides FROM PUBLIC;
REVOKE ALL ON TABLE public.overrides FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.overrides TO authenticated;
