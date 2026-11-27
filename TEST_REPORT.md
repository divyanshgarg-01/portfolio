# Verification report — Divyansh Garg portfolio and CMS

**Repository:** `https://github.com/divyanshgarg-01/portfolio.git`  
**Branch:** `main`  
**Base commit:** `78095ca3a60a51bba38dee2678b046a01b5c3ff8` (`Add files via upload`)  
**Final commit:** the latest `main` commit in this repository (verify with `git ls-remote origin main`)  
**Application audited:** `Divyansh Garg GitHub website/` (Next.js 15 App Router + CMS)  
**Environment:** local Windows workspace, Node.js `v24.11.1`, Chromium via Playwright, `DATA_MODE=local` (SQLite)  
**Final verification run:** 2026-11-27  
**Deployment:** not performed

---

## 1. Summary

| Category | Total | PASS | FAIL | NOT TESTED |
|---|---:|---:|---:|---:|
| TypeScript typecheck | 1 | 1 | 0 | 0 |
| ESLint (`--max-warnings=0`) | 1 | 1 | 0 | 0 |
| Vitest unit tests | 105 | 105 | 0 | 0 |
| Playwright E2E | 35 | 34 | 0 | 1 skipped (Supabase role boundaries) |
| Production build | 1 | 1 | 0 | 0 |
| Responsive checks | 5 E2E widths + 8 earlier browser captures | 13 | 0 | 0 |
| Direct/authorized PDF HTTP checks | 4 | 4 | 0 | 0 |
| Live Supabase migration / RLS / Auth / MFA / Storage | — | 0 | 0 | 1 |
| Hosted Vercel deployment / hosted smoke test | — | 0 | 0 | 1 |
| External certificate verification URLs | — | 0 | 0 | 1 |
| Owner confirmation of biographical claims | — | 0 | 0 | 1 |

**Overall:** local implementation **PASS**. There are **0 local failures**. Live Supabase, deployment, external verification links and owner-only content confirmation are **NOT TESTED** and are not claimed as production-ready.

PowerShell blocks `npm.ps1` in this workspace, so the same package binaries were invoked directly with `node node_modules/...`.

---

## 2. Scope and repository state

### Audited and staged

- **Added:** the complete Next.js application under `Divyansh Garg GitHub website/`:
  - `app/` — public pages, `/admin` pages, API routes, preview, local media serving, SEO files.
  - `components/` — `public/`, `motion/` and `admin/` UI.
  - `lib/` — DB adapters, auth, validation, media, preview, CV and defaults.
  - `supabase/` — migrations, seed and setup README.
  - `tests/`, `e2e/`, `playwright.config.ts`, `vitest.config.ts`.
  - `public/fonts/`, `public/uploads/.gitkeep`, the intentional public CV, config files and `package-lock.json`.
- **Added root handover documents:** `README.md`, `DEPLOYMENT.md`, `TEST_REPORT.md`.
- **Modified tracked files:** none.
- **Deleted tracked files:** none.

### Deliberately not staged

- Modified root `index.html` and the older root Vite/Decap application, content, scripts and assets.
- Root `.env.example`, root `.gitignore`, `desktop.ini`, `Divyansh_Aboutme.png`, `eng.traineddata`.
- Untracked `.github/workflows/deploy.yml`; it deploys the old root `./dist` to GitHub Pages and conflicts with the documented Next.js/Vercel setup.
- Generated, local-only or sensitive files: `.env.local`, `data/portfolio.db`, `private-uploads/`, `public/uploads/` runtime media, screenshots, `node_modules/`, `.next/`, Playwright artifacts and stray source PDFs.

The audited app is the Next.js project only; the older root Vite/Decap files were treated as unrelated historical work and were left untouched.

---

## 3. Commands and results

Run from `Divyansh Garg GitHub website/`:

| Command | Result | Notes |
|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | **PASS** | 0 type errors |
| `node node_modules/eslint/bin/eslint.js . --max-warnings=0` | **PASS** | 0 errors, 0 warnings |
| `node node_modules/vitest/vitest.mjs run` | **PASS** | 10 files, 105/105 tests |
| `$env:DG_ALLOW_LOCAL_IN_PRODUCTION='1'; node node_modules/next/dist/bin/next build` | **PASS** | Next.js 15.5.29 production build, 0 errors |
| `node node_modules/@playwright/test/cli.js test --reporter=list` | **PASS** | 34 passed, 1 skipped, 0 failed |
| `node visual-check.cjs` with `VISUAL_BASE_URL=http://127.0.0.1:3104` | **PASS (earlier run)** | 8 widths, terminal, mobile menu, reduced motion and admin captures; final responsive coverage is provided by the passing Playwright E2E checks above |

`DATA_MODE=local` is used only for the local harness and self-seeding SQLite fixture. `DG_ALLOW_LOCAL_IN_PRODUCTION=1` is used only by the Playwright/build harness over plain HTTP; normal production builds still fail closed if `DATA_MODE` is missing, invalid or `local`. The `node:sqlite` experimental warning is expected on Node 24 and is not a test failure.

A harness quirk initially reported shell exit code 1 when Node wrote native warnings to stderr even though the Vitest/Playwright reporters showed all tests passing. Final clean-exit verification with redirected stdout/stderr: **PASS** (typecheck `0`, lint `0`, unit `0`, E2E `0`, build `0`).

### Unit test files

| File | Tests | Result |
|---|---:|---|
| `tests/validation.test.ts` | 56 | **PASS** |
| `tests/mappers.test.ts` | 16 | **PASS** |
| `tests/rate-limit.test.ts` | 7 | **PASS** |
| `tests/media.test.ts` | 5 | **PASS** |
| `tests/api.test.ts` | 4 | **PASS** |
| `tests/auth.test.ts` | 4 | **PASS** |
| `tests/password.test.ts` | 4 | **PASS** |
| `tests/identity-roles.test.ts` | 3 | **PASS** |
| `tests/data-mode.test.ts` | 3 | **PASS** |
| `tests/preview.test.ts` | 3 | **PASS** |

---

## 4. Public site audit

| Area | Result | Evidence / notes |
|---|---|---|
| Home/Hero | **PASS** | One `h1`; exact rendered tagline `Driven by curiosity. Grounded in data. Inspired by technology.`; name/CTA, portrait and terminal controls present; design/typography/animation unchanged. |
| About | **PASS** | CMS-backed copy renders and editor round-trip is covered by E2E. |
| Education | **PASS** | CMS-backed records render; CRUD lifecycle E2E passes. |
| Experience | **PASS** | CMS-backed records render; CRUD lifecycle E2E passes. |
| Projects | **PASS** | Draft hidden, publish visible, reorder reflected in public DOM, unpublish/delete restored. |
| Certifications | **PASS** | 8 real published certificates in verified order; compact single-row horizontal rail (`flex`/`nowrap`, `overflow-x: auto`, no page overflow); mouse wheel/trackpad, pointer drag and native touch scrolling supported; `View Certificate` retained on all 8 cards and `Verify Credential` on all 7 cards that have URLs. |
| Skills | **PASS** | Category linkage and full lifecycle E2E pass. |
| Achievements | **PASS** | Non-certificate cards use `<article>` with separate open and Verify controls; no nested anchors. |
| Contact | **PASS** | Settings persist through admin API and reflect publicly; copy-email button/icon verified. |
| Navigation and footer | **PASS** | Mobile menu opens/closes with Escape; footer/settings E2E passes. |
| Layout and responsiveness | **PASS** | No horizontal overflow at 1440/1280/1024/900/768/600/390/320 px. |
| Links and media | **PASS** | CV URL is public and returns 200; private certificate PDFs are not exposed as static files. |
| Animations and reduced motion | **PASS** | Terminal, magnetic cursor, lightbox and reduced-motion fallback pass browser/E2E checks. |
| Accessibility basics | **PASS** | Landmarks, headings, labels, keyboard terminal/menu, no nested interactive elements in achievements. |
| Console/page errors | **PASS** | No browser console or page errors after the final clean rebuild. |
| External verification URLs | **NOT TESTED** | No external network/link-validity check was performed. |
| Owner confirmation of factual content | **NOT TESTED** | Biography, degree title, project facts and metrics remain owner-gated. |

Final browser check confirmed sections `top`, `about`, `education`, `experience`, `approach`, `projects`, `certifications`, `skills`, `achievements`, `community`, `contact`, one `h1`, zero horizontal overflow and zero console errors.

### Certificate integrity

**PASS.** Eight real certificates remain published in this verified relative order:

1. Foundational Certificate in Statistics and Management
2. Applied Machine Learning using Python
3. Decoding the Digital and Financial Worlds
4. Applications of AI in Precision Oncology
5. Deloitte Australia - Data Analytics Job Simulation
6. AI Tools Workshop
7. Tracing the Invisible – OSINT & Digital Footprint in the Modern World
8. Cyber Security Workshop

The seeded placeholder `ach_foundation` remains unpublished. Certificate IDs, credential fields and verification URLs were preserved. `Tracing the Invisible ...` and `Cyber Security Workshop` are **not** classified as direct IIT Madras certificates.

---

## 5. CMS operation audit

All operations were exercised with unique `E2E`/`Invalid` test data and then removed; a final DB query found **0** leftover test entities and **0** leftover test media rows.

| Collection / flow | Result | Operations verified |
|---|---|---|
| Projects | **PASS** | create, read, update, preview, publish, reorder, unpublish, delete, public reflection |
| Experience | **PASS** | create, read, update, publish, reorder, unpublish, delete |
| Education | **PASS** | create, read, update, publish, reorder, unpublish, delete |
| Skills | **PASS** | create, read, update, publish, reorder, unpublish, delete; category linkage |
| Skill categories | **PASS** | create, read, update, publish, reorder, unpublish, delete |
| Achievements (non-certificate) | **PASS** | create, read, update, publish, reorder, unpublish, delete |
| Certifications / achievements with `type: 'certificate'` | **PASS** | validation, PDF upload, create, read, update, publish, authorized file access, reorder, unpublish, delete, asset cleanup |
| Social links | **PASS** | create, read, update, publish, reorder, unpublish, delete |
| About singleton | **PASS** | edit, public reflection, restore |
| Settings singleton | **PASS** | contact field persistence, public reflection, restore |
| Media library | **PASS** | WebP upload, public URL, SVG rejection, replacement, usage-aware cleanup |
| Activity log | **PASS** | search, action filter and CSV export |
| Account | **PASS** | login/logout; incorrect current password is rejected; password reauthentication endpoint exists and is UI-wired |
| Preview | **PASS** | draft preview token opens and shows the draft; owner-gated preview/publish/unpublish |
| Users/roles UI | **PASS (local app-level controls)** | role-gated editor visibility, viewer fields and media controls; Supabase-backed role boundaries **NOT TESTED** |

---

## 6. Backend, DB, storage and security

| Check | Result | Notes |
|---|---|---|
| Local SQLite persistence | **PASS** | Data survives save/read cycles; local DB is gitignored. |
| Refresh persistence | **PASS** | Published/draft state and singleton changes were re-read after fresh requests. |
| Public reflection | **PASS** | `expect.poll` checks `/` HTML for published markers and absence after unpublish. |
| Uploads and validation | **PASS** | Magic-byte checks, folder/path allowlists, image conversion and PDF rejection/restriction verified locally. |
| Private PDF storage | **PASS** | Local private media moved to gitignored `private-uploads/`; direct static URL returns 404. |
| Authorized certificate files | **PASS** | `/api/certificates/[id]/file` and `/api/achievements/[id]/file` return 200 for published certificates, 404 for unpublished/wrong-type/missing IDs. |
| Public CV | **PASS** | `/uploads/resume/Divyansh_Garg_CV.pdf` intentionally remains public and returns 200. |
| Auth/session/protected routes | **PASS (local)** | Signed-in `/admin` access, signed-out redirect with `next`, logout and direct API denial verified. |
| Same-origin mutation checks | **PASS** | Unit regression tests cover missing/invalid/spoofed origins. |
| Allowlist hardening | **PASS** | `Object.hasOwn` used in admin collection routes, reorder route and preview helper. |
| Password change | **PASS (local)** | Current password required; nonce supported; wrong current password rejected. |
| Supabase migrations/RLS | **NOT TESTED** | No provisioned project or credentials; SQL was reviewed only. |
| Supabase Auth/MFA/users | **NOT TESTED** | No hosted users or MFA factor available. |
| Supabase Storage/signed URLs | **NOT TESTED** | Code path reviewed; live bucket policies not exercised. |
| Environment/secrets | **PASS** | Secret scan found no credential-shaped secrets in source/config/docs; `.env.local` ignored and never committed. |
| `.gitignore` / `.env.example` | **PASS** | Local DB, uploads, private PDFs, screenshots and env files excluded; app template retained. |
| Next config | **PASS** | Production build passes; local-in-production override is harness-only. |

HTTP status checks after the final rebuild:

| Request | Expected | Observed | Result |
|---|---:|---:|---|
| `GET /uploads/resume/Divyansh_Garg_CV.pdf` | 200 | 200 | **PASS** |
| `GET /uploads/achievements/<private-certificate>.pdf` (direct) | 404 | 404 | **PASS** |
| `GET /api/certificates/<published-certificate>/file` | 200 | 200 | **PASS** |
| `GET /api/certificates/<missing-or-wrong-type>/file` | 404 | 404 | **PASS** |

---

## 7. Defects found and fixed during this verification

1. **Preview used a stale entity id** — `EntityEditor.save()` now returns the saved item and `preview()` uses `savedItem.id`. **PASS**
2. **Preview/Publish/Unpublish/Save not consistently owner-gated** — server and UI checks added; editor visibility select disabled for viewers. **PASS**
3. **Viewer fields and MediaPicker controls were interactive** — viewer fields are read-only and `MediaPicker` supports a fully disabled state. **PASS**
4. **Allowlist bypass risk via inherited object properties** — collection, reorder and preview allowlists now use `Object.hasOwn`. **PASS**
5. **Origin check trusted client `x-forwarded-host`** — `assertSameOrigin` now compares the actual host, validates protocols and rejects missing/non-web origins; regression tests added. **PASS**
6. **Private certificate PDFs were reachable as static files in local mode** — private media is stored outside `public/`, served only through authorized routes, and `.gitignore` excludes it. **PASS**
7. **No authorized certificate/achievement file routes** — added `/api/certificates/[id]/file` and `/api/achievements/[id]/file` with published/type checks. **PASS**
8. **Nested `<a>` inside `<button>` in achievement cards** — changed to `<article>` with separate open and Verify controls. **PASS**
9. **Password change did not prove knowledge of the current password** — `currentPassword` is verified and a reauthentication route/UI was added. **PASS**
10. **Project reorder E2E matched the wrong section** — helper scoped to the section after Projects; reorder test passes. **PASS**
11. **Stale `.next` build caused a webpack runtime error after source edits** — clean rebuild passed and the production page loaded without console errors. **PASS**
12. **Stray generated PDFs/private media could be staged** — app `.gitignore` hardened; staged file list reviewed. **PASS**
13. **Hero tagline did not match the requested wording** — defaults, seed and local CMS singleton now use `Driven by curiosity. Grounded in data. Inspired by technology.`; rendered DOM verified. **PASS**
14. **Certifications wrapped into multiple grid rows** — replaced with a compact, keyboard-focusable horizontal rail with consistent card widths, native touch scrolling, vertical-wheel translation and mouse/pen drag. **PASS**
15. **Mandatory scroll snapping resisted short drag gestures** — removed snapping from the certificate rail; wheel and drag both scroll in focused browser checks. **PASS**

---

## 8. NOT TESTED / unresolved

| Item | Status | Reason |
|---|---|---|
| Apply Supabase migrations to a real project | **NOT TESTED** | No project, credentials or approval supplied. |
| RLS owner/editor/viewer boundaries | **NOT TESTED** | One E2E test is intentionally skipped; no provisioned users. |
| Supabase Auth/MFA, reauthentication and session assurance | **NOT TESTED** | No hosted users or MFA factor. |
| Supabase Storage public/private buckets and signed URLs | **NOT TESTED** | No bucket access. |
| Revalidation against Supabase + Vercel CDN | **NOT TESTED** | No hosted deployment. |
| Vercel Preview/Production deployment and hosted smoke test | **NOT TESTED** | No account/project/approval; no deployment performed. |
| Custom domain, DNS and TLS | **NOT TESTED** | Not provisioned. |
| External certificate verification URLs and link liveness | **NOT TESTED** | No external network validation performed. |
| Owner confirmation of degree, project facts, metrics, contact details and usage rights | **NOT TESTED** | Owner-only factual review required. |
| `gh` CLI verification | **NOT TESTED** | `gh` is not installed; Git credentials were used instead. |
| Unrelated root Vite/Decap files | **NOT TESTED** | Out of scope and deliberately not staged. |

There are **no unresolved local failures**. The unresolved items above are environment, access or owner-approval dependencies, not known code defects.

---

## 9. Handover conclusion

Local code quality, public rendering, responsive behavior, motion fallbacks, authentication and all CMS CRUD/preview/publish/media flows pass. The local SQLite fixture contains the owner's real published certificates and no test leftovers. The intended Next.js app and handover documents are staged as one meaningful change for `main`; push is to `origin/main` without force and the delivered commit hash is the resulting tip of `main`.

**PASS** — local verification and repository push.  
**NOT TESTED** — live Supabase, MFA/Storage/RLS, deployment, external verification links and owner factual review. No production readiness is claimed.
