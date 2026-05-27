-- Phase 13: workout plans + workout sessions

CREATE TABLE public.workout_plans (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  focus text NULL,
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_plans_name_nonempty_chk
    CHECK (char_length(name) > 0),
  CONSTRAINT workout_plans_focus_chk
    CHECK (
      focus IS NULL
      OR focus IN ('push', 'pull', 'legs', 'full_body', 'cardio', 'mobility')
    ),
  CONSTRAINT workout_plans_exercises_array_chk
    CHECK (jsonb_typeof(exercises) = 'array')
);

CREATE INDEX workout_plans_user_id_updated_at_idx
  ON public.workout_plans (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_workout_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workout_plans_set_updated_at
  BEFORE UPDATE ON public.workout_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workout_plans_updated_at();

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY workout_plans_select_own
  ON public.workout_plans
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY workout_plans_insert_own
  ON public.workout_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY workout_plans_update_own
  ON public.workout_plans
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY workout_plans_delete_own
  ON public.workout_plans
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.workout_plans FROM PUBLIC;
REVOKE ALL ON TABLE public.workout_plans FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_plans TO authenticated;

-- ---------------------------------------------------------------------------

CREATE TABLE public.workout_sessions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  workout_date date NOT NULL,
  focus text NULL,
  plan_id uuid NULL,
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_sessions_focus_chk
    CHECK (
      focus IS NULL
      OR focus IN ('push', 'pull', 'legs', 'full_body', 'cardio', 'mobility')
    ),
  CONSTRAINT workout_sessions_exercises_array_chk
    CHECK (jsonb_typeof(exercises) = 'array')
);

CREATE INDEX workout_sessions_user_id_workout_date_idx
  ON public.workout_sessions (user_id, workout_date DESC);

CREATE INDEX workout_sessions_user_id_plan_id_idx
  ON public.workout_sessions (user_id, plan_id);

CREATE OR REPLACE FUNCTION public.set_workout_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workout_sessions_set_updated_at
  BEFORE UPDATE ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workout_sessions_updated_at();

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workout_sessions_select_own
  ON public.workout_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY workout_sessions_insert_own
  ON public.workout_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY workout_sessions_update_own
  ON public.workout_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY workout_sessions_delete_own
  ON public.workout_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.workout_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.workout_sessions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_sessions TO authenticated;
