-- Phase 20: calendar color/category preferences (per-user singleton)

CREATE TABLE public.calendar_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  preferences jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_preferences_preferences_object_chk
    CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE OR REPLACE FUNCTION public.set_calendar_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER calendar_preferences_set_updated_at
  BEFORE UPDATE ON public.calendar_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_calendar_preferences_updated_at();

ALTER TABLE public.calendar_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_preferences_select_own
  ON public.calendar_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY calendar_preferences_insert_own
  ON public.calendar_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY calendar_preferences_update_own
  ON public.calendar_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY calendar_preferences_delete_own
  ON public.calendar_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.calendar_preferences FROM PUBLIC;
REVOKE ALL ON TABLE public.calendar_preferences FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_preferences TO authenticated;
