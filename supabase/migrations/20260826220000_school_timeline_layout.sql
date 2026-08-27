-- Term Timeline presentation (column merges and header/row labels).
-- Does not change school_courses.grade_categories.

CREATE TABLE public.school_timeline_layout (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  layout jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_timeline_layout_object_chk
    CHECK (jsonb_typeof(layout) = 'object')
);

CREATE OR REPLACE FUNCTION public.set_school_timeline_layout_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER school_timeline_layout_set_updated_at
  BEFORE UPDATE ON public.school_timeline_layout
  FOR EACH ROW
  EXECUTE FUNCTION public.set_school_timeline_layout_updated_at();

ALTER TABLE public.school_timeline_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_timeline_layout_select_own
  ON public.school_timeline_layout
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY school_timeline_layout_insert_own
  ON public.school_timeline_layout
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_timeline_layout_update_own
  ON public.school_timeline_layout
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_timeline_layout_delete_own
  ON public.school_timeline_layout
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.school_timeline_layout FROM PUBLIC;
REVOKE ALL ON TABLE public.school_timeline_layout FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_timeline_layout TO authenticated;
