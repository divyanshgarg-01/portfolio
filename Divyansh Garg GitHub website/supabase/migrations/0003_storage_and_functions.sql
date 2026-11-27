-- 0003_storage_and_functions.sql
-- Storage buckets + object policies, auth profile provisioning, preview-token
-- helpers and activity logging. Requires 0001 and 0002 to be applied first.
-- Assumes the standard Supabase `storage` and `auth` schemas are present.

BEGIN;

SET search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Storage buckets
-- ---------------------------------------------------------------------------
-- allowed_mime_types and file_size_limit provide server-side rejection of
-- unsafe/unexpected uploads in addition to the application's magic-byte check.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-public',
  'media-public',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-private',
  'media-private',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Object-level validation (defence in depth: extensions + traversal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_media_object()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_extension text;
BEGIN
  IF NEW.bucket_id NOT IN ('media-public', 'media-private') THEN
    RETURN NEW; -- other buckets are governed by their own policies
  END IF;

  -- Keys are generated server-side as `${folder}/${uuid}.${ext}`.
  IF NEW.name IS NULL
     OR NEW.name = ''
     OR length(NEW.name) > 512
     OR NEW.name !~ '^[A-Za-z0-9._/-]+$'
     OR NEW.name LIKE '%..%'
     OR NEW.name LIKE '%//%'
     OR NEW.name ~ '^/' THEN
    RAISE EXCEPTION 'invalid storage object key for bucket %', NEW.bucket_id
      USING HINT = 'Use /<folder>/<uuid>.<ext> with no traversal or special characters.';
  END IF;

  v_extension := lower(substring(NEW.name FROM '\.([A-Za-z0-9]+)$'));
  IF v_extension IS NULL OR v_extension NOT IN ('jpg', 'jpeg', 'png', 'webp', 'pdf') THEN
    RAISE EXCEPTION 'disallowed file extension %.', COALESCE(v_extension, '(none)')
      USING HINT = 'Allowed extensions: jpg, jpeg, png, webp, pdf. SVG/HTML/JS are rejected.';
  END IF;

  -- PDFs are private documents; they must never land in the public bucket.
  -- Images may live in either bucket (draft images use media-private).
  IF NEW.bucket_id = 'media-public' AND v_extension = 'pdf' THEN
    RAISE EXCEPTION 'PDF files are not allowed in the public bucket'
      USING HINT = 'Upload certificates/PDFs to media-private and serve them via signed URLs.';
  END IF;

  IF NEW.metadata IS NOT NULL
     AND jsonb_typeof(NEW.metadata) = 'object'
     AND COALESCE(NEW.metadata ->> 'mimetype', '') IN (
       'image/svg+xml', 'text/html', 'application/javascript', 'text/javascript'
     ) THEN
    RAISE EXCEPTION 'unsafe mime type % in storage metadata', NEW.metadata ->> 'mimetype';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS validate_media_object ON storage.objects;
CREATE TRIGGER validate_media_object
  BEFORE INSERT OR UPDATE OF name, metadata ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.validate_media_object();

-- ---------------------------------------------------------------------------
-- 3. storage.objects policies
-- ---------------------------------------------------------------------------
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- media-public: public read.
DROP POLICY IF EXISTS media_public_read ON storage.objects;
CREATE POLICY media_public_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'media-public');

-- media-private: intentionally NO SELECT policy. Signed URLs are minted by a
-- server handler (service role, which bypasses RLS) after role/entitlement
-- checks, so anonymous clients cannot list or read private objects directly.

-- Writes: owner/editor only. Normal uploads use server-issued signed upload
-- URLs (service role); these policies are defence in depth for user-token use.
DROP POLICY IF EXISTS media_editor_insert ON storage.objects;
CREATE POLICY media_editor_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('media-public', 'media-private')
    AND public.is_editor()
  );

DROP POLICY IF EXISTS media_editor_update ON storage.objects;
CREATE POLICY media_editor_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('media-public', 'media-private')
    AND public.is_editor()
  )
  WITH CHECK (
    bucket_id IN ('media-public', 'media-private')
    AND public.is_editor()
  );

-- Deleting media is an owner-only operation (CMS_REQUIREMENTS.md §1).
DROP POLICY IF EXISTS media_owner_delete ON storage.objects;
CREATE POLICY media_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('media-public', 'media-private')
    AND public.is_owner()
  );

-- ---------------------------------------------------------------------------
-- 4. Auth provisioning
-- ---------------------------------------------------------------------------
-- Do NOT insert auth.users here. Create the owner in the Supabase Auth
-- dashboard (see supabase/README.md); this trigger provisions the profile row.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'Divyansh Garg'),
    'viewer'::public.user_role
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS portfolio_profile_on_auth_change ON auth.users;
CREATE TRIGGER portfolio_profile_on_auth_change
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Preview tokens (all helpers are server/service-role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hash_preview_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $fn$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$fn$;

-- Returns true only when the hash matches, has not expired and belongs to the
-- requested entity. p_consume = true deletes the row (single-use previews).
CREATE OR REPLACE FUNCTION public.verify_preview_token(
  p_token_hash text,
  p_entity_type text,
  p_entity_id uuid,
  p_consume boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_valid boolean;
BEGIN
  IF p_token_hash IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT COALESCE(p_consume, false) THEN
    -- Non-consuming verification is a plain read; expiry is checked in SQL.
    RETURN EXISTS (
      SELECT 1
        FROM public.preview_tokens t
       WHERE t.token_hash = p_token_hash
         AND (t.entity_type = p_entity_type OR t.collection = p_entity_type)
         AND t.entity_id = p_entity_id
         AND t.expires_at > now()
    );
  END IF;

  -- Atomic consume: lock the matching row(s) and delete them in the same
  -- statement. A second concurrent call sees no locked row (SKIP LOCKED) and
  -- returns false, so a one-time token can only be used once.
  WITH locked AS (
    SELECT t.token_hash
      FROM public.preview_tokens t
     WHERE t.token_hash = p_token_hash
       AND (t.entity_type = p_entity_type OR t.collection = p_entity_type)
       AND t.entity_id = p_entity_id
       AND t.expires_at > now()
     FOR UPDATE SKIP LOCKED
  ), consumed AS (
    DELETE FROM public.preview_tokens t
     USING locked l
     WHERE t.token_hash = l.token_hash
     RETURNING t.token_hash
  )
  SELECT EXISTS (SELECT 1 FROM consumed) INTO v_valid;

  RETURN COALESCE(v_valid, false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_preview_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.preview_tokens WHERE expires_at <= now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Activity logging
-- ---------------------------------------------------------------------------
-- Audit writes are trusted operations only. The actor is passed explicitly by
-- the server after it has authenticated/authorised the user; ordinary
-- authenticated clients have no EXECUTE grant and no INSERT policy. The
-- BEFORE INSERT trigger in 0001 re-resolves the actor against public.profiles.
DROP FUNCTION IF EXISTS public.log_activity(text, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.log_activity(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_actor_email text;
BEGIN
  SELECT p.email::text INTO v_actor_email
    FROM public.profiles p
   WHERE p.id = p_actor_id;

  IF v_actor_email IS NULL THEN
    RAISE EXCEPTION 'log_activity requires a valid actor profile';
  END IF;
  IF p_action IS NULL OR btrim(p_action) = '' OR p_entity_type IS NULL OR btrim(p_entity_type) = '' THEN
    RAISE EXCEPTION 'log_activity requires an action and entity_type';
  END IF;

  INSERT INTO public.activity_log (actor_id, actor_profile_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_actor_email,
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id::text,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Function privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.validate_media_object() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_preview_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_preview_token(text, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_preview_tokens() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, text, uuid, jsonb) FROM PUBLIC;

-- Only trusted server-side code (service role) may write audit events.
GRANT EXECUTE ON FUNCTION public.log_activity(uuid, text, text, uuid, jsonb)
  TO service_role;

-- Preview helpers are deliberately not granted to anon or authenticated.
GRANT EXECUTE ON FUNCTION public.hash_preview_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_preview_token(text, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_preview_tokens() TO service_role;

COMMIT;
