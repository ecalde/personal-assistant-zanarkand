-- Phase 10A: dual-check resume-docs paths and re-assert size limits.
-- Existing 1B policies only required foldername[1] = auth.uid(), which still
-- allows `{uid}/../…` and extra segments. Tighten to the architecture §34
-- canonical shape. Version rows must store those same owner-prefixed paths.
-- Do not ALTER storage.objects (hosted Supabase owns that table).

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 8388608
WHERE id = 'resume-docs';

CREATE OR REPLACE FUNCTION public.resume_docs_object_is_allowed(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, storage, pg_temp
AS $$
  SELECT
    object_name IS NOT NULL
    AND position('..' in object_name) = 0
    AND position('//' in object_name) = 0
    AND position(CHR(92) in object_name) = 0
    AND object_name NOT LIKE '/%'
    AND cardinality(storage.foldername(object_name)) = 3
    AND (storage.foldername(object_name))[1] = auth.uid()::text
    AND (
      (
        (storage.foldername(object_name))[3] = 'original'
        AND object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original/[0-9a-f]{64}\.docx$'
      )
      OR
      (
        (storage.foldername(object_name))[3] = 'versions'
        AND object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/versions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx$'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.resume_docs_object_is_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_docs_object_is_allowed(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resume_docs_object_is_allowed(text) TO authenticated;

DROP POLICY IF EXISTS resume_docs_select_own ON storage.objects;
CREATE POLICY resume_docs_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resume-docs'
    AND public.resume_docs_object_is_allowed(name)
  );

DROP POLICY IF EXISTS resume_docs_insert_own ON storage.objects;
CREATE POLICY resume_docs_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resume-docs'
    AND public.resume_docs_object_is_allowed(name)
  );

DROP POLICY IF EXISTS resume_docs_update_own ON storage.objects;
CREATE POLICY resume_docs_update_own
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'resume-docs'
    AND public.resume_docs_object_is_allowed(name)
  )
  WITH CHECK (
    bucket_id = 'resume-docs'
    AND public.resume_docs_object_is_allowed(name)
  );

DROP POLICY IF EXISTS resume_docs_delete_own ON storage.objects;
CREATE POLICY resume_docs_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resume-docs'
    AND public.resume_docs_object_is_allowed(name)
  );

ALTER TABLE public.resume_versions
  ADD CONSTRAINT resume_versions_original_path_shape_chk CHECK (
    original_storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original/[0-9a-f]{64}\.docx$'
  );

ALTER TABLE public.resume_versions
  ADD CONSTRAINT resume_versions_working_path_shape_chk CHECK (
    working_storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/versions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx$'
  );

ALTER TABLE public.resume_versions
  ADD CONSTRAINT resume_versions_original_path_owner_chk CHECK (
    split_part(original_storage_path, '/', 1) = user_id::text
    AND split_part(original_storage_path, '/', 2) = resume_id::text
  );

ALTER TABLE public.resume_versions
  ADD CONSTRAINT resume_versions_working_path_owner_chk CHECK (
    split_part(working_storage_path, '/', 1) = user_id::text
    AND split_part(working_storage_path, '/', 2) = resume_id::text
    AND split_part(working_storage_path, '/', 4) = id::text || '.docx'
  );
