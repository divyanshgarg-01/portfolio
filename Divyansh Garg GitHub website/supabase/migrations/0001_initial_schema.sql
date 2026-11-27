-- 0001_initial_schema.sql
-- Initial Supabase Postgres schema for the Divyansh Garg portfolio CMS.
-- Forward-only. Safe to re-run: tables/indexes/triggers use IF NOT EXISTS or
-- DROP/CREATE, and all constraints are declared inline with CREATE TABLE.
-- Apply this file BEFORE 0002_rls_policies.sql and 0003_storage_and_functions.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Extensions and session search path
-- ---------------------------------------------------------------------------
-- Supabase installs extensions in the "extensions" schema. Creating the schema
-- first also makes this file work on a plain local Postgres instance.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

-- Unqualified `citext`, `digest` and our own objects resolve predictably.
SET search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('owner', 'editor', 'viewer');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'content_visibility' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.content_visibility AS ENUM ('draft', 'published', 'unpublished');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'achievement_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.achievement_type AS ENUM ('certificate', 'achievement', 'community');
  END IF;

  -- DATABASE_SCHEMA.md specifies an enum for social_links.platform; the
  -- allowed values come from CMS_REQUIREMENTS.md §3.
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'social_platform' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.social_platform AS ENUM (
      'github', 'linkedin', 'email', 'youtube', 'x', 'instagram', 'topmate', 'other'
    );
  END IF;
END;
$enum$;

-- ---------------------------------------------------------------------------
-- 2. Shared helper functions used by constraints and triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- Sets published_at on the first transition to 'published'; never clears it
-- automatically (unpublish may optionally clear it from the admin handler).
CREATE OR REPLACE FUNCTION public.set_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.visibility = 'published'
     AND NEW.published_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.visibility IS DISTINCT FROM 'published') THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.jsonb_nav_items_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_typeof(value) = 'array'
     AND jsonb_array_length(value) <= 8
     AND COALESCE((
           SELECT bool_and(
                    jsonb_typeof(item) = 'object'
                    AND item ?& ARRAY['label', 'section', 'visible']
                    AND jsonb_typeof(item -> 'label') = 'string'
                    AND jsonb_typeof(item -> 'section') = 'string'
                    AND jsonb_typeof(item -> 'visible') = 'boolean'
                  )
             FROM jsonb_array_elements(value) AS items(item)
         ), true);
$fn$;

CREATE OR REPLACE FUNCTION public.jsonb_bool_map_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_typeof(value) = 'object'
     AND COALESCE((
           SELECT bool_and(jsonb_typeof(entry_value) = 'boolean')
             FROM jsonb_each(value) AS entries(entry_key, entry_value)
         ), true);
$fn$;

CREATE OR REPLACE FUNCTION public.jsonb_appearance_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_typeof(value) = 'object'
     AND value ?& ARRAY['accent', 'grain', 'loader', 'terminal', 'ember_density']
     AND value ->> 'accent' IN ('caramel', 'bronze', 'warm', 'text')
     AND jsonb_typeof(value -> 'grain') = 'boolean'
     AND jsonb_typeof(value -> 'loader') = 'boolean'
     AND jsonb_typeof(value -> 'terminal') = 'boolean'
     AND value ->> 'ember_density' IN ('low', 'medium', 'high');
$fn$;

CREATE OR REPLACE FUNCTION public.jsonb_cta_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_typeof(value) = 'object'
     AND value ?& ARRAY['label', 'url']
     AND jsonb_typeof(value -> 'label') = 'string'
     AND jsonb_typeof(value -> 'url') = 'string'
     AND (value ->> 'url') ~* '^(https://|mailto:|/#)';
$fn$;

-- Postgres has no direct FK from uuid[] to another table, so gallery ids are
-- validated with a trigger instead.
CREATE OR REPLACE FUNCTION public.media_array_refs_exist(ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE((
    SELECT bool_and(EXISTS (SELECT 1 FROM public.media_assets m WHERE m.id = arr.id))
      FROM unnest(ids) AS arr(id)
  ), true);
$fn$;

CREATE OR REPLACE FUNCTION public.check_media_array_refs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.gallery IS NOT NULL AND NOT public.media_array_refs_exist(NEW.gallery) THEN
    RAISE EXCEPTION 'gallery contains a media id that does not exist in media_assets';
  END IF;
  RETURN NEW;
END;
$fn$;

-- Hard-deleting an asset that is still referenced (including by soft-deleted
-- rows) is blocked. SECURITY DEFINER so the check is not affected by RLS.
CREATE OR REPLACE FUNCTION public.prevent_media_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.about a WHERE a.profile_image = OLD.id)
     OR EXISTS (SELECT 1 FROM public.site_settings s WHERE s.og_image = OLD.id)
     OR EXISTS (SELECT 1 FROM public.projects p WHERE p.cover_image = OLD.id OR OLD.id = ANY(p.gallery))
     OR EXISTS (SELECT 1 FROM public.experience e WHERE e.logo = OLD.id OR e.certificate = OLD.id)
     OR EXISTS (SELECT 1 FROM public.achievements a WHERE a.file = OLD.id)
  THEN
    RAISE EXCEPTION 'media asset % is still referenced and cannot be deleted', OLD.id
      USING HINT = 'Remove or repoint every reference (soft-deleted rows included) first.';
  END IF;
  RETURN OLD;
END;
$fn$;

-- At most three PUBLISHED, non-deleted, featured projects. The advisory lock
-- serialises concurrent insert/update transactions.
CREATE OR REPLACE FUNCTION public.enforce_featured_project_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF NEW.featured
     AND NEW.visibility = 'published'
     AND NEW.deleted_at IS NULL THEN
    PERFORM pg_advisory_xact_lock(2024112601::bigint);

    SELECT count(*) INTO v_count
      FROM public.projects p
     WHERE p.featured
       AND p.visibility = 'published'
       AND p.deleted_at IS NULL
       AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

    IF v_count >= 3 THEN
      RAISE EXCEPTION 'at most 3 published projects may be featured (already %)', v_count
        USING HINT = 'Unfeature or unpublish another project first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.activity_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only; update and delete are not permitted';
END;
$fn$;

-- The adapter writes `collection` while DATABASE_SCHEMA.md calls the same
-- field `entity_type`. Keep both in sync so the service-role adapter and the
-- SQL helper functions agree.
CREATE OR REPLACE FUNCTION public.sync_preview_token_entity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.collection IS NULL OR NEW.collection = '' THEN
    NEW.collection := NEW.entity_type;
  END IF;
  IF NEW.entity_type IS NULL OR NEW.entity_type = '' THEN
    NEW.entity_type := NEW.collection;
  END IF;
  RETURN NEW;
END;
$fn$;

-- The two singleton rows must always exist. Owners may update/reset them, but
-- deleting them would leave the public site without settings/about content.
CREATE OR REPLACE FUNCTION public.prevent_singleton_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION '% is a singleton row and cannot be deleted', TG_TABLE_NAME;
END;
$fn$;

-- lib/media.ts uploads PDFs to the private bucket, but the Supabase adapter
-- does not send `bucket` to db.createMedia(); the column default alone would
-- mislabel every PDF as public. Derive the bucket from the MIME type instead.
CREATE OR REPLACE FUNCTION public.set_media_bucket()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.mime_type = 'application/pdf' THEN
    NEW.bucket := 'media-private';
  ELSIF NEW.bucket IS NULL OR NEW.bucket = '' THEN
    NEW.bucket := 'media-public';
  END IF;
  RETURN NEW;
END;
$fn$;

-- The adapter logs actor emails and non-uuid entity keys ('' / 'settings' /
-- 'about' / 'account'). Keep the caller-supplied actor text, resolve it to a
-- real profile, and normalise empty entity keys to NULL. This makes audit rows
-- attributable without allowing arbitrary actor strings.
CREATE OR REPLACE FUNCTION public.normalise_activity_log_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id uuid;
  v_actor_email text;
BEGIN
  SELECT p.id, p.email::text
    INTO v_profile_id, v_actor_email
    FROM public.profiles p
   WHERE lower(p.email::text) = lower(btrim(NEW.actor_id::text))
      OR p.id::text = btrim(NEW.actor_id::text)
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'activity actor must resolve to an existing profile';
  END IF;

  NEW.actor_id := v_actor_email;
  NEW.actor_profile_id := v_profile_id;
  NEW.entity_id := NULLIF(btrim(NEW.entity_id), '');
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Tables (ordered so all FKs point at existing tables)
-- ---------------------------------------------------------------------------

-- 3.1 profiles ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email         citext NOT NULL UNIQUE,
  display_name  text NOT NULL DEFAULT 'Divyansh Garg',
  role          public.user_role NOT NULL DEFAULT 'viewer',
  mfa_enabled   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_display_name_len_chk CHECK (char_length(display_name) <= 120)
);

-- Only one owner is supported in v1.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_owner_idx
  ON public.profiles ((role = 'owner')) WHERE role = 'owner';
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- 3.2 media_assets -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path          text NOT NULL UNIQUE,
  bucket        text NOT NULL DEFAULT 'media-public',
  filename      text NOT NULL DEFAULT '',
  folder        text NOT NULL DEFAULT 'misc',
  alt_text      text NOT NULL DEFAULT '',
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL DEFAULT 0,
  width         integer,
  height        integer,
  blur_data_url text,
  uploaded_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  replaced_by   uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_bucket_chk CHECK (bucket IN ('media-public', 'media-private')),
  CONSTRAINT media_assets_mime_chk CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  -- PDFs are private documents and must never be labelled as public assets.
  CONSTRAINT media_assets_bucket_mime_chk CHECK (
    bucket <> 'media-public' OR mime_type <> 'application/pdf'
  ),
  CONSTRAINT media_assets_path_chk CHECK (
    path ~ '^[A-Za-z0-9._/-]+$' AND path NOT LIKE '%..%' AND path NOT LIKE '%//%'
  ),
  CONSTRAINT media_assets_size_chk CHECK (size_bytes >= 0),
  CONSTRAINT media_assets_dimensions_chk CHECK (
    (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
  )
);
CREATE INDEX IF NOT EXISTS media_assets_folder_idx ON public.media_assets (folder);
CREATE INDEX IF NOT EXISTS media_assets_mime_type_idx ON public.media_assets (mime_type);
CREATE INDEX IF NOT EXISTS media_assets_bucket_idx ON public.media_assets (bucket);

-- 3.3 site_settings (exactly one row) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                 uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  site_title         text NOT NULL DEFAULT 'Divyansh Garg — Data, Business & Technology',
  site_description   text NOT NULL DEFAULT '',
  nav_items          jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_email      text NOT NULL DEFAULT '',
  location           text NOT NULL DEFAULT 'India',
  timezone           text NOT NULL DEFAULT 'Asia/Kolkata',
  footer_note        text NOT NULL DEFAULT '',
  cta                jsonb NOT NULL DEFAULT '{"label":"Contact","url":"/#contact"}'::jsonb,
  section_visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  appearance         jsonb NOT NULL DEFAULT '{"accent":"caramel","grain":false,"loader":true,"terminal":true,"ember_density":"medium"}'::jsonb,
  og_image           uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (id),
  CONSTRAINT site_settings_singleton_chk CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid),
  CONSTRAINT site_settings_title_len_chk CHECK (char_length(site_title) <= 200),
  CONSTRAINT site_settings_description_len_chk CHECK (char_length(site_description) <= 500),
  CONSTRAINT site_settings_email_chk CHECK (contact_email = '' OR contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT site_settings_timezone_chk CHECK (timezone ~ '^UTC$|^[A-Za-z_]+/[A-Za-z_0-9+-]+$'),
  CONSTRAINT site_settings_nav_items_chk CHECK (public.jsonb_nav_items_valid(nav_items)),
  CONSTRAINT site_settings_section_visibility_chk CHECK (public.jsonb_bool_map_valid(section_visibility)),
  CONSTRAINT site_settings_appearance_chk CHECK (public.jsonb_appearance_valid(appearance)),
  CONSTRAINT site_settings_cta_chk CHECK (public.jsonb_cta_valid(cta))
);

-- 3.4 about (exactly one row) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.about (
  id                  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000002'::uuid,
  headline            text NOT NULL DEFAULT 'DIVYANSH GARG',
  subheadline         text NOT NULL DEFAULT '',
  bio                 text NOT NULL DEFAULT '',
  intro               text NOT NULL DEFAULT '',
  availability_status text NOT NULL DEFAULT '',
  location            text NOT NULL DEFAULT '',
  career_direction    text NOT NULL DEFAULT '',
  profile_image       uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  interests           text[] NOT NULL DEFAULT '{}',
  currently_learning  text[] NOT NULL DEFAULT '{}',
  updated_by          uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT about_pkey PRIMARY KEY (id),
  CONSTRAINT about_singleton_chk CHECK (id = '00000000-0000-0000-0000-000000000002'::uuid),
  CONSTRAINT about_headline_len_chk CHECK (char_length(headline) <= 120),
  CONSTRAINT about_subheadline_len_chk CHECK (char_length(subheadline) <= 180),
  CONSTRAINT about_bio_len_chk CHECK (char_length(bio) <= 4000),
  CONSTRAINT about_intro_len_chk CHECK (char_length(intro) <= 400)
);
CREATE INDEX IF NOT EXISTS about_interests_gin_idx ON public.about USING gin (interests);

-- 3.5 social_links -----------------------------------------------------------
-- visibility/deleted_at are included (see lib/types.ts EntityBase and the CMS
-- social-link form) so public reads can follow the published/non-deleted rule.
CREATE TABLE IF NOT EXISTS public.social_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    public.social_platform NOT NULL,
  label       text NOT NULL,
  url         text NOT NULL,
  icon_key    text NOT NULL DEFAULT '',
  visible     boolean NOT NULL DEFAULT true,
  visibility  public.content_visibility NOT NULL DEFAULT 'published',
  published_at timestamptz,
  order_index integer NOT NULL DEFAULT 999,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_links_platform_url_key UNIQUE (platform, url),
  CONSTRAINT social_links_label_len_chk CHECK (char_length(label) <= 80),
  CONSTRAINT social_links_url_chk CHECK (url ~* '^(https://|mailto:)')
);
CREATE INDEX IF NOT EXISTS social_links_visibility_order_idx
  ON public.social_links (visibility, order_index) WHERE deleted_at IS NULL;

-- 3.6 projects ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  summary       text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  category      text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT '',
  cover_image   uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  gallery       uuid[] NOT NULL DEFAULT '{}',
  technologies  text[] NOT NULL DEFAULT '{}',
  github_url    text NOT NULL DEFAULT '',
  live_url      text NOT NULL DEFAULT '',
  featured      boolean NOT NULL DEFAULT false,
  visibility    public.content_visibility NOT NULL DEFAULT 'draft',
  published_at  timestamptz,
  order_index   integer NOT NULL DEFAULT 999,
  deleted_at    timestamptz,
  created_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_slug_format_chk CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT projects_title_len_chk CHECK (char_length(title) <= 100),
  CONSTRAINT projects_summary_len_chk CHECK (char_length(summary) <= 240),
  CONSTRAINT projects_description_len_chk CHECK (char_length(description) <= 3000),
  CONSTRAINT projects_gallery_cap_chk CHECK (cardinality(gallery) <= 12),
  CONSTRAINT projects_technologies_cap_chk CHECK (cardinality(technologies) <= 20),
  CONSTRAINT projects_github_url_chk CHECK (github_url = '' OR github_url ~* '^https://'),
  CONSTRAINT projects_live_url_chk CHECK (live_url = '' OR live_url ~* '^https://'),
  -- Drafts may be saved before a URL is known; only published rows need one.
  CONSTRAINT projects_at_least_one_url_chk CHECK (
    visibility <> 'published' OR github_url <> '' OR live_url <> ''
  ),
  CONSTRAINT projects_publish_ready_chk CHECK (
    visibility <> 'published' OR (
      char_length(title) > 0
      AND char_length(summary) > 0
      AND char_length(description) > 0
      AND cardinality(technologies) >= 1
    )
  )
);
CREATE INDEX IF NOT EXISTS projects_visibility_order_idx
  ON public.projects (visibility, order_index) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_featured_published_idx
  ON public.projects (featured) WHERE featured AND visibility = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_technologies_gin_idx ON public.projects USING gin (technologies);

-- 3.7 experience -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.experience (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            text NOT NULL,
  organization    text NOT NULL,
  location        text NOT NULL DEFAULT '',
  employment_type text NOT NULL DEFAULT '',
  start_date      date,
  end_date        date,
  is_current      boolean NOT NULL DEFAULT false,
  description     text NOT NULL DEFAULT '',
  highlights      text[] NOT NULL DEFAULT '{}',
  tags            text[] NOT NULL DEFAULT '{}',
  logo            uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  certificate     uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  visibility      public.content_visibility NOT NULL DEFAULT 'draft',
  published_at    timestamptz,
  order_index     integer NOT NULL DEFAULT 999,
  deleted_at      timestamptz,
  created_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_current_no_end_date_chk CHECK (NOT is_current OR end_date IS NULL),
  CONSTRAINT experience_date_order_chk CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);
CREATE INDEX IF NOT EXISTS experience_visibility_order_idx
  ON public.experience (visibility, order_index) WHERE deleted_at IS NULL;

-- 3.8 education --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.education (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  degree           text NOT NULL,
  institution      text NOT NULL,
  location         text NOT NULL DEFAULT '',
  period           text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT '',
  details          text NOT NULL DEFAULT '',
  coursework       text[] NOT NULL DEFAULT '{}',
  achievement_note text NOT NULL DEFAULT '',
  visibility       public.content_visibility NOT NULL DEFAULT 'draft',
  published_at     timestamptz,
  order_index      integer NOT NULL DEFAULT 999,
  deleted_at       timestamptz,
  created_by       uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS education_visibility_order_idx
  ON public.education (visibility, order_index);
CREATE INDEX IF NOT EXISTS education_coursework_gin_idx ON public.education USING gin (coursework);

-- 3.9 skill_categories -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.skill_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL UNIQUE,
  description  text NOT NULL DEFAULT '',
  colour_token text NOT NULL DEFAULT 'caramel',
  visibility   public.content_visibility NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  order_index  integer NOT NULL DEFAULT 999,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_categories_colour_token_chk CHECK (
    colour_token IN ('caramel', 'bronze', 'warm', 'text')
  )
);
CREATE INDEX IF NOT EXISTS skill_categories_order_idx ON public.skill_categories (order_index);
CREATE INDEX IF NOT EXISTS skill_categories_visibility_order_idx
  ON public.skill_categories (visibility, order_index) WHERE deleted_at IS NULL;

-- 3.10 skills ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.skill_categories (id) ON DELETE CASCADE,
  name        text NOT NULL,
  note        text NOT NULL DEFAULT '',
  visibility  public.content_visibility NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  order_index integer NOT NULL DEFAULT 999,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_category_name_key UNIQUE (category_id, lower(name))
);
CREATE INDEX IF NOT EXISTS skills_category_order_idx ON public.skills (category_id, order_index);

-- 3.11 achievements ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             public.achievement_type NOT NULL DEFAULT 'achievement',
  title            text NOT NULL,
  issuer           text NOT NULL DEFAULT '',
  issue_date       date,
  credential_id    text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  verification_url text NOT NULL DEFAULT '',
  file             uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  featured         boolean NOT NULL DEFAULT false,
  visibility       public.content_visibility NOT NULL DEFAULT 'draft',
  published_at     timestamptz,
  order_index      integer NOT NULL DEFAULT 999,
  deleted_at       timestamptz,
  created_by       uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievements_verification_url_chk CHECK (
    verification_url = '' OR verification_url ~* '^https://'
  )
);
CREATE INDEX IF NOT EXISTS achievements_visibility_type_order_idx
  ON public.achievements (visibility, type, order_index);

-- 3.12 activity_log (append-only) -------------------------------------------
-- `actor_id` stores the actor string sent by the server (an email) while
-- `actor_profile_id` is the resolved, immutable profile reference. `entity_id`
-- is text because the adapter also logs non-uuid keys for singletons/account.
CREATE TABLE IF NOT EXISTS public.activity_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id         citext NOT NULL,
  actor_profile_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  action           text NOT NULL,
  entity_type      text NOT NULL,
  entity_id        text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_log_actor_chk CHECK (btrim(actor_id::text) <> ''),
  CONSTRAINT activity_log_action_chk CHECK (char_length(action) > 0)
);
CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON public.activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_profile_id_idx
  ON public.activity_log (actor_profile_id);

-- 3.13 preview_tokens (server-side only) ------------------------------------
CREATE TABLE IF NOT EXISTS public.preview_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  -- `collection` is the name written by the service-role adapter; `entity_type`
  -- is the name used by DATABASE_SCHEMA.md and the SQL helpers. Both are kept
  -- in sync by sync_preview_token_entity().
  collection  text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id   uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_by  uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_tokens_hash_format_chk CHECK (token_hash ~ '^[A-Fa-f0-9]{32,128}$')
);
CREATE INDEX IF NOT EXISTS preview_tokens_expires_at_idx ON public.preview_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- updated_at on every table that has the column.
DO $trg$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'site_settings', 'about', 'social_links', 'projects',
    'experience', 'education', 'skill_categories', 'skills', 'achievements'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t
    );
  END LOOP;
END;
$trg$;

-- published_at on first publish.
DO $trg$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'experience', 'education', 'skills', 'skill_categories', 'social_links', 'achievements']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_published_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_published_at BEFORE INSERT OR UPDATE OF visibility ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_published_at()', t
    );
  END LOOP;
END;
$trg$;

DROP TRIGGER IF EXISTS check_gallery_media_refs ON public.projects;
CREATE TRIGGER check_gallery_media_refs
  BEFORE INSERT OR UPDATE OF gallery ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.check_media_array_refs();

DROP TRIGGER IF EXISTS enforce_featured_project_cap ON public.projects;
CREATE TRIGGER enforce_featured_project_cap
  BEFORE INSERT OR UPDATE OF featured, visibility, deleted_at ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_featured_project_cap();

DROP TRIGGER IF EXISTS prevent_media_deletion ON public.media_assets;
CREATE TRIGGER prevent_media_deletion
  BEFORE DELETE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_media_deletion();

DROP TRIGGER IF EXISTS activity_log_append_only ON public.activity_log;
CREATE TRIGGER activity_log_append_only
  BEFORE UPDATE OR DELETE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.activity_log_append_only();

DROP TRIGGER IF EXISTS prevent_singleton_delete ON public.site_settings;
CREATE TRIGGER prevent_singleton_delete
  BEFORE DELETE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_singleton_delete();

DROP TRIGGER IF EXISTS prevent_singleton_delete ON public.about;
CREATE TRIGGER prevent_singleton_delete
  BEFORE DELETE ON public.about
  FOR EACH ROW EXECUTE FUNCTION public.prevent_singleton_delete();

DROP TRIGGER IF EXISTS sync_preview_token_entity ON public.preview_tokens;
CREATE TRIGGER sync_preview_token_entity
  BEFORE INSERT OR UPDATE OF collection, entity_type ON public.preview_tokens
  FOR EACH ROW EXECUTE FUNCTION public.sync_preview_token_entity();

DROP TRIGGER IF EXISTS set_media_bucket ON public.media_assets;
CREATE TRIGGER set_media_bucket
  BEFORE INSERT OR UPDATE OF bucket, mime_type ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_media_bucket();

DROP TRIGGER IF EXISTS normalise_activity_log_actor ON public.activity_log;
CREATE TRIGGER normalise_activity_log_actor
  BEFORE INSERT ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.normalise_activity_log_actor();

COMMIT;
