-- 0002_rls_policies.sql
-- Row Level Security, role helpers and explicit grants.
-- Requires 0001_initial_schema.sql to be applied first.
-- The service-role key bypasses RLS by design: use it only in server handlers
-- after verifying the session and role (lib/auth/session.ts + requireRole).

BEGIN;

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Role helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER with a pinned search_path so a caller cannot influence
-- table/function resolution. auth.uid() is schema-qualified deliberately.
-- current_role() returns NULL for anonymous users and for authenticated users
-- without a profiles row (no implicit 'viewer' fallback).
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p.role
    FROM public.profiles p
   WHERE p.id = auth.uid();
$fn$;

CREATE OR REPLACE FUNCTION public.has_role(p_role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(public.current_role() = p_role, false);
$fn$;

-- Strict checks.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT public.has_role('owner'::public.user_role);
$fn$;

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    public.current_role() IN ('editor'::public.user_role, 'owner'::public.user_role),
    false
  );
$fn$;

CREATE OR REPLACE FUNCTION public.is_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT public.has_role('viewer'::public.user_role);
$fn$;

REVOKE ALL ON FUNCTION public.current_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(public.user_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_editor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_viewer() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(public.user_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_editor() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Table privileges (RLS is the actual boundary; grants remove accidental
--    capabilities granted by Supabase's default privileges)
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT ON
  public.site_settings, public.about, public.social_links, public.projects,
  public.experience, public.education, public.skill_categories, public.skills,
  public.achievements, public.media_assets
TO anon;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT INSERT, UPDATE, DELETE ON
  public.site_settings, public.about, public.social_links, public.projects,
  public.experience, public.education, public.skill_categories, public.skills,
  public.achievements, public.media_assets
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.activity_log TO authenticated;
-- No table grants on preview_tokens for authenticated/anon: all access is via
-- service_role (which bypasses RLS) inside server handlers.
REVOKE ALL ON public.preview_tokens FROM anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on every application table
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.about            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preview_tokens   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3b. Trigger-level defence in depth for editors
--     RLS is the primary boundary, but these triggers also cover the case of
--     a privileged caller acting with an editor's JWT. Service role has no
--     auth.uid(), so current_role() is NULL and server handlers are unaffected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_editor_content_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.current_role() = 'editor'::public.user_role THEN
      RAISE EXCEPTION 'editors cannot hard-delete content';
    END IF;
    RETURN OLD;
  END IF;
  IF public.current_role() = 'editor'::public.user_role THEN
    IF NEW.visibility <> 'draft'::public.content_visibility THEN
      RAISE EXCEPTION 'editors cannot publish or unpublish content';
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'editors cannot soft-delete content';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforce_editor_content_rules() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalise_activity_log_actor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_media_deletion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_featured_project_cap() FROM PUBLIC;

DO $trg$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects', 'experience', 'education', 'skills', 'skill_categories',
    'social_links', 'achievements'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_editor_content_rules ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER enforce_editor_content_rules '
      'BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.enforce_editor_content_rules()', t
    );
  END LOOP;
END;
$trg$;

-- ---------------------------------------------------------------------------
-- 4. Content collections
--    anon + viewer: published AND not soft-deleted
--    editor:        draft, non-deleted rows only (no publish/soft-delete/delete)
--    owner:         everything
-- ---------------------------------------------------------------------------

-- projects ------------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_published ON public.projects;
CREATE POLICY anon_read_published ON public.projects FOR SELECT TO anon
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS authenticated_read_published ON public.projects;
CREATE POLICY authenticated_read_published ON public.projects FOR SELECT TO authenticated
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS staff_read_undeleted ON public.projects;
CREATE POLICY staff_read_undeleted ON public.projects FOR SELECT TO authenticated
  USING (public.is_editor() AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_read_all ON public.projects;
CREATE POLICY owner_read_all ON public.projects FOR SELECT TO authenticated
  USING (public.is_owner());

-- Editors may only create and edit draft, non-deleted rows. They cannot
-- publish, unpublish, soft-delete or hard-delete content (owners can).
DROP POLICY IF EXISTS editor_insert ON public.projects;
CREATE POLICY editor_insert ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS editor_update ON public.projects;
CREATE POLICY editor_update ON public.projects FOR UPDATE TO authenticated
  USING (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL)
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_insert ON public.projects;
CREATE POLICY owner_insert ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.projects;
CREATE POLICY owner_update ON public.projects FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_delete ON public.projects;
CREATE POLICY owner_delete ON public.projects FOR DELETE TO authenticated
  USING (public.is_owner());

-- experience ----------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_published ON public.experience;
CREATE POLICY anon_read_published ON public.experience FOR SELECT TO anon
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS authenticated_read_published ON public.experience;
CREATE POLICY authenticated_read_published ON public.experience FOR SELECT TO authenticated
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS staff_read_undeleted ON public.experience;
CREATE POLICY staff_read_undeleted ON public.experience FOR SELECT TO authenticated
  USING (public.is_editor() AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_read_all ON public.experience;
CREATE POLICY owner_read_all ON public.experience FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS editor_insert ON public.experience;
CREATE POLICY editor_insert ON public.experience FOR INSERT TO authenticated
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS editor_update ON public.experience;
CREATE POLICY editor_update ON public.experience FOR UPDATE TO authenticated
  USING (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL)
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_insert ON public.experience;
CREATE POLICY owner_insert ON public.experience FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.experience;
CREATE POLICY owner_update ON public.experience FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_delete ON public.experience;
CREATE POLICY owner_delete ON public.experience FOR DELETE TO authenticated
  USING (public.is_owner());

-- education -----------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_published ON public.education;
CREATE POLICY anon_read_published ON public.education FOR SELECT TO anon
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS authenticated_read_published ON public.education;
CREATE POLICY authenticated_read_published ON public.education FOR SELECT TO authenticated
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS staff_read_undeleted ON public.education;
CREATE POLICY staff_read_undeleted ON public.education FOR SELECT TO authenticated
  USING (public.is_editor() AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_read_all ON public.education;
CREATE POLICY owner_read_all ON public.education FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS editor_insert ON public.education;
CREATE POLICY editor_insert ON public.education FOR INSERT TO authenticated
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS editor_update ON public.education;
CREATE POLICY editor_update ON public.education FOR UPDATE TO authenticated
  USING (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL)
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_insert ON public.education;
CREATE POLICY owner_insert ON public.education FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.education;
CREATE POLICY owner_update ON public.education FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_delete ON public.education;
CREATE POLICY owner_delete ON public.education FOR DELETE TO authenticated
  USING (public.is_owner());

-- skills --------------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_published ON public.skills;
CREATE POLICY anon_read_published ON public.skills FOR SELECT TO anon
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS authenticated_read_published ON public.skills;
CREATE POLICY authenticated_read_published ON public.skills FOR SELECT TO authenticated
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS staff_read_undeleted ON public.skills;
CREATE POLICY staff_read_undeleted ON public.skills FOR SELECT TO authenticated
  USING (public.is_editor() AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_read_all ON public.skills;
CREATE POLICY owner_read_all ON public.skills FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS editor_insert ON public.skills;
CREATE POLICY editor_insert ON public.skills FOR INSERT TO authenticated
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS editor_update ON public.skills;
CREATE POLICY editor_update ON public.skills FOR UPDATE TO authenticated
  USING (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL)
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_insert ON public.skills;
CREATE POLICY owner_insert ON public.skills FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.skills;
CREATE POLICY owner_update ON public.skills FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_delete ON public.skills;
CREATE POLICY owner_delete ON public.skills FOR DELETE TO authenticated
  USING (public.is_owner());

-- achievements --------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_published ON public.achievements;
CREATE POLICY anon_read_published ON public.achievements FOR SELECT TO anon
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS authenticated_read_published ON public.achievements;
CREATE POLICY authenticated_read_published ON public.achievements FOR SELECT TO authenticated
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS staff_read_undeleted ON public.achievements;
CREATE POLICY staff_read_undeleted ON public.achievements FOR SELECT TO authenticated
  USING (public.is_editor() AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_read_all ON public.achievements;
CREATE POLICY owner_read_all ON public.achievements FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS editor_insert ON public.achievements;
CREATE POLICY editor_insert ON public.achievements FOR INSERT TO authenticated
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS editor_update ON public.achievements;
CREATE POLICY editor_update ON public.achievements FOR UPDATE TO authenticated
  USING (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL)
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_insert ON public.achievements;
CREATE POLICY owner_insert ON public.achievements FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.achievements;
CREATE POLICY owner_update ON public.achievements FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_delete ON public.achievements;
CREATE POLICY owner_delete ON public.achievements FOR DELETE TO authenticated
  USING (public.is_owner());

-- ---------------------------------------------------------------------------
-- 5. site_settings / about / social_links
-- ---------------------------------------------------------------------------
-- site_settings (single owner-managed row; readable by everyone)
DROP POLICY IF EXISTS anon_read ON public.site_settings;
CREATE POLICY anon_read ON public.site_settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS authenticated_read ON public.site_settings;
CREATE POLICY authenticated_read ON public.site_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS owner_insert ON public.site_settings;
CREATE POLICY owner_insert ON public.site_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.site_settings;
CREATE POLICY owner_update ON public.site_settings FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

-- No DELETE policy: the singleton row is protected by a trigger in 0001.
DROP POLICY IF EXISTS owner_delete ON public.site_settings;

-- about (single owner-managed row)
DROP POLICY IF EXISTS anon_read ON public.about;
CREATE POLICY anon_read ON public.about FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS authenticated_read ON public.about;
CREATE POLICY authenticated_read ON public.about FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS owner_insert ON public.about;
CREATE POLICY owner_insert ON public.about FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.about;
CREATE POLICY owner_update ON public.about FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

-- No DELETE policy: the singleton row is protected by a trigger in 0001.
DROP POLICY IF EXISTS owner_delete ON public.about;

-- social_links (published + visible for the public; editors manage drafts)
DROP POLICY IF EXISTS anon_read_visible ON public.social_links;
CREATE POLICY anon_read_visible ON public.social_links FOR SELECT TO anon
  USING (visibility = 'published' AND deleted_at IS NULL AND visible);

DROP POLICY IF EXISTS authenticated_read_visible ON public.social_links;
CREATE POLICY authenticated_read_visible ON public.social_links FOR SELECT TO authenticated
  USING (visibility = 'published' AND deleted_at IS NULL AND visible);

DROP POLICY IF EXISTS staff_read_undeleted ON public.social_links;
CREATE POLICY staff_read_undeleted ON public.social_links FOR SELECT TO authenticated
  USING (public.is_editor() AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_read_all ON public.social_links;
CREATE POLICY owner_read_all ON public.social_links FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS editor_insert ON public.social_links;
CREATE POLICY editor_insert ON public.social_links FOR INSERT TO authenticated
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS editor_update ON public.social_links;
CREATE POLICY editor_update ON public.social_links FOR UPDATE TO authenticated
  USING (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL)
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_insert ON public.social_links;
CREATE POLICY owner_insert ON public.social_links FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.social_links;
CREATE POLICY owner_update ON public.social_links FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_delete ON public.social_links;
CREATE POLICY owner_delete ON public.social_links FOR DELETE TO authenticated
  USING (public.is_owner());

-- ---------------------------------------------------------------------------
-- 6. skill_categories (same visibility / soft-delete rules as other content)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_active ON public.skill_categories;
CREATE POLICY anon_read_active ON public.skill_categories FOR SELECT TO anon
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS authenticated_read_active ON public.skill_categories;
CREATE POLICY authenticated_read_active ON public.skill_categories FOR SELECT TO authenticated
  USING (visibility = 'published' AND deleted_at IS NULL);

DROP POLICY IF EXISTS staff_read_undeleted ON public.skill_categories;
CREATE POLICY staff_read_undeleted ON public.skill_categories FOR SELECT TO authenticated
  USING (public.is_editor() AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_read_all ON public.skill_categories;
CREATE POLICY owner_read_all ON public.skill_categories FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS editor_insert ON public.skill_categories;
CREATE POLICY editor_insert ON public.skill_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS editor_update ON public.skill_categories;
CREATE POLICY editor_update ON public.skill_categories FOR UPDATE TO authenticated
  USING (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL)
  WITH CHECK (public.is_editor() AND visibility = 'draft' AND deleted_at IS NULL);

DROP POLICY IF EXISTS owner_insert ON public.skill_categories;
CREATE POLICY owner_insert ON public.skill_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.skill_categories;
CREATE POLICY owner_update ON public.skill_categories FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

-- No editor DELETE policy: a hard delete would cascade to every skill in the
-- category. Only the owner may remove a category.
DROP POLICY IF EXISTS editor_delete ON public.skill_categories;
DROP POLICY IF EXISTS owner_delete ON public.skill_categories;
CREATE POLICY owner_delete ON public.skill_categories FOR DELETE TO authenticated
  USING (public.is_owner());

-- ---------------------------------------------------------------------------
-- 7. media_assets
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS anon_read_public_bucket ON public.media_assets;
CREATE POLICY anon_read_public_bucket ON public.media_assets FOR SELECT TO anon
  USING (bucket = 'media-public');

DROP POLICY IF EXISTS authenticated_read_public_bucket ON public.media_assets;
CREATE POLICY authenticated_read_public_bucket ON public.media_assets FOR SELECT TO authenticated
  USING (bucket = 'media-public');

DROP POLICY IF EXISTS staff_read_all_buckets ON public.media_assets;
CREATE POLICY staff_read_all_buckets ON public.media_assets FOR SELECT TO authenticated
  USING (public.is_editor());

DROP POLICY IF EXISTS editor_insert ON public.media_assets;
CREATE POLICY editor_insert ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS editor_update ON public.media_assets;
CREATE POLICY editor_update ON public.media_assets FOR UPDATE TO authenticated
  USING (public.is_editor()) WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS owner_delete ON public.media_assets;
CREATE POLICY owner_delete ON public.media_assets FOR DELETE TO authenticated
  USING (public.is_owner());

-- ---------------------------------------------------------------------------
-- 8. profiles: owner + own row only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS own_profile_read ON public.profiles;
CREATE POLICY own_profile_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS owner_read_all ON public.profiles;
CREATE POLICY owner_read_all ON public.profiles FOR SELECT TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS owner_insert ON public.profiles;
CREATE POLICY owner_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_update ON public.profiles;
CREATE POLICY owner_update ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS owner_delete ON public.profiles;
CREATE POLICY owner_delete ON public.profiles FOR DELETE TO authenticated
  USING (public.is_owner());

-- No anon policy exists on profiles: anonymous SELECT is denied.

-- ---------------------------------------------------------------------------
-- 9. activity_log: editor/owner read only, append-only (see 0001 trigger)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_read_activity ON public.activity_log;
CREATE POLICY staff_read_activity ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_editor());

-- No INSERT/UPDATE/DELETE policies: writes go through the service role only.

-- ---------------------------------------------------------------------------
-- 10. preview_tokens: strictly server/service-role only. No anon or
--     authenticated policies (defence in depth for the revoked table grants).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS owner_read ON public.preview_tokens;
DROP POLICY IF EXISTS owner_insert ON public.preview_tokens;
DROP POLICY IF EXISTS owner_update ON public.preview_tokens;
DROP POLICY IF EXISTS owner_delete ON public.preview_tokens;

COMMIT;
