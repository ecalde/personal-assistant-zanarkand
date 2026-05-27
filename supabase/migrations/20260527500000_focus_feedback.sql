-- Phase 16: focus feedback (dismiss / snooze visibility layer)

CREATE TABLE public.focus_feedback (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  focus_item_id text NOT NULL,
  action text NOT NULL,
  until_iso timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT focus_feedback_action_chk
    CHECK (action IN ('dismissed', 'snoozed')),
  CONSTRAINT focus_feedback_focus_item_id_nonempty_chk
    CHECK (char_length(focus_item_id) > 0),
  CONSTRAINT focus_feedback_snooze_until_chk
    CHECK (
      (action = 'snoozed' AND until_iso IS NOT NULL)
      OR (action = 'dismissed' AND until_iso IS NULL)
    )
);

CREATE INDEX focus_feedback_user_id_idx ON public.focus_feedback (user_id);
CREATE INDEX focus_feedback_focus_item_id_idx ON public.focus_feedback (focus_item_id);

CREATE OR REPLACE FUNCTION public.set_focus_feedback_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER focus_feedback_set_updated_at
  BEFORE UPDATE ON public.focus_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.set_focus_feedback_updated_at();

ALTER TABLE public.focus_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY focus_feedback_select_own
  ON public.focus_feedback
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY focus_feedback_insert_own
  ON public.focus_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY focus_feedback_update_own
  ON public.focus_feedback
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY focus_feedback_delete_own
  ON public.focus_feedback
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.focus_feedback FROM PUBLIC;
REVOKE ALL ON TABLE public.focus_feedback FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.focus_feedback TO authenticated;
