-- FigmaTest: Storage buckets and RLS for storage.objects. Run after 002_functions_triggers_rls.sql.
-- No data; schema only.

-- ---------------------------------------------------------------------------
-- Storage buckets (Supabase Storage)
-- ---------------------------------------------------------------------------
-- If your project already has these buckets, you can skip the INSERTs or use ON CONFLICT.
-- Bucket IDs must match the names used in the app: "recordings", "study-images".

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recordings',
  'recordings',
  true,
  NULL,
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'study-images',
  'study-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: storage.objects policies for recordings
-- ---------------------------------------------------------------------------

CREATE POLICY "Public can read recordings"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'recordings');

CREATE POLICY "Anon can upload session recordings"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = 'session-recordings'
);

CREATE POLICY "Anon can delete session recordings"
ON storage.objects FOR DELETE
TO anon
USING (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = 'session-recordings'
);

-- ---------------------------------------------------------------------------
-- RLS: storage.objects policies for study-images
-- ---------------------------------------------------------------------------

CREATE POLICY "Public can read study images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'study-images');

CREATE POLICY "Users can read own images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'study-images'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "Users can upload images to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'study-images'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'study-images'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
