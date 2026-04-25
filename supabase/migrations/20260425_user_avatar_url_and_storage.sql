-- 20260425_user_avatar_url_and_storage.sql
-- Adds avatar_url to public.users and provisions the user-avatars storage
-- bucket with policies. Avatars are stored under a per-user folder
-- (`{user_id}/avatar.{ext}`) so the existing storage.foldername() pattern
-- works for owner-write / admin-write checks.

-- 1) Schema change
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.users.avatar_url IS
  'Either a public Supabase Storage URL for an uploaded photo, or a string of the form `preset:NAME` (purple/blue/green/amber/red/teal/pink/gray). When NULL the UI falls back to initials.';

-- 2) Storage bucket — public read, 2MB limit, image MIME types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) Policies on storage.objects, scoped to the bucket.
DROP POLICY IF EXISTS "user-avatars_read"          ON storage.objects;
DROP POLICY IF EXISTS "user-avatars_owner_insert"  ON storage.objects;
DROP POLICY IF EXISTS "user-avatars_owner_update"  ON storage.objects;
DROP POLICY IF EXISTS "user-avatars_owner_delete"  ON storage.objects;
DROP POLICY IF EXISTS "user-avatars_admin_insert"  ON storage.objects;
DROP POLICY IF EXISTS "user-avatars_admin_update"  ON storage.objects;
DROP POLICY IF EXISTS "user-avatars_admin_delete"  ON storage.objects;

-- Public read — bucket is public, but we keep an explicit policy for clarity.
CREATE POLICY "user-avatars_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'user-avatars');

-- Owner write/update/delete — the file path is `{user_id}/...`, so the first
-- folder segment must equal the caller's auth.uid().
CREATE POLICY "user-avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user-avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user-avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin override — admins can manage any user's avatar.
CREATE POLICY "user-avatars_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "user-avatars_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "user-avatars_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
