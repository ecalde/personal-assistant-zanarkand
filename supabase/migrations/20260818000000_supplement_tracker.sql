-- Phase 47: supplement protocols + daily intake logs

CREATE TABLE public.supplement_protocols (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  form text NULL,
  unit text NOT NULL,
  notes text NULL,
  active boolean NOT NULL DEFAULT true,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplement_protocols_name_nonempty_chk
    CHECK (char_length(name) > 0),
  CONSTRAINT supplement_protocols_form_chk
    CHECK (
      form IS NULL
      OR form IN ('powder', 'capsule', 'liquid', 'other')
    ),
  CONSTRAINT supplement_protocols_unit_chk
    CHECK (
      unit IN ('g', 'mg', 'mcg', 'iu', 'scoop', 'capsule', 'drop')
    ),
  CONSTRAINT supplement_protocols_phases_array_chk
    CHECK (jsonb_typeof(phases) = 'array')
);

CREATE INDEX supplement_protocols_user_id_updated_at_idx
  ON public.supplement_protocols (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_supplement_protocols_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplement_protocols_set_updated_at
  BEFORE UPDATE ON public.supplement_protocols
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supplement_protocols_updated_at();

ALTER TABLE public.supplement_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplement_protocols_select_own
  ON public.supplement_protocols
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY supplement_protocols_insert_own
  ON public.supplement_protocols
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY supplement_protocols_update_own
  ON public.supplement_protocols
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY supplement_protocols_delete_own
  ON public.supplement_protocols
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.supplement_protocols FROM PUBLIC;
REVOKE ALL ON TABLE public.supplement_protocols FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplement_protocols TO authenticated;

-- ---------------------------------------------------------------------------

CREATE TABLE public.supplement_intake_logs (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  protocol_id uuid NOT NULL REFERENCES public.supplement_protocols (id) ON DELETE CASCADE,
  intake_date date NOT NULL,
  doses jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplement_intake_logs_doses_array_chk
    CHECK (jsonb_typeof(doses) = 'array'),
  CONSTRAINT supplement_intake_logs_protocol_date_uidx
    UNIQUE (user_id, protocol_id, intake_date)
);

CREATE INDEX supplement_intake_logs_user_id_intake_date_idx
  ON public.supplement_intake_logs (user_id, intake_date DESC);

CREATE INDEX supplement_intake_logs_user_id_protocol_id_idx
  ON public.supplement_intake_logs (user_id, protocol_id);

CREATE OR REPLACE FUNCTION public.set_supplement_intake_logs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplement_intake_logs_set_updated_at
  BEFORE UPDATE ON public.supplement_intake_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supplement_intake_logs_updated_at();

ALTER TABLE public.supplement_intake_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplement_intake_logs_select_own
  ON public.supplement_intake_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY supplement_intake_logs_insert_own
  ON public.supplement_intake_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY supplement_intake_logs_update_own
  ON public.supplement_intake_logs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY supplement_intake_logs_delete_own
  ON public.supplement_intake_logs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.supplement_intake_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.supplement_intake_logs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplement_intake_logs TO authenticated;
