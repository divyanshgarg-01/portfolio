# GitHub OAuth worker for Decap CMS

`worker.js` is a small Cloudflare Worker that performs the GitHub OAuth exchange
for the portfolio CMS at `https://divyanshgarg-01.github.io/portfolio/admin/`.
The browser never sees the client secret; it only receives the short-lived OAuth
access token through Decap's popup handshake.

## 1. Create the GitHub OAuth App

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.
2. Set:
   - **Application name**: `Divyansh Garg Portfolio CMS`
   - **Homepage URL**: `https://divyanshgarg-01.github.io/portfolio/admin/`
   - **Authorization callback URL**: `https://divyansh-portfolio-oauth.workers.dev/callback`
3. Register the app, then generate a **client secret**.
4. The GitHub account that authorizes the app must be `divyanshgarg-01` and must
   have write access to the public repository `divyanshgarg-01/portfolio`
   (required for content commits and pull requests).

The worker requests only the `public_repo` scope. It does **not** request `user`,
`repo` (private), workflow, or any other scope.

## 2. Configure and deploy the Worker

```bash
npm install -g wrangler
wrangler login

cd oauth-worker

wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# Deploy to the exact subdomain used in the CMS config.
# The worker name, entry point and compatibility date are in wrangler.toml.
wrangler deploy
```

The deployed worker URL must be `https://divyansh-portfolio-oauth.workers.dev`,
which is what `public/admin/config.yml` sets as `backend.base_url`.

### Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | yes | OAuth App client ID. |
| `GITHUB_CLIENT_SECRET` | yes | OAuth App secret; stored as a Wrangler secret, never in git. |
| `ALLOWED_ORIGINS` | no | Comma- or whitespace-separated extra origins allowed by CORS and the postMessage handshake. The Pages origin is always allowed. |
| `GITHUB_CALLBACK_URL` | no | Set only when using a custom Worker domain. If set, it must exactly match the OAuth App's registered callback URL. |

Example for an additional local development origin:

```bash
wrangler secret put ALLOWED_ORIGINS
# http://localhost:3000
```

Never put credentials in `wrangler.toml`, source files or chat messages. Use
`wrangler secret put` so they are encrypted in the Worker environment.

## 3. Verify the deployment

- `GET https://divyansh-portfolio-oauth.workers.dev/health` returns JSON with
  `configured: true` when both secrets exist. It never returns the secrets.
- Open `https://divyanshgarg-01.github.io/portfolio/admin/` and sign in with
  GitHub. The popup should close automatically after authorization.
- If GitHub reports a `redirect_uri_mismatch`, make sure the registered callback
  URL and `GITHUB_CALLBACK_URL` match exactly, including trailing slash.

## 4. Endpoints

| Endpoint | Behaviour |
| --- | --- |
| `GET /health` (also `/`) | Public liveness + boolean configuration status. |
| `GET /auth` | Sets a short-lived `__Host-` state cookie and redirects to GitHub with `scope=public_repo`. |
| `GET /callback` | Validates state, exchanges the code server-side, verifies the GitHub login, then returns Decap's `authorization:github:...` postMessage response. The state cookie is deleted on every outcome. |
| `OPTIONS` | CORS preflight for allowlisted origins only. |

## 5. Security notes

- **State + CSRF protection:** a cryptographically random 32-byte state is
  stored in an `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 10-minute cookie
  and compared with the callback state using a constant-time comparison. The
  cookie is cleared immediately after the callback.
- **Strict origin policy:** CORS and the postMessage handshake accept only
  `https://divyanshgarg-01.github.io` plus origins listed in `ALLOWED_ORIGINS`.
  Wildcards are never emitted or accepted.
- **Least privilege:** the OAuth request asks for `public_repo` only. No user
  profile scope is requested; the public login is read solely to enforce the
  owner allowlist.
- **No secret leakage:** the client secret and access token are used only
  server-side. Errors returned to the browser are generic, and nothing is
  logged. Security headers (CSP, nosniff, frame denial, referrer suppression,
  HSTS, permissions policy and `Cache-Control: no-store`) are applied to all
  responses so the token-bearing callback HTML is never cached.
- **Static-site limits remain:** this worker authenticates GitHub; it does not
  add roles, MFA enforcement, private media or server-side content authorisation.
  See `docs/GITHUB_PAGES_CMS.md`.
