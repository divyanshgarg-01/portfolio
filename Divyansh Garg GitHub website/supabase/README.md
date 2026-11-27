# Supabase setup — portfolio CMS

Source of truth: `DATABASE_SCHEMA.md`, `SECURITY_PLAN.md`, `CMS_REQUIREMENTS.md`, `TECHNICAL_ARCHITECTURE.md`.

Files (apply in this exact order):

| File | Purpose |
|---|---|
| `migrations/0001_initial_schema.sql` | Extensions, enums, all 13 tables, constraints, indexes, triggers, media/audit helper functions |
| `migrations/0002_rls_policies.sql` | Role helpers, grants, editor/owner/viewer RLS policies, editor guard triggers |
| `migrations/0003_storage_and_functions.sql` | Storage buckets/policies, auth profile trigger, atomic preview-token helpers, activity logging |
| `migrations/0004_readiness_fixes.sql` | Forward readiness migration: `profiles.active`, `site_settings.section_headings`, `rate_limit_counters` + `consume_rate_limit` RPC, refined preview-token cleanup |
| `migrations/0005_skill_focus.sql` | Adds `skills.featured` and its index |
| `migrations/0006_certificate_expiry.sql` | Adds optional `achievements.expiry_date` for certificates |
| `seed.sql` | Safe **draft** content from `lib/defaults.ts`; no users, no passwords |

> The first three migration files were corrected **in place** while there was no applied Supabase database (no project credentials were available). `0004_readiness_fixes.sql` is the forward migration for the Phase 2 readiness fixes. If any environment had already applied `0001`–`0003`, do **not** expect a re-run of `0001` to change existing table shapes; apply `0004` instead.

---

## 1. Setup order (owner steps)

Do not create a hosted Supabase project, run remote commands or deploy until the owner has explicitly approved stage 2 (see `TECHNICAL_ARCHITECTURE.md` §12). No credentials/project were supplied in this handover: **live Supabase tests remain owner-blocked**, and local passing tests do not establish deployment readiness.

1. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and Docker (for local development).
2. Owner creates the Supabase project and supplies its URL, anon key and service-role key through environment variables. The service-role key is **server-only** — never commit it or import it into a client component.
3. Copy `.env.example` to `.env.local`, set `DATA_MODE=supabase` and fill the variables listed in section 2. `NEXT_PUBLIC_SITE_URL` must be the real origin; there is no localhost SEO fallback.
4. For local development only: `supabase start`, then `supabase db reset` — this applies `0001` → `0006` in filename order **and** runs `seed.sql`.
5. For the hosted project (after approval): `supabase link --project-ref <PROJECT_REF>` then `supabase db push --linked`. Confirm `0004`–`0006` were applied.
6. Apply seed data to an already-migrated remote database (the CLI does not re-run seed on `db push`):
   `psql "$DATABASE_URL" -f supabase/seed.sql`
   Use a connection string from Supabase → Project Settings → Database. Never put this URL in `.env.local` committed to git. `seed.sql` is idempotent.
7. Create the owner user in Supabase Dashboard → **Authentication → Users → Add user**, sign in once, then promote its `profiles` row to `owner` (section 3).
8. Enable **TOTP MFA** for the owner in Supabase (Auth → Users → MFA/factor enrollment); the application checks the MFA assurance level. Configure **Authentication → URL Configuration**: Site URL = `NEXT_PUBLIC_SITE_URL`, redirect URLs for the real domain (e.g. `https://<your-domain>/**`), the Vercel Preview domain if used, and `http://localhost:3000/**` for local development only.
9. In Vercel, set **Root Directory** to `Divyansh Garg GitHub website`, use Node 22 LTS, and set all build-time and runtime variables listed in section 2 and `DEPLOYMENT.md`. Never set local-only variables in Vercel.
10. Verify RLS, Auth/MFA, Storage, revalidation and one-time preview tokens against the hosted project (sections 5 and `DEPLOYMENT.md`) before any production deployment.

Re-running any migration or `seed.sql` is safe on this file set: migrations use `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS`, and seed rows use `ON CONFLICT DO NOTHING` (they never overwrite CMS edits).

---

## 2. Environment variables

From `.env.example` (values are created by the owner, never committed). `DATA_MODE` is required and accepts exactly `local` (development only) or `supabase` (hosted/production); missing/invalid values fail closed, and `local` in a production build fails without the Playwright-only `DG_ALLOW_LOCAL_IN_PRODUCTION=1` override.

Required for Supabase mode:

```dotenv
DATA_MODE=supabase
NEXT_PUBLIC_SITE_URL=https://<your-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
SUPABASE_STORAGE_PUBLIC_BUCKET=media-public
SUPABASE_STORAGE_PRIVATE_BUCKET=media-private
REVALIDATION_SECRET=<long-random-token>
```

- `NEXT_PUBLIC_SITE_URL` is required for metadata/canonical URLs, `sitemap.xml` and `robots.txt` — there is no localhost SEO fallback.
- `DATA_MODE` and all `NEXT_PUBLIC_*` values are needed at build time; `SUPABASE_SERVICE_ROLE_KEY`, storage bucket names and `REVALIDATION_SECRET` (used by `/api/revalidate`) are runtime secrets.
- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**: never prefix with `NEXT_PUBLIC_`, commit it or use it in client code.
- Local-only variables (never in Vercel): `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (local rate-limit key salt; session cookies are opaque random IDs) and the test-harness override `DG_ALLOW_LOCAL_IN_PRODUCTION=1`.

The public site uses only `NEXT_PUBLIC_SUPABASE_URL` + anon key (RLS-filtered reads). The service-role key is used only inside server-side Route Handlers after authentication/role checks.

---

## 3. Creating the owner

No `auth.users` row and no password is created by `seed.sql` or the migrations.

1. Supabase Dashboard → **Authentication → Users → Add user** for the owner email chosen by the owner. Use email magic link or a strong password.
2. Sign in once. Trigger `portfolio_profile_on_auth_change` (`0003`) automatically inserts the matching row in `public.profiles` with `role = 'viewer'` and `active = true`.
3. Promote that row (run as `postgres`/service role in the SQL editor):

   ```sql
   UPDATE public.profiles
      SET role = 'owner', display_name = 'Divyansh Garg'
    WHERE lower(email::text) = lower('replace-with-owner-email@example.com'); -- use the real owner email
   ```

4. Confirm exactly one active owner exists:

   ```sql
   SELECT id, email, role, active FROM public.profiles WHERE role = 'owner';
   ```

5. Enable **TOTP MFA** for that account in Supabase (Auth → Users → MFA/factor enrollment). The application verifies the MFA assurance level on protected routes; enrollment is an owner/Supabase step. Configure Auth redirect URLs as described in section 1.

Optional collaborators: invite them in Auth, then set their profile `role` to `editor` or `viewer` with the same `UPDATE` pattern. A partial unique index (`profiles_single_owner_idx`) enforces a single owner; transfer ownership by first changing the existing owner to `editor`.

---

## 4. What the schema enforces

- **Visibility**: `content_visibility = draft | published | unpublished`; public reads require `visibility = 'published' AND deleted_at IS NULL`. This now applies to `skill_categories` too, matching the CMS `EntityBase` fields.
- **Editor rights**: editors may insert/update only `draft`, non-deleted rows. They cannot publish, unpublish, soft-delete or hard-delete content, including `social_links` and `skill_categories`. This is enforced by RLS **and** `enforce_editor_content_rules` triggers. Owners retain full insert/update/delete/publish rights; viewers are read-only.
- **Skill categories**: there is no editor `DELETE` policy, so an editor cannot hard-delete a category and cascade-delete its skills. Owner deletion remains available.
- **Soft delete**: `deleted_at` on all content tables. Permanent deletes are owner-only; singleton rows cannot be deleted at all (`prevent_singleton_delete`).
- **Featured cap**: trigger `enforce_featured_project_cap` allows at most **3 published**, non-deleted featured projects (advisory-locked for concurrent writes).
- **Project URLs**: the DB constraint `projects_at_least_one_url_chk` only requires a GitHub/live URL for `published` rows; drafts can be saved without one. Cover images are optional, and the public site uses original line art when none is supplied.
- **Current role**: `experience.is_current = true` requires `end_date IS NULL` (`experience_current_no_end_date_chk`).
- **Slug / URLs / lengths**: checked in `projects`, `social_links` and `achievements`; `nav_items` (max 8), `cta`, `section_visibility` and `appearance` are validated with JSONB check helpers. The CTA default is `/#contact`; no placeholder booking URL remains.
- **Media**: `gallery uuid[]` references are validated by trigger; hard-deleting a referenced asset is blocked; storage keys are restricted to `folder/uuid.ext` with `jpg|jpeg|png|webp|pdf` only (SVG/HTML/JS rejected). The public bucket accepts images only; PDFs are forced to `media-private` by `set_media_bucket` and rejected from the public bucket by both the storage allowlist and the object trigger.
- **Audit**: `activity_log` is append-only (update/delete trigger raises an error). Authenticated clients have no INSERT grant or policy and no `EXECUTE` on `log_activity`; service-role inserts resolve the actor email/id to an existing profile via `normalise_activity_log_actor`, so arbitrary actor strings cannot be fabricated.
- **Preview tokens**: SHA-256 hashes in `preview_tokens`, no anon/authenticated table grants or policies, helpers executable by `service_role` only, and `verify_preview_token(..., p_consume => true)` uses a locked read-plus-delete so two concurrent requests cannot both consume the same token (one-time previews). `0004` refines `cleanup_expired_preview_tokens()` to delete expired rows on a best-effort basis when a new token is issued; token semantics are unchanged.
- **Deactivation**: `profiles.active` (added by `0004`) defaults to `true`; `current_role()` only returns a role for an active profile, so setting `active = false` immediately removes owner/editor/viewer privileges at the database layer.
- **Section headings**: `site_settings.section_headings` (added by `0004`) is an editable JSONB object with approved defaults for every public section; the CMS can change headings without code edits.
- **Rate limiting**: `rate_limit_counters` and the service-role-only `consume_rate_limit(key, limit, window_seconds)` RPC (added by `0004`) provide atomic, shared counters across serverless instances. There are no anon/authenticated grants on the table or function.
- **Single rows**: `site_settings.id = 00000000-0000-0000-0000-000000000001`, `about.id = 00000000-0000-0000-0000-000000000002`; `seed.sql` initializes both rows.

---

## 5. Verify RLS and security

Run as `postgres` in the SQL editor. `SET ROLE` simulates the role; always `RESET ROLE` afterwards. All content except the three social links is seeded as draft, so anon reads should return zero content rows apart from social links.

```sql
-- 5.1 Every application table has RLS enabled.
SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname = 'public'
 ORDER BY tablename;

-- 5.2 No anon policy exists on sensitive tables, and preview_tokens has no client policies.
SELECT tablename, policyname, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('profiles', 'activity_log', 'preview_tokens')
 ORDER BY tablename, policyname;   -- expect only SELECT policies for activity_log

-- 5.3 Anon cannot read draft content or profiles.
SET ROLE anon;
SELECT count(*) AS anon_projects FROM public.projects;   -- expect 0 (all drafts)
SELECT count(*) AS anon_socials  FROM public.social_links;   -- expect 3 (published)
SELECT count(*) AS anon_categories FROM public.skill_categories; -- expect 0 (all drafts)
-- The next two should fail with "permission denied":
SELECT count(*) FROM public.profiles;
SELECT count(*) FROM public.preview_tokens;
RESET ROLE;

-- 5.4 Public settings/about remain readable by anon.
SET ROLE anon;
SELECT site_title FROM public.site_settings;            -- expect one row
SELECT headline FROM public.about;                      -- expect one row
RESET ROLE;

-- 5.5 Role helpers are pinned and return false for anon.
SET ROLE anon;
SELECT public.is_owner(), public.is_editor(), public.is_viewer(); -- f / f / f
RESET ROLE;

-- 5.6 Editor policy shape (run for projects, experience, education, skills,
--     skill_categories, social_links and achievements; expect draft-only writes).
SELECT cmd, policyname, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'projects'
 ORDER BY cmd, policyname;

-- 5.7 Buckets and storage policies: media-public must be images only.
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets WHERE id LIKE 'media-%' ORDER BY id;

SELECT policyname, roles, cmd FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
  ORDER BY policyname;

-- 5.8 Preview helpers are service-role only.
SELECT routine_name, grantee, privilege_type
  FROM information_schema.role_routine_grants
 WHERE routine_schema = 'public'
   AND routine_name IN ('verify_preview_token','log_activity','hash_preview_token')
 ORDER BY routine_name, grantee;

-- 5.9 Featured / publish-ready checks: wrap in a transaction and roll back.
BEGIN;
UPDATE public.projects
   SET visibility = 'published', github_url = '', live_url = ''
 WHERE slug = 'cynorva'; -- deliberately invalid: publish-ready check should fire
ROLLBACK;
```

Readiness checks for `0004` (run as `postgres`; wrap mutations in `BEGIN; ... ROLLBACK;`):

```sql
-- 5.10 Active flag gates role resolution.
SELECT column_name, column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active';

SET ROLE authenticated;
SELECT public.current_role();  -- NULL for an inactive/missing profile
RESET ROLE;

-- 5.11 Section headings default to the approved copy.
SELECT section_headings FROM public.site_settings;

-- 5.12 Rate-limit RPC is callable by service_role only and is atomic.
SELECT routine_name, grantee FROM information_schema.role_routine_grants
 WHERE routine_schema = 'public' AND routine_name = 'consume_rate_limit';
SELECT public.consume_rate_limit('verify-' || gen_random_uuid()::text, 1, 60);                  -- true
SELECT public.consume_rate_limit('verify-' || gen_random_uuid()::text, 1, 60);                  -- true
-- Repeating the same key a third time returns false.

-- 5.13 Preview verification consumes a token once (p_consume => true):
--      second verification of the same token must fail. Use a real issued token
--      and roll back afterwards.
```

Browser-level checks (use the anon key in a client, not the service role): confirm a direct `supabase.from('projects').select()` returns no draft rows, that `/admin` redirects when signed out, and that an editor cannot publish, soft-delete or hard-delete any seeded draft. Signed URLs for private PDFs must be minted by a server handler, never exposed as direct anon reads.

---

## 6. Rollback notes

- Migrations are **forward-only**. There are no `down` files and no destructive column drops in v1 (`TECHNICAL_ARCHITECTURE.md` §11).
- To revert an application release, redeploy the previous Vercel deployment; the additive database schema remains compatible.
- To fix a bad migration in production, add a new numbered forward-fix migration (for example `0005_*.sql`) instead of deleting data. `0004_readiness_fixes.sql` is already the forward migration for the Phase 2 readiness changes; the in-place corrections to `0001`–`0003` assume no applied database.
- Staging can be reset with `supabase db reset` (destroys local data and re-runs all migrations + seed). Do **not** do this in production.
- Production rollback requires a verified backup/export first (Supabase nightly backups have limited retention on the free tier). Restore from backup only with owner approval.
- Test any destructive statement inside `BEGIN; ... ROLLBACK;` before committing. `activity_log` deliberately rejects UPDATE/DELETE, so audit rows cannot be removed casually.
- `seed.sql` is safe to re-run, but it never overwrites edited CMS rows; deleting seeded rows is a manual, owner-approved operation.

---

## 7. Assumptions made while writing these files

1. `social_links.platform` is the `social_platform` enum with values from `CMS_REQUIREMENTS.md` §3 (DATABASE_SCHEMA.md says "enum" but does not list values).
2. `social_links` carries `visibility`/`published_at`/`deleted_at` because the CMS form and `lib/types.ts` `EntityBase` use them; `visible = false` additionally hides a link.
3. `skill_categories` also carries `visibility`/`published_at`. DATABASE_SCHEMA.md omits them, but `db.listEntities('skill_categories')` filters on `visibility`, so the columns are required for Supabase mode to work. Seed categories are draft until published.
4. `site_settings` / `about` are enforced single rows via fixed UUIDs; `seed.sql` initializes them with placeholders and `updated_by = NULL` until the owner exists. Deletion is blocked by trigger.
5. `gallery uuid[]` array references are enforced by trigger because PostgreSQL cannot express a FK from an array element; media deletion checks soft-deleted rows too.
6. Storage bucket config uses the modern Supabase `allowed_mime_types` / `file_size_limit` columns. Public uploads are images only; PDFs use the private bucket and signed URLs.
7. `activity_log.actor_id` stores the actor string sent by the server (email), while `actor_profile_id` is the resolved profile FK. `entity_id` is text so singleton/account keys such as `'settings'` and `''` can be logged safely.
8. `activity_log` is hard append-only via trigger, and preview helpers/audit writes are restricted to `service_role` — both stricter than v1's minimum requirement.

---

## 8. Publishing validation alignment

`lib/validation.ts` and the SQL constraint now agree: draft/unpublished projects may be saved without a GitHub/live URL, while publishing still requires a URL. Cover images are optional at every stage; the public site renders original line art when no image is uploaded. Editor publish/unpublish attempts are rejected by the CMS API **and** by database RLS/trigger guards.

---

## 9. Verification status at handover

| Item | Status | Evidence / reason |
|---|---|---|
| Migration SQL reviewed and hardened in place | **PASS (static review)** | Constraints, triggers, RLS, grants and storage policies were checked against the CMS code and planning docs. |
| Local SQLite CMS workflows | **PASS (not deployment readiness)** | 19 Playwright tests passed against a production build with the harness-only local override; 1 Supabase-only test skipped. |
| `0004_readiness_fixes.sql` (active flag, headings, distributed rate limit, token cleanup) | **PASS (static review)** | Reviewed for additive changes and service-role-only grants; not applied to a hosted project. |
| `0005_skill_focus.sql` / `0006_certificate_expiry.sql` | **PASS (static review)** | Additive columns only; not applied to a hosted project. |
| Migrations applied to a hosted Supabase project | **BLOCKED** | No owner-owned project, credentials or approval were provided. Live Supabase tests remain owner-blocked. |
| `seed.sql` executed remotely | **BLOCKED** | Same as above; the file is reviewed and idempotent but unexecuted. |
| RLS owner/editor/viewer boundary tests | **BLOCKED / SKIPPED** | Requires real Supabase Auth users and the role assignment in section 3. |
| Hosted Auth and Storage integration | **NOT TESTED** | Local mode uses a SQLite adapter and a local upload route instead. |
| Owner TOTP MFA / Auth redirect URLs | **BLOCKED (owner/Supabase step)** | Enable TOTP and configure redirect URLs in Supabase; the app verifies MFA assurance but cannot enroll the factor or test it without credentials. |
| Distributed rate limit + one-time preview token RPC against Supabase | **BLOCKED / NOT TESTED** | Requires the hosted `0004` migration and service-role credentials. |
| Production deployment / cache revalidation | **BLOCKED / NOT TESTED** | No Vercel project or deployment approval; deployment readiness is not claimed until Supabase integration tests pass. |

The seed CTA is `{"label":"Contact","url":"/#contact"}` and `lib/defaults.ts` matches it; no placeholder booking link remains in the public UI. Seed content is deliberately draft/placeholder and must be reviewed before publication.
