-- Phase 8: life events table + RLS

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  type text NOT NULL,
  person_name text NULL,
  notes text NULL,
  reminder boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_title_nonempty_chk
    CHECK (char_length(title) > 0),
  CONSTRAINT events_type_chk
    CHECK (type IN ('birthday', 'hangout', 'trip', 'holiday', 'deadline', 'other'))
);

CREATE INDEX events_user_id_date_idx ON public.events (user_id, date);

CREATE OR REPLACE FUNCTION public.set_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_events_updated_at();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select_own
  ON public.events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY events_insert_own
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY events_update_own
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY events_delete_own
  ON public.events
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.events FROM PUBLIC;
REVOKE ALL ON TABLE public.events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.events TO authenticated;
