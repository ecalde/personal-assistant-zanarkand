-- Phase 1B: private resume-docs Storage bucket (Resume Tool).
-- Canonical object paths (architecture §34):
--   {user_id}/{resume_id}/original/{sha256}.docx
--   {user_id}/{resume_id}/versions/{version_id}.docx
-- Postgres resume tables are Phase 1C and are not created here.
--
-- Do not ALTER storage.objects. Hosted Supabase owns that table
-- (supabase_storage_admin); RLS is already enabled. ALTER TABLE
-- raises 42501: must be owner of table objects.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'resume-docs',
  'resume-docs',
  false,
  8388608
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- Four-policy owner pattern. First path segment must be the caller's uid.
-- No policies (and no grants) are created for anon.

DROP POLICY IF EXISTS resume_docs_select_own ON storage.objects;
CREATE POLICY resume_docs_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resume-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS resume_docs_insert_own ON storage.objects;
CREATE POLICY resume_docs_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resume-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS resume_docs_update_own ON storage.objects;
CREATE POLICY resume_docs_update_own
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'resume-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'resume-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS resume_docs_delete_own ON storage.objects;
CREATE POLICY resume_docs_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resume-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
