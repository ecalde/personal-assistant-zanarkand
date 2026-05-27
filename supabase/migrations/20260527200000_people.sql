-- Phase 11: people table + events.person_id link

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  nickname text NULL,
  birthday_month_day text NULL,
  relationship text NULL,
  likes text NULL,
  dislikes text NULL,
  gift_ideas text NULL,
  notes text NULL,
  last_contact_date date NULL,
  contact_cadence_days integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT people_name_nonempty_chk
    CHECK (char_length(name) > 0),
  CONSTRAINT people_birthday_month_day_chk
    CHECK (
      birthday_month_day IS NULL
      OR birthday_month_day ~ '^((0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]))$'
    ),
  CONSTRAINT people_contact_cadence_days_chk
    CHECK (contact_cadence_days IS NULL OR contact_cadence_days > 0)
);

CREATE INDEX people_user_id_name_idx ON public.people (user_id, name);

CREATE OR REPLACE FUNCTION public.set_people_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER people_set_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.set_people_updated_at();

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY people_select_own
  ON public.people
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY people_insert_own
  ON public.people
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY people_update_own
  ON public.people
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY people_delete_own
  ON public.people
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.people FROM PUBLIC;
REVOKE ALL ON TABLE public.people FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.people TO authenticated;

-- Link events to people (optional FK)
ALTER TABLE public.events
  ADD COLUMN person_id uuid NULL
  REFERENCES public.people (id) ON DELETE SET NULL;

CREATE INDEX events_user_id_person_id_idx ON public.events (user_id, person_id);

-- Tighten events RLS: person_id must belong to same user
DROP POLICY events_insert_own ON public.events;
DROP POLICY events_update_own ON public.events;

CREATE POLICY events_insert_own
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      person_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.people p
        WHERE p.id = person_id
          AND p.user_id = auth.uid()
      )
    )
  );

CREATE POLICY events_update_own
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      person_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.people p
        WHERE p.id = person_id
          AND p.user_id = auth.uid()
      )
    )
  );
