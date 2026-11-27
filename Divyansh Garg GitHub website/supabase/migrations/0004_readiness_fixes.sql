-- supabase/migrations/0004_readiness_fixes.sql
-- Forward migration for the Phase 2 production-readiness fixes.
-- Safe to apply once to any project that used 0001-0003. All statements are
-- additive or CREATE OR REPLACE; no application data is deleted.

BEGIN;

-- 1. Deactivated users must lose all role privileges immediately at the
-- database layer, not only in application code.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p.role
    FROM public.profiles p
   WHERE p.id = auth.uid()
     AND p.active;
$fn$;

-- 2. Editable public section headings. The default keeps the approved copy
-- while allowing every heading to be changed from the CMS.
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS section_headings jsonb NOT NULL DEFAULT '{
    "about": "About",
    "education": "Education",
    "experience": "Experience",
    "projects": "Selected Work",
    "skills": "Capabilities",
    "achievements": "Recognition",
    "community": "Beyond the work",
    "contact": "Let’s connect"
  }'::jsonb;

-- 3. Distributed, atomic rate limiting for serverless API routes.
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key          text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_now timestamptz := now();
  v_count integer;
BEGIN
  IF p_key IS NULL OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_counters (key, request_count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET request_count = CASE
          WHEN public.rate_limit_counters.window_start <= v_now - make_interval(secs => p_window_seconds)
          THEN 1
          ELSE public.rate_limit_counters.request_count + 1
        END,
        window_start = CASE
          WHEN public.rate_limit_counters.window_start <= v_now - make_interval(secs => p_window_seconds)
          THEN v_now
          ELSE public.rate_limit_counters.window_start
        END
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$fn$;

REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

-- 4. Expired preview tokens are cleaned up on a best-effort basis whenever a
-- token is issued. This does not change token semantics.
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
  RETURN COALESCE(v_deleted, 0);
END;
$fn$;

-- 5. Activity log is owner-only. Editors still produce audit rows (writes go
--    through the service role), but they can no longer read the log via RLS.
DROP POLICY IF EXISTS staff_read_activity ON public.activity_log;
DROP POLICY IF EXISTS owner_read_activity ON public.activity_log;
CREATE POLICY owner_read_activity ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_owner());

COMMIT;
