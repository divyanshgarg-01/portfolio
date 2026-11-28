# GitHub Pages + Decap CMS

This setup turns the Vite/React portfolio into a fully Git-backed static site.
Content lives in `src/content/*.json`, media is committed under `public/uploads`,
and Decap CMS is loaded at runtime from a CDN at `/portfolio/admin/`.

## Automatic publish path

1. An editor signs in at `https://divyanshgarg-01.github.io/portfolio/admin/`
   through the OAuth worker.
2. With `publish_mode: editorial_workflow`, saving creates/updates a draft on a
   CMS branch and **Publish** opens a pull request against `main`.
3. Merging that pull request into `main` triggers
   `.github/workflows/deploy.yml`.
4. The workflow runs `npm ci`, `npm run typecheck`, `npm run test`,
   `npm run build` and `npm run verify:build`, uploads `./dist` as a Pages
   artifact, and deploys it.
5. GitHub Pages serves the new build at
   `https://divyanshgarg-01.github.io/portfolio/`.

Unmerged CMS PRs never affect the live site, so the PR itself acts as the review
and preview step.

## Prerequisites

### Repository and Pages

- Repository: `divyanshgarg-01/portfolio`, public, default branch `main`.
- GitHub Pages → **Build and deployment** → **Source: GitHub Actions**.
- The workflow needs `contents: read`, `pages: write` and `id-token: write`
  permissions (already declared in `deploy.yml`), and must be allowed to run on
  `main`.
- The Vite app must keep `base: '/portfolio/'` so assets and the admin path
  resolve correctly. The CMS is at `/portfolio/admin/`.
- `main` may be protected, but whoever merges CMS PRs needs write permission on
  the repository.

### OAuth worker

- Deploy `oauth-worker/worker.js` to
  `https://divyansh-portfolio-oauth.workers.dev` (details in
  `oauth-worker/README.md`).
- Set the Wrangler secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
- Register the GitHub OAuth App with:
  - Homepage URL: `https://divyanshgarg-01.github.io/portfolio/admin/`
  - Callback URL: `https://divyansh-portfolio-oauth.workers.dev/callback`
- The OAuth App must belong to (or be authorised by) `divyanshgarg-01`; the
  worker rejects every other GitHub login.
- The authorising account needs write access to the public repository because
  the CMS requests only `public_repo` scope, which is enough to commit content
  and open/manage pull requests. It cannot read or write private repositories.
- Optional: set `ALLOWED_ORIGINS` in the Worker for additional local development
  origins. The production Pages origin is always allowed.

### GitHub account security

- Enable two-factor authentication on the GitHub account **outside** the CMS.
- Be aware that any account with write access to the repository can bypass the
  CMS entirely and edit JSON files with `git`. The CMS is a convenience UI, not
  a security boundary.

## Content and media

- Singletons: `src/content/settings.json`, `about.json`, `resume.json`.
- Folder collections: `projects`, `experience`, `education`, `skill-categories`,
  `skills`, `achievements`, `socials` (one JSON file per entity).
- Uploads go to `public/uploads` in the repository and are served from
  `/portfolio/uploads` after the next deploy.
- The `labels` object in `settings.json` mirrors UI strings that used to be
  hard-coded; edit those keys to rename buttons, kickers and small labels
  without touching source code.
- `currentlyLines`, `approach`, `community` and `labels.preloader` in
  `settings.json` are also editable and drive the matching public strings,
  preloader copy and panels.
- `sectionOrder` controls the order of `main > section` elements. Unknown ids
  are ignored and any omitted sections keep their original relative order.
- When adding a new label key, add the same key to the CMS `labels` object
  fields so it remains editable; saving a singleton rewrites that object.

## Unavoidable static-site limitations

A GitHub Pages + Git-backed CMS is intentionally simple. It cannot provide the
server-side features of a hosted database CMS:

- **No per-user roles or MFA enforcement in the CMS.** GitHub decides who can
  authenticate; the worker only checks the GitHub login. There are no
  owner/editor/viewer roles inside Decap.
- **No row-level security.** All content files are readable by anyone with
  repository read access. `draft` / `unpublished` visibility is a build-time
  filter, not an access control mechanism.
- **No private or signed media.** Every uploaded file is committed to a public
  repository and served as a static asset at `/portfolio/uploads/...`. Even
  files used only by drafts become public once committed; do not upload
  sensitive documents.
- **No preview tokens or private preview URLs.** Editorial-workflow pull
  requests provide GitHub diff/review previews, not a rendered private site.
- **No instant revalidation.** Publishing depends on a GitHub Actions run and a
  Pages deployment. Expect a delay of minutes, not milliseconds, and avoid
  automating a deploy on every keystroke.
- **No server-side audit trail or rate limiting in the CMS.** GitHub commit
  history and pull requests are the authoritative record of changes.

## Local development

Decap CMS can be exercised locally by running the Vite dev server with the app
base `/portfolio/` and allowing `http://localhost:3000` through the Worker's
`ALLOWED_ORIGINS`. Production behaviour, however, should always be verified on
the deployed Pages URL, including the OAuth callback and artifact deploy.
