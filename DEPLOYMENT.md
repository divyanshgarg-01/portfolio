# Deployment guide — Supabase + Vercel

> **Repository layout note:** this guide documents the preserved Next.js/Supabase implementation in `Divyansh Garg GitHub website/`. The currently deployed site is the static GitHub Pages/Decap implementation built from the repository root; its workflow and CMS setup are documented in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) and [`docs/GITHUB_PAGES_CMS.md`](./docs/GITHUB_PAGES_CMS.md).

This handover describes a Next.js 15 App Router site with a Supabase-backed CMS. **Nothing in this Supabase/Vercel handover has been deployed publicly, and local verification does not establish deployment readiness.** Production readiness requires passing Supabase integration tests (Auth/MFA, RLS role boundaries, Storage, revalidation and a hosted production-build smoke test). External accounts, credentials, paid resources and production deployment require the owner's explicit approval and access.

---

## 1. Current status

| Item | Status |
|---|---|
| Local production build and CMS workflow verification | **PASS (local/E2E only; not deployment readiness)** |
| Supabase migrations reviewed and hardened locally | **PASS (static review only)** |
| Migrations applied to a hosted Supabase project | **BLOCKED** — no project or credentials supplied |
| RLS owner/editor/viewer tests | **BLOCKED** — no provisioned users |
| Supabase Auth/MFA, Storage and revalidation integration | **BLOCKED / NOT TESTED** — owner credentials/project required |
| Vercel deployment | **BLOCKED** — Vercel CLI is not installed, no authenticated account/project/token, and no production Supabase/site-url environment is available in this workspace |
| Domain / DNS / custom certificate | **NOT TESTED** |

Do not promote to production until every Supabase-dependent row above is verified by the owner. Live Supabase tests cannot run in this handover.

---

## 2. Prerequisites (owner actions)

1. Create/own a Supabase project. Supply the URL, anon key and **server-only** service-role key through Vercel environment variables — not through chat, source files or commits.
2. Create/own a Vercel project connected to the repository and set **Root Directory = `Divyansh Garg GitHub website`** exactly. Configure separate Preview and Production environments.
3. Choose a Vercel subdomain or custom domain. Add DNS only when ready for production; `NEXT_PUBLIC_SITE_URL` must be the real origin (there is no localhost SEO fallback).
4. Decide the owner email, create that user in Supabase Auth, promote its profile to `owner`, enable **TOTP MFA** and configure Auth redirect URLs (section 5).
5. Confirm the content checklist in the root `README.md`; seed content is draft/placeholder only.

Node.js 22 LTS is pinned in `package.json`; Vercel should build with Node 22. Free tiers are assumed. Any upgrade, paid add-on or external account requires separate approval.

---

## 3. Environment variables

Set these in Vercel (and in `.env.local` for local Supabase-mode testing). `DATA_MODE` is **required** and accepts exactly `supabase` (hosted/production) or `local` (development only); missing or invalid values fail closed.

Build-time variables (needed before `next build`):

```dotenv
DATA_MODE=supabase
NEXT_PUBLIC_SITE_URL=https://<your-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key>
```

Runtime-only variables:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
SUPABASE_STORAGE_PUBLIC_BUCKET=media-public
SUPABASE_STORAGE_PRIVATE_BUCKET=media-private
REVALIDATION_SECRET=<long-random-token>
```

`NEXT_PUBLIC_SITE_URL` drives `metadataBase`, canonical URLs, `sitemap.xml` and `robots.txt`; set the real production origin before building — there is **no localhost SEO fallback**. `SUPABASE_SERVICE_ROLE_KEY` must **never** be prefixed with `NEXT_PUBLIC_` or imported into client code. The public site reads only through RLS-filtered anon access; server routes use the service role after authentication/role checks. `REVALIDATION_SECRET` is used by `/api/revalidate`.

Local-only variables — **never set in Vercel**: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (local rate-limit key salt; local session cookies are opaque random IDs) and `DG_ALLOW_LOCAL_IN_PRODUCTION=1` (Playwright harness only; permits `DATA_MODE=local` with `NODE_ENV=production`). `DATA_MODE=local` uses SQLite, writes public images to `public/uploads/` served by `app/uploads/[...parts]/route.ts`, and writes private certificate PDFs to gitignored `private-uploads/` so they can only be reached through the authorized certificate routes; this is development-only, never a production storage strategy.

---

## 4. Database setup

Apply files in this exact order:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_storage_and_functions.sql`
4. `supabase/migrations/0004_readiness_fixes.sql`
5. `supabase/migrations/0005_skill_focus.sql`
6. `supabase/migrations/0006_certificate_expiry.sql`
7. `supabase/seed.sql` (idempotent; does not overwrite CMS edits)

Using the Supabase CLI:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

`supabase db push` does not re-run `seed.sql`. Use a connection string from Supabase → Project Settings → Database and keep it out of git.

> The first three migration files were corrected in place because no hosted database had applied them. `0004_readiness_fixes.sql` is the forward migration for the Phase 2 readiness changes; do not expect a re-run of `0001` to reshape an already-applied database. See `supabase/README.md`.

The migrations create storage buckets/policies, role helpers, append-only audit logging, atomic preview-token helpers, singleton guards and editor publish/delete restrictions. `0004` adds `profiles.active` (deactivated users lose role privileges), `site_settings.section_headings`, `rate_limit_counters` with the service-role-only `consume_rate_limit` RPC (distributed rate limiting), and best-effort cleanup of expired preview tokens. Preview verification uses the one-time service-role `verify_preview_token(..., p_consume => true)` RPC. `media-public` accepts images only; PDFs belong in `media-private`. Published certificates are exposed through `/api/certificates/[id]/file`, which first checks RLS-filtered published certificate records and then streams the file locally or mints a short-lived signed URL from the private bucket. Do not make `media-private` public.

---

## 5. Owner and collaborators

1. Supabase Dashboard → **Authentication → Users → Add user** for the owner email chosen by the owner.
2. In **Authentication → URL Configuration**, set **Site URL** to `NEXT_PUBLIC_SITE_URL` and add redirect URLs for the real domain (for example `https://<your-domain>/**`), the Vercel Preview domain if used, and `http://localhost:3000/**` for local development only.
3. Sign in once so the auth trigger creates the matching `public.profiles` row.
4. Promote it as `postgres`/service role in the SQL editor, and confirm `active = true`:

```sql
UPDATE public.profiles
   SET role = 'owner', display_name = 'Divyansh Garg'
 WHERE lower(email::text) = lower('replace-with-owner-email@example.com');

SELECT id, email, role, active FROM public.profiles WHERE role = 'owner';
```

5. Enable **TOTP MFA** for that account in Supabase (Authentication → Users → MFA / factor enrollment). The app verifies the MFA assurance level on protected routes; the owner performs enrollment in Supabase.
6. Optional editors/viewers: create their auth users and set `profiles.role` to `editor` or `viewer` with the same pattern. Exactly one owner is enforced by a partial unique index; transfer ownership by first demoting the existing owner. Deactivating a profile (`active = false`) immediately removes its role privileges at the database layer.

---

## 6. Build and deploy

Only after database setup, owner verification **and** passing Supabase integration tests (hosted RLS role boundaries, Auth/MFA sign-in, Storage upload/signed URLs, `/api/revalidate`, preview one-time token flow, and production-build SEO output with the real `NEXT_PUBLIC_SITE_URL`):

1. Run locally: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` (local/E2E passes are necessary but not sufficient for readiness).
2. Vercel builds with `next build` using Node 22 LTS and Root Directory `Divyansh Garg GitHub website`; the same checks should be green. Build-time variables must be present at build, runtime-only secrets at serve time.
3. Deploy to a Preview environment first. Use a separate Supabase project/schema and keep production secrets out of Preview.
4. Re-run CMS smoke tests against Preview: login, create draft, preview, publish, verify public revalidation, unpublish, delete, upload media, export activity CSV.
5. Owner approves promotion. Promote the same build artifact to Production rather than rebuilding with different code.
6. Apply migrations to the production database additively; take a verified backup/snapshot first if the provider tier allows.
7. Smoke test Production: load `/`, `/robots.txt`, `/sitemap.xml`, sign in at `/admin`, publish one draft, verify `/` in a fresh incognito window, then remove the test row.

No deployment step was executed in this handover, and Supabase integration testing remains owner-blocked. Completion of these commands is not evidence of production readiness.

---

## 7. Post-deploy checks

- Canonical URL comes from `NEXT_PUBLIC_SITE_URL`; metadata and JSON-LD use the real domain.
- `/robots.txt` disallows `/admin`, `/preview` and `/api`; sitemap contains the public page only.
- Chrome DevTools console has no hydration, CSP or mixed-content errors.
- Mobile menu, terminal (`Backquote`), lightbox and reduced-motion paths work on the deployed build.
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and CSP headers are present.
- Activity log shows authenticated actor emails; no client can write audit rows directly.

---

## 8. Rollback and safety

- Test destructive SQL inside `BEGIN; ... ROLLBACK;` first. `activity_log` is append-only by trigger.
- `seed.sql` uses `ON CONFLICT DO NOTHING`; it never overwrites edited CMS rows. Deleting seeded rows is a manual owner-approved operation.
- Production rollback requires a verified backup/export first. Restoring from a free-tier nightly backup may lose recent CMS edits; confirm with the owner before doing it.
- Never revert by deleting data directories or running a destructive database reset on production.
