# Divyansh Garg — Coffee-Black Portfolio & CMS

A premium, database-backed portfolio and full content-management system for **Divyansh Garg**. The application is in [`Divyansh Garg GitHub website/`](./Divyansh%20Garg%20GitHub%20website/).

> **Repository layout note:** the deployed application on this branch is the static GitHub Pages site built from the repository root with Vite, React and Decap CMS. The handover below describes the preserved Next.js/Supabase implementation in `Divyansh Garg GitHub website/`; it remains the design source of truth but is not what GitHub Pages serves. Deployed CMS setup and limitations are documented in [`docs/GITHUB_PAGES_CMS.md`](./docs/GITHUB_PAGES_CMS.md).

**Handover status:** local implementation and verification are complete, but the project is **not deployment-ready**. Do not claim production readiness until Supabase integration testing (Auth, RLS role boundaries, Storage, revalidation and a hosted production-build smoke test) has passed. Live Supabase tests remain **owner-blocked** until the owner supplies credentials/project access and explicitly approves deployment. Seed content is deliberately labelled draft/placeholder and must not be treated as verified biography.

---

## What is included

### Public site
- Server-rendered hero (tagline: `Driven by curiosity. Grounded in data. Inspired by technology.`), about, education, experience, projects, skills, certifications/achievements and contact sections.
- Certifications render as a compact single-row horizontal scroller with mouse-wheel/trackpad, pointer-drag and native touch support; all certificate fields and authorized links are preserved.
- Coffee-black design (`#100D0B`, bronze/caramel accents), Fraunces / Manrope / IBM Plex Mono typography.
- GSAP + ScrollTrigger motion, Lenis smooth scrolling, Framer Motion transitions, ember/lattice field, terminal (`Backquote`), magnetic cursor, preloader, lightbox and PDF viewer.
- `prefers-reduced-motion` support, mobile navigation, keyboard-accessible dialogs, metadata, JSON-LD, `robots.txt`, `sitemap.xml` and icon.
- Section visibility and all text/media come from the database through `lib/db`; there is no hardcoded portfolio copy in the public components.

### Admin CMS (`/admin`)
- Email/password login, protected routes and authenticated API routes.
- Owner / editor / viewer permissions enforced in both application code and Supabase RLS/triggers.
- CRUD for projects, experience, education, skills, skill categories, achievements and social links.
- Singleton editors for site settings and about, including reset-to-defaults (owner only).
- Draft → preview → publish → unpublish → delete workflow, reordering, featured toggles, visibility controls and dirty-state guard.
- Media manager with JPEG/PNG/WebP/PDF validation, magic-byte checks, WebP conversion, alt text, replacement, usage-aware deletion and local serve route.
- Append-only activity log with search, action filter and CSV export of the latest 200 entries.
- Account password change and sign-out.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 plus the project design tokens in `app/globals.css` |
| Motion | GSAP/ScrollTrigger, Lenis, Framer Motion |
| Icons | Lucide React |
| Data | Supabase Postgres/Auth/Storage (`DATA_MODE=supabase`), or development-only `DATA_MODE=local` with `node:sqlite` |
| Validation | Zod |
| Tests | Vitest, Playwright |
| Intended hosting | Vercel (not deployed in this handover; Root Directory must be `Divyansh Garg GitHub website`) |

`DATA_MODE` is required and accepts exactly `local` (development only) or `supabase` (hosted/production). A production build with a missing, invalid or unoverridden `local` value fails closed. `DG_ALLOW_LOCAL_IN_PRODUCTION=1` exists solely for the Playwright harness; it is never a production setting.

---

## Repository layout

```text
.
├── README.md                         # This handover guide
├── DEPLOYMENT.md                     # Supabase + Vercel procedure
├── TEST_REPORT.md                    # PASS / FAIL / BLOCKED / NOT TESTED results
└── Divyansh Garg GitHub website/
    ├── app/                          # Public pages, admin pages, API routes, local media route
    ├── components/                   # public/, motion/, admin/
    ├── lib/                          # db adapters, auth, validation, media, defaults
    ├── supabase/                     # reviewed migrations, seed.sql, setup README
    ├── e2e/                          # Playwright suites
    ├── tests/                        # Vitest suites
    ├── screenshots/                  # Final responsive/visual captures
    ├── data/portfolio.db             # Local SQLite fixture (gitignored)
    └── .env.example                  # Environment variable template
```

The content checklist later in this file is the source of truth for owner verification; unverified claims must not be published.

---

## Local quick start

Requires Node.js 22 LTS (the version pinned in `package.json`) and npm 10+.

```bash
cd "Divyansh Garg GitHub website"
npm install
cp .env.example .env.local
```

Edit `.env.local` and set at least:

```dotenv
DATA_MODE=local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_EMAIL=you@example.local
ADMIN_PASSWORD=a-strong-local-only-password
SESSION_SECRET=a-long-random-string
```

`DATA_MODE` is mandatory in every environment. `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `SESSION_SECRET` are local-only: local session cookies are opaque random IDs, and `SESSION_SECRET` salts local rate-limit keys. Supply all required variables explicitly — there is no localhost SEO fallback for `NEXT_PUBLIC_SITE_URL`.

Then:

```bash
npm run dev
```

- Public site: <http://localhost:3000/>
- Admin: <http://localhost:3000/admin>
- Preview links are created from the CMS and opened at `/preview/[token]`.

The local SQLite file is created and seeded automatically at `data/portfolio.db`. It contains clearly labelled draft placeholders and a local-only owner account derived from `.env.local`. A `node:sqlite` experimental warning is expected on Node 22. SQLite and files written to `public/uploads/` are **development-only**; hosted deployments must use Supabase Postgres and Supabase Storage.

### Verification commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

E2E runs a production build on port 3100 with one worker so the shared SQLite fixture stays deterministic. The harness sets `DATA_MODE=local` plus the harness-only `DG_ALLOW_LOCAL_IN_PRODUCTION=1` override; do not copy that override into Vercel or any hosted environment. Chromium must be installed (`npx playwright install chromium`).

---

## Supabase mode (owner setup required)

1. The owner creates and owns the Supabase project and the Vercel project. No accounts were created here.
2. Set Vercel **Root Directory** to exactly `Divyansh Garg GitHub website` (all paths in this repo, including `supabase/`, are relative to it). Build command: `npm run build` (`next build`); output is the standard Next.js build.
3. Configure environment variables for both build and runtime as described below, then apply migrations in order: `0001_initial_schema.sql`, `0002_rls_policies.sql`, `0003_storage_and_functions.sql`, `0004_readiness_fixes.sql`, `0005_skill_focus.sql`, `0006_certificate_expiry.sql`, then `supabase/seed.sql` (idempotent). See `supabase/README.md` for the exact CLI/PSQL steps.
4. Create the owner in Supabase Auth, promote the matching `profiles` row to `owner`, enable **TOTP MFA** and configure Auth redirect URLs (see `supabase/README.md`). The app checks MFA assurance; the owner enables the factor in Supabase.
5. Publish content from `/admin` only after the Supabase integration and verification checklist below passes. **Local green tests do not establish deployment readiness.**

Never commit `.env.local`, the service-role key or real credentials.

### Environment requirements

- **Build time (Vercel build, and any `npm run build`):** `DATA_MODE=supabase` and `NEXT_PUBLIC_SITE_URL=<real-origin>` are required. In Supabase mode also provide `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before the build, because `NEXT_PUBLIC_*` values are inlined into the bundle. There is no localhost SEO fallback for `NEXT_PUBLIC_SITE_URL` — canonical URLs, metadata, `sitemap.xml` and `robots.txt` must use the real domain.
- **Runtime:** `DATA_MODE=supabase`, the Supabase URL/anon key, `SUPABASE_SERVICE_ROLE_KEY` (**server-only**; never prefix with `NEXT_PUBLIC_`), `SUPABASE_STORAGE_PUBLIC_BUCKET`, `SUPABASE_STORAGE_PRIVATE_BUCKET` and `REVALIDATION_SECRET` (used by `/api/revalidate`).
- **Local-only, never in Vercel:** `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (local rate-limit key salt; session cookies are opaque random IDs), and `DG_ALLOW_LOCAL_IN_PRODUCTION=1` (Playwright harness only).

### Readiness behavior added by migration 0004

`0004_readiness_fixes.sql` adds `profiles.active` (deactivated users lose role privileges immediately), `site_settings.section_headings` (editable public headings), a `rate_limit_counters` table plus the service-role-only `consume_rate_limit` RPC (distributed rate limiting), and best-effort cleanup of expired preview tokens. Preview verification uses the one-time, service-role-only `verify_preview_token(..., p_consume => true)` RPC.

---

## Content verification checklist

The seed data came from earlier drafts and is **not verified**. Before publishing, confirm in the CMS:

- [ ] Exact degree/programme name, institution, academic status and expected graduation.
- [ ] Professional headline, bio, availability and career direction.
- [ ] Public email and GitHub/LinkedIn URLs; remove any social link that is not wanted.
- [ ] Profile image and usage rights.
- [ ] Each project's real description, role, dates, status, repository/live URL and screenshots.
- [ ] Experience dates, titles, organisations and outputs.
- [ ] Certificate files, credential IDs and verification URLs.
- [ ] Achievement metrics/dates; do not publish invented numbers.
- [ ] Optional community, content or mentorship sections only with real links/metrics.
- [ ] CTA label/URL if a real booking link is added; the default is a contact link.
- [ ] Alt text for every image and final section order.

Treat the checklist above as the item-by-item owner review; no separate planning document is included in this handover.

---

## Security notes

- Same-origin checks on mutating APIs; role checks on the server and in database policies/triggers.
- `DATA_MODE` is required and fails closed on missing/invalid values; production cannot silently fall back to SQLite. The only exception is the Playwright harness override `DG_ALLOW_LOCAL_IN_PRODUCTION=1`.
- Service-role key is imported only in server-side code and never exposed as a `NEXT_PUBLIC_*` variable.
- Uploads allow only JPEG/PNG/WebP/PDF with signature checks; SVG is rejected. Local uploads are development-only; hosted uploads use Supabase Storage.
- Private certificate PDFs are stored outside `public/` in local mode and served only through authorized certificate routes; the CV is the only intentional public static PDF.
- Referenced media cannot be deleted; singleton rows cannot be deleted.
- Preview tokens are one-time via a service-role RPC; expired tokens are cleaned up when new tokens are issued.
- MFA is enabled for the owner in Supabase and verified by the app's AAL check; it is not provisioned by the app.
- `NEXT_PUBLIC_SITE_URL` is required for canonical/SEO output; no localhost fallback is used.
- Local dev credentials are not production credentials.

---

## Known limitations

- No live Supabase project was provisioned; migrations were reviewed/hardened locally but not applied remotely. **Deployment readiness is not claimed** until the owner supplies a project and Supabase integration tests pass.
- Live Supabase tests (RLS role boundaries, Auth/MFA, Storage, revalidation) remain owner-blocked until credentials, users and a project exist; those E2E cases are skipped in local mode.
- No MFA enforcement test, Auth/Storage integration test or production deployment was performed.
- This verified source is being delivered as a single commit on `origin/main`; no public deployment or external account creation was performed.
- Local SQLite media storage and `public/uploads/` are development-only; production media uses Supabase Storage.
- Vercel must use Root Directory `Divyansh Garg GitHub website`; the app fails closed if `DATA_MODE` is missing/invalid or if `local` is used in production without the test-harness override.
