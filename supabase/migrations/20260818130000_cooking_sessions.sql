-- Phase 2: per-user cooking sessions (activity log for XP + mastery)

CREATE TABLE public.cooking_sessions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipe_id uuid NULL REFERENCES public.recipes (id) ON DELETE SET NULL,
  recipe_title text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  cook_date date NOT NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  duration_minutes integer NULL,
  servings_made integer NULL,
  notes text NULL,
  current_step_index integer NULL,
  timers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cooking_sessions_title_nonempty_chk CHECK (char_length(recipe_title) > 0),
  CONSTRAINT cooking_sessions_status_chk CHECK (status IN (
    'in_progress', 'completed', 'abandoned'
  )),
  CONSTRAINT cooking_sessions_duration_chk CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CONSTRAINT cooking_sessions_servings_chk CHECK (servings_made IS NULL OR servings_made > 0),
  CONSTRAINT cooking_sessions_step_index_chk CHECK (
    current_step_index IS NULL OR current_step_index >= 0
  ),
  CONSTRAINT cooking_sessions_timers_array_chk CHECK (jsonb_typeof(timers) = 'array')
);

CREATE INDEX cooking_sessions_user_id_cook_date_idx
  ON public.cooking_sessions (user_id, cook_date DESC);

CREATE INDEX cooking_sessions_user_id_recipe_id_idx
  ON public.cooking_sessions (user_id, recipe_id);

CREATE INDEX cooking_sessions_user_id_status_idx
  ON public.cooking_sessions (user_id, status);

CREATE OR REPLACE FUNCTION public.set_cooking_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cooking_sessions_set_updated_at
  BEFORE UPDATE ON public.cooking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_cooking_sessions_updated_at();

ALTER TABLE public.cooking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cooking_sessions_select_own
  ON public.cooking_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY cooking_sessions_insert_own
  ON public.cooking_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY cooking_sessions_update_own
  ON public.cooking_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY cooking_sessions_delete_own
  ON public.cooking_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.cooking_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.cooking_sessions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cooking_sessions TO authenticated;
