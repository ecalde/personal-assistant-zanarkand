-- Phase 1C: Resume Tool Postgres tables (architecture §33).
-- Isolated from AppPayload. No resume_preferences table (MVP uses localStorage).
-- import_fact_ledger is the frozen upload ledger; it is not rebuilt from working text.
-- active_version_id is nullable on insert, then set after the first version row exists.

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------

CREATE TABLE public.resumes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  source_filename text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  active_version_id uuid NULL,
  import_fact_ledger jsonb NOT NULL DEFAULT '{"facts":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resumes_id_user_id_uq UNIQUE (id, user_id),
  CONSTRAINT resumes_name_nonempty_chk CHECK (char_length(name) > 0),
  CONSTRAINT resumes_source_filename_nonempty_chk CHECK (char_length(source_filename) > 0),
  CONSTRAINT resumes_import_fact_ledger_object_chk CHECK (
    jsonb_typeof(import_fact_ledger) = 'object'
    AND jsonb_typeof(import_fact_ledger -> 'facts') = 'array'
  )
);

CREATE INDEX resumes_user_id_updated_at_idx
  ON public.resumes (user_id, updated_at DESC);

CREATE UNIQUE INDEX resumes_user_id_default_uq
  ON public.resumes (user_id)
  WHERE is_default;

CREATE OR REPLACE FUNCTION public.set_resumes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER resumes_set_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_resumes_updated_at();

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY resumes_select_own
  ON public.resumes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY resumes_insert_own
  ON public.resumes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resumes_update_own
  ON public.resumes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resumes_delete_own
  ON public.resumes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.resumes FROM PUBLIC;
REVOKE ALL ON TABLE public.resumes FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resumes TO authenticated;

-- ---------------------------------------------------------------------------
-- resume_versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.resume_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  resume_id uuid NOT NULL,
  parent_version_id uuid NULL,
  version_n integer NOT NULL,
  label text NULL,
  source_kind text NOT NULL,
  original_storage_path text NOT NULL,
  working_storage_path text NOT NULL,
  sha256 text NOT NULL,
  extracted_structure jsonb NOT NULL DEFAULT '{"mentionIndex":[]}'::jsonb,
  page_count_estimated integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resume_versions_id_user_id_uq UNIQUE (id, user_id),
  CONSTRAINT resume_versions_resume_user_fk
    FOREIGN KEY (resume_id, user_id)
    REFERENCES public.resumes (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT resume_versions_parent_fk
    FOREIGN KEY (parent_version_id)
    REFERENCES public.resume_versions (id)
    ON DELETE SET NULL,
  CONSTRAINT resume_versions_version_n_positive_chk CHECK (version_n >= 1),
  CONSTRAINT resume_versions_resume_version_n_uq UNIQUE (resume_id, version_n),
  CONSTRAINT resume_versions_source_kind_chk CHECK (source_kind IN (
    'upload', 'edit', 'tailor', 'duplicate'
  )),
  CONSTRAINT resume_versions_original_path_nonempty_chk CHECK (
    char_length(original_storage_path) > 0
  ),
  CONSTRAINT resume_versions_working_path_nonempty_chk CHECK (
    char_length(working_storage_path) > 0
  ),
  CONSTRAINT resume_versions_sha256_nonempty_chk CHECK (char_length(sha256) > 0),
  CONSTRAINT resume_versions_extracted_structure_object_chk CHECK (
    jsonb_typeof(extracted_structure) = 'object'
  ),
  CONSTRAINT resume_versions_page_count_chk CHECK (
    page_count_estimated IS NULL OR page_count_estimated >= 1
  )
);

CREATE INDEX resume_versions_user_id_resume_id_idx
  ON public.resume_versions (user_id, resume_id, created_at DESC);

ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY resume_versions_select_own
  ON public.resume_versions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY resume_versions_insert_own
  ON public.resume_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_versions_update_own
  ON public.resume_versions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_versions_delete_own
  ON public.resume_versions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.resume_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.resume_versions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resume_versions TO authenticated;

-- Circular FK: set after the first version insert. SET NULL so resume CASCADE
-- can drop versions without blocking on this pointer. Same-resume membership
-- of active_version_id is enforced in TS mappers (Phase 1D).
ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_active_version_id_fkey
  FOREIGN KEY (active_version_id)
  REFERENCES public.resume_versions (id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- resume_job_sessions
-- ---------------------------------------------------------------------------

CREATE TABLE public.resume_job_sessions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  resume_id uuid NOT NULL,
  resume_version_id uuid NOT NULL,
  company text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  job_description_text text NOT NULL DEFAULT '',
  parsed_job jsonb NULL,
  match_result jsonb NULL,
  retention text NOT NULL DEFAULT 'until_replaced',
  application_id uuid NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resume_job_sessions_id_user_id_uq UNIQUE (id, user_id),
  CONSTRAINT resume_job_sessions_resume_user_fk
    FOREIGN KEY (resume_id, user_id)
    REFERENCES public.resumes (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT resume_job_sessions_version_user_fk
    FOREIGN KEY (resume_version_id, user_id)
    REFERENCES public.resume_versions (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT resume_job_sessions_jd_length_chk CHECK (
    char_length(job_description_text) <= 100000
  ),
  CONSTRAINT resume_job_sessions_parsed_job_object_chk CHECK (
    parsed_job IS NULL OR jsonb_typeof(parsed_job) = 'object'
  ),
  CONSTRAINT resume_job_sessions_match_result_object_chk CHECK (
    match_result IS NULL OR jsonb_typeof(match_result) = 'object'
  ),
  CONSTRAINT resume_job_sessions_retention_chk CHECK (retention IN (
    'until_replaced'
  ))
);

CREATE INDEX resume_job_sessions_user_id_resume_id_idx
  ON public.resume_job_sessions (user_id, resume_id, updated_at DESC);

CREATE UNIQUE INDEX resume_job_sessions_one_active_per_resume_uq
  ON public.resume_job_sessions (resume_id)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_resume_job_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER resume_job_sessions_set_updated_at
  BEFORE UPDATE ON public.resume_job_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_resume_job_sessions_updated_at();

ALTER TABLE public.resume_job_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY resume_job_sessions_select_own
  ON public.resume_job_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY resume_job_sessions_insert_own
  ON public.resume_job_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_job_sessions_update_own
  ON public.resume_job_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_job_sessions_delete_own
  ON public.resume_job_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.resume_job_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.resume_job_sessions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resume_job_sessions TO authenticated;

-- ---------------------------------------------------------------------------
-- resume_suggestions
-- ---------------------------------------------------------------------------

CREATE TABLE public.resume_suggestions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  resume_id uuid NOT NULL,
  resume_version_id uuid NOT NULL,
  source_block_id text NOT NULL,
  original_text text NOT NULL,
  original_text_hash text NOT NULL,
  proposed_text text NOT NULL,
  target_requirement_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_quotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning text NOT NULL,
  transformation_type text NOT NULL,
  confidence double precision NOT NULL,
  factuality_status text NOT NULL,
  layout_result jsonb NOT NULL,
  status text NOT NULL,
  generation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resume_suggestions_session_user_fk
    FOREIGN KEY (session_id, user_id)
    REFERENCES public.resume_job_sessions (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT resume_suggestions_resume_user_fk
    FOREIGN KEY (resume_id, user_id)
    REFERENCES public.resumes (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT resume_suggestions_version_user_fk
    FOREIGN KEY (resume_version_id, user_id)
    REFERENCES public.resume_versions (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT resume_suggestions_source_block_id_nonempty_chk CHECK (
    char_length(source_block_id) > 0
  ),
  CONSTRAINT resume_suggestions_original_text_hash_nonempty_chk CHECK (
    char_length(original_text_hash) > 0
  ),
  CONSTRAINT resume_suggestions_target_requirement_ids_array_chk CHECK (
    jsonb_typeof(target_requirement_ids) = 'array'
  ),
  CONSTRAINT resume_suggestions_evidence_ids_array_chk CHECK (
    jsonb_typeof(evidence_ids) = 'array'
  ),
  CONSTRAINT resume_suggestions_evidence_quotes_array_chk CHECK (
    jsonb_typeof(evidence_quotes) = 'array'
  ),
  CONSTRAINT resume_suggestions_transformation_type_chk CHECK (
    transformation_type IN (
      'terminology_alignment',
      'reorder_emphasis',
      'concise',
      'split',
      'other'
    )
  ),
  CONSTRAINT resume_suggestions_confidence_chk CHECK (
    confidence >= 0 AND confidence <= 1
  ),
  CONSTRAINT resume_suggestions_factuality_status_chk CHECK (
    factuality_status IN ('grounded', 'rejected_ungrounded', 'needs_user')
  ),
  CONSTRAINT resume_suggestions_layout_result_object_chk CHECK (
    jsonb_typeof(layout_result) = 'object'
  ),
  CONSTRAINT resume_suggestions_status_chk CHECK (status IN (
    'pending',
    'accepted',
    'rejected',
    'stale',
    'applied',
    'blocked_formatting'
  )),
  CONSTRAINT resume_suggestions_generation_object_chk CHECK (
    jsonb_typeof(generation) = 'object'
  )
);

CREATE INDEX resume_suggestions_user_id_session_id_idx
  ON public.resume_suggestions (user_id, session_id, status);

CREATE OR REPLACE FUNCTION public.set_resume_suggestions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER resume_suggestions_set_updated_at
  BEFORE UPDATE ON public.resume_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_resume_suggestions_updated_at();

ALTER TABLE public.resume_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY resume_suggestions_select_own
  ON public.resume_suggestions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY resume_suggestions_insert_own
  ON public.resume_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_suggestions_update_own
  ON public.resume_suggestions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_suggestions_delete_own
  ON public.resume_suggestions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.resume_suggestions FROM PUBLIC;
REVOKE ALL ON TABLE public.resume_suggestions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resume_suggestions TO authenticated;

-- ---------------------------------------------------------------------------
-- resume_analysis_runs
-- Lightweight metadata only. Do not store prompt dumps or document/JD text.
-- ---------------------------------------------------------------------------

CREATE TABLE public.resume_analysis_runs (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  pipeline_version text NOT NULL,
  model_tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resume_analysis_runs_session_user_fk
    FOREIGN KEY (session_id, user_id)
    REFERENCES public.resume_job_sessions (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT resume_analysis_runs_pipeline_version_nonempty_chk CHECK (
    char_length(pipeline_version) > 0
  ),
  CONSTRAINT resume_analysis_runs_model_tag_nonempty_chk CHECK (
    char_length(model_tag) > 0
  )
);

CREATE INDEX resume_analysis_runs_user_id_session_id_idx
  ON public.resume_analysis_runs (user_id, session_id, created_at DESC);

ALTER TABLE public.resume_analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY resume_analysis_runs_select_own
  ON public.resume_analysis_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY resume_analysis_runs_insert_own
  ON public.resume_analysis_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_analysis_runs_update_own
  ON public.resume_analysis_runs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resume_analysis_runs_delete_own
  ON public.resume_analysis_runs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.resume_analysis_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.resume_analysis_runs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resume_analysis_runs TO authenticated;
