-- Phase 54: School domain tables + drop EventType school

CREATE TABLE public.school_courses (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NULL,
  term text NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  notes text NULL,
  staff jsonb NOT NULL DEFAULT '[]'::jsonb,
  office_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  late_policy jsonb NULL,
  extra_credit_notes text NULL,
  scoring_notes text NULL,
  grade_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_courses_name_nonempty_chk CHECK (char_length(name) > 0),
  CONSTRAINT school_courses_timezone_nonempty_chk CHECK (char_length(timezone) > 0),
  CONSTRAINT school_courses_staff_array_chk CHECK (jsonb_typeof(staff) = 'array'),
  CONSTRAINT school_courses_office_hours_array_chk CHECK (jsonb_typeof(office_hours) = 'array'),
  CONSTRAINT school_courses_grade_categories_array_chk CHECK (jsonb_typeof(grade_categories) = 'array'),
  CONSTRAINT school_courses_late_policy_object_chk CHECK (
    late_policy IS NULL OR jsonb_typeof(late_policy) = 'object'
  )
);

CREATE INDEX school_courses_user_id_updated_at_idx
  ON public.school_courses (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_school_courses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER school_courses_set_updated_at
  BEFORE UPDATE ON public.school_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_school_courses_updated_at();

ALTER TABLE public.school_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_courses_select_own
  ON public.school_courses
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY school_courses_insert_own
  ON public.school_courses
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_courses_update_own
  ON public.school_courses
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_courses_delete_own
  ON public.school_courses
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.school_courses FROM PUBLIC;
REVOKE ALL ON TABLE public.school_courses FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_courses TO authenticated;

-- ---------------------------------------------------------------------------

CREATE TABLE public.school_reminders (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.school_courses (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  due_date date NOT NULL,
  start_time text NULL,
  end_time text NULL,
  open_date date NULL,
  open_time text NULL,
  close_date date NULL,
  close_time text NULL,
  notes text NULL,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprint text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_reminders_title_nonempty_chk CHECK (char_length(title) > 0),
  CONSTRAINT school_reminders_kind_chk CHECK (kind IN (
    'assignment', 'quiz', 'exam', 'project', 'study', 'reading', 'other'
  )),
  CONSTRAINT school_reminders_links_array_chk CHECK (jsonb_typeof(links) = 'array')
);

CREATE INDEX school_reminders_user_id_due_date_idx
  ON public.school_reminders (user_id, due_date);

CREATE INDEX school_reminders_user_id_course_id_idx
  ON public.school_reminders (user_id, course_id);

CREATE OR REPLACE FUNCTION public.set_school_reminders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER school_reminders_set_updated_at
  BEFORE UPDATE ON public.school_reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_school_reminders_updated_at();

ALTER TABLE public.school_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_reminders_select_own
  ON public.school_reminders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY school_reminders_insert_own
  ON public.school_reminders
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_reminders_update_own
  ON public.school_reminders
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_reminders_delete_own
  ON public.school_reminders
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.school_reminders FROM PUBLIC;
REVOKE ALL ON TABLE public.school_reminders FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_reminders TO authenticated;

-- ---------------------------------------------------------------------------

CREATE TABLE public.school_graded_items (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.school_courses (id) ON DELETE CASCADE,
  category_id uuid NULL,
  reminder_id uuid NULL REFERENCES public.school_reminders (id) ON DELETE SET NULL,
  name text NOT NULL,
  due_date date NULL,
  due_time text NULL,
  max_score double precision NULL,
  score double precision NULL,
  extra_credit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_graded_items_name_nonempty_chk CHECK (char_length(name) > 0),
  CONSTRAINT school_graded_items_max_score_chk CHECK (max_score IS NULL OR max_score >= 0),
  CONSTRAINT school_graded_items_score_chk CHECK (score IS NULL OR score >= 0)
);

CREATE INDEX school_graded_items_user_id_course_id_idx
  ON public.school_graded_items (user_id, course_id);

CREATE OR REPLACE FUNCTION public.set_school_graded_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER school_graded_items_set_updated_at
  BEFORE UPDATE ON public.school_graded_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_school_graded_items_updated_at();

ALTER TABLE public.school_graded_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_graded_items_select_own
  ON public.school_graded_items
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY school_graded_items_insert_own
  ON public.school_graded_items
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_graded_items_update_own
  ON public.school_graded_items
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY school_graded_items_delete_own
  ON public.school_graded_items
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.school_graded_items FROM PUBLIC;
REVOKE ALL ON TABLE public.school_graded_items FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_graded_items TO authenticated;

-- ---------------------------------------------------------------------------
-- Existing life events of type school become generic "other" (title unchanged).

UPDATE public.events
SET type = 'other'
WHERE type IN ('school', 'deadline');

ALTER TABLE public.events
  DROP CONSTRAINT events_type_chk;

ALTER TABLE public.events
  ADD CONSTRAINT events_type_chk
  CHECK (
    type IN (
      'birthday',
      'hangout',
      'trip',
      'holiday',
      'vacation',
      'work',
      'other'
    )
  );
