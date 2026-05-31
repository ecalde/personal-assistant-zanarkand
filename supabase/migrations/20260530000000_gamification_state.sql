-- Phase 35: gamification UX state (per-user singleton).
-- Stores only acknowledgement state (level-up seen, dismissed achievement
-- badges); XP, levels, achievements, and quests are recomputed client-side.

CREATE TABLE public.gamification_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gamification_state_state_object_chk
    CHECK (jsonb_typeof(state) = 'object')
);

CREATE OR REPLACE FUNCTION public.set_gamification_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER gamification_state_set_updated_at
  BEFORE UPDATE ON public.gamification_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_gamification_state_updated_at();

ALTER TABLE public.gamification_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY gamification_state_select_own
  ON public.gamification_state
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY gamification_state_insert_own
  ON public.gamification_state
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY gamification_state_update_own
  ON public.gamification_state
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY gamification_state_delete_own
  ON public.gamification_state
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.gamification_state FROM PUBLIC;
REVOKE ALL ON TABLE public.gamification_state FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gamification_state TO authenticated;
