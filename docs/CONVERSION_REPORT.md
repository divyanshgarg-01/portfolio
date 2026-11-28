# Static GitHub Pages conversion — Stage 1/2 report

**Status:** implemented, locally verified, merged to `origin/main` and deployed through GitHub Actions. No live CMS content changes have been published. Sign-in remains owner-gated until the OAuth Worker and GitHub OAuth App are deployed with the owner's credentials.

Conversion work was performed in the isolated `gh-pages-baseline` worktree. The untouched master app remains in `Divyansh Garg GitHub website/` at commit `dbefe5d8eb59371552df708e17284542d2b81228`.

## What was built

- **Vite + React static host** (`index.html`, `vite.config.ts`, `src/main.tsx`) using the original public and motion components verbatim from the master app where possible.
- **Compiled CSS, fonts and assets** copied from the master build, with `@font-face` and asset URLs rewritten from `/_next/static/media/` to the `/portfolio/` base.
- **Frozen content snapshot** in `src/content/` (57 deterministic JSON files) exported read-only from the ignored local `data/portfolio.db`. Only published, non-deleted records were exported; social links additionally require `visible: true`.
- **Full Decap CMS parity**:
  - Singletons: `settings`, `about`, `resume`.
  - Folder collections: `projects`, `experience`, `education`, `skill-categories`, `skills`, `achievements`, `socials`.
  - Every JSON key has a matching CMS field, including nested label groups.
  - Hardcoded visible strings are now driven by `settings.labels`, including section kickers/headings, buttons, project/archive copy, skill-map copy, approach panels, telemetry fallback, terminal strings and preloader words/signature/count fallback.
  - `settings.currentlyLines`, `settings.approach`, `settings.community` and `settings.sectionOrder` are editable and drive the rendered output.
  - Defaults reproduce the original visible strings exactly, so no copy changed as a result of wiring.
- **Static adaptations** (`src/data/portfolio.ts`, `PublicSite.tsx`): media resolution now points at committed `/portfolio/uploads/...` files; certificate/achievement API routes were replaced with direct upload links. All 8 certificates keep their original order, assets and CV.
- **Publishing path**: `public/admin/index.html` loads pinned Decap CMS 3.18.0 with SRI; `public/admin/config.yml` uses the GitHub backend with `editorial_workflow`; `.github/workflows/deploy.yml` builds, verifies and deploys `dist` on pushes to `main`.
- **Hardened OAuth Worker** (`oauth-worker/worker.js`): state validation, strict CORS allowlist, `divyanshgarg-01` login restriction, least-privilege `public_repo` scope and `Cache-Control: no-store, no-cache, must-revalidate`.
- **Documentation**: `docs/GITHUB_PAGES_CMS.md` covers setup, publishing and unavoidable static-platform limitations.

## Verification results

| Check | Result |
| --- | --- |
| `npm ci` | 0 vulnerabilities |
| `npm run typecheck` | pass |
| `npm run test` | 16 tests / 5 suites, all pass |
| `npm run build` | pass |
| `npm run verify:build` | `BUILD_VERIFY_OK` |
| `npm run test:e2e` | 1 passed (structure and assets vs master) |
| `node scripts/audit-static.cjs` | 4 viewports, 0 console/page/HTTP errors; CV, first certificate PDF and portrait WebP all `200` |
| `node scripts/dom-diff.cjs` | no meaningful DOM/style/geometry/text differences after path normalization |
| `node scripts/interaction-diff.cjs` | state differences only from canvas randomness and a few pixels of scroll drift |
| `node scripts/compare-baseline.cjs` | 134 comparisons; 50 flags vs 49 for a second master capture |

## Pixel comparison findings

`comparison/compare-report.json` (static vs frozen master baseline) was compared against `comparison/compare-report-master-rerun.json` (a second master capture vs the same baseline). The near-identical ratios show that most flags are **capture-time nondeterminism in the original animated canvas**, not conversion defects.

States where static and repeated-master ratios agree within noise (examples): `section-about` 0.0879/0.0879, achievement lightbox 0.0997/0.0997, hero animating 0.0572/0.0599, copy-email feedback 0.0514/0.0591. Fully settled captures are close: `04-full-page` is 0.001–0.002 on all viewports, and almost every settled section is below 0.006.

Larger deltas and their investigation result:

| State | Static | Master rerun | Explanation |
| --- | ---: | ---: | --- |
| reduced-motion `00-initial-load` | 0.0959 | 0.0000 | Hydration timing. At `domcontentloaded` master has not run its effects (hero title still is text, canvas unpainted), while the Vite module script already has. After ~1 s both have identical `data-hero-intent="particles-ready"`, canvas opacity and title colour. |
| mobile `01-preloader` | 0.0762 | 0.0209 | Preloader/canvas animation frame captured at slightly different progress. |
| desktop `00-initial-load` | 0.0441 | 0.0000 | Same hydration timing as above. |
| mobile `03-hero-final` | 0.0441 | 0.0278 | Particle field randomness plus a small scroll offset. |
| desktop `state-project-search-pybe` | 0.0353 | 0.0015 | Canvas randomness; a fresh master-vs-static capture of the same state gives 0.0274 with identical inputs, card count and card text. |
| tablet/mobile `state-skills-second-group` | 0.0310 / 0.0293 | 0.0139 / 0.0143 | Canvas randomness with a 1 px scroll drift. |

No static-only DOM mismatch, missing section, changed visible label, broken asset or console error was found. Pixel parity is therefore demonstrated for settled states; **transient animation frames are not claimed to be pixel-identical** because the source itself is random and timing-dependent.

## Deployment and remaining owner-gated work

Completed after this report was first written:

1. Repository Pages source was set to **GitHub Actions**; the workflow deploys `dist` on pushes to `main`.
2. PRs #1–#3 were merged into `main`; the live public site, `/portfolio/admin/`, CMS config and CV all return `200`.
3. The Hero underline/celestial canvas regression was fixed for the client-only Vite mount, including reduced motion.

Still requiring explicit owner action:

1. Deploy `oauth-worker/worker.js`, set `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, and register the OAuth App callback exactly as described in `oauth-worker/README.md`.
2. Confirm `GET https://divyansh-portfolio-oauth.workers.dev/health` reports `configured: true`.
3. Verify the deployed OAuth round trip and a CMS draft→PR→publish cycle with the repository owner account.

## Static-platform limitations (unchanged)

GitHub Pages cannot preserve Supabase roles/MFA/RLS, private signed media, live draft preview tokens, instant revalidation or server-side per-request filtering. Editorial-workflow pull requests provide review/diff previews, not a rendered private preview. See `docs/GITHUB_PAGES_CMS.md` for the full list.
