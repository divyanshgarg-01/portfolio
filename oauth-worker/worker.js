/**
 * Cloudflare Worker OAuth 2.0 proxy for Decap CMS.
 *
 * Endpoints:
 *   GET  /health   - liveness/configuration check (no secrets exposed)
 *   GET  /auth     - starts the GitHub flow with a short-lived state cookie
 *   GET  /callback - validates state, exchanges the code and returns the token
 *                    to Decap CMS using the authorisation postMessage handshake
 *
 * Only the repository owner account may obtain a CMS token. The token is
 * requested with the least-privilege `public_repo` scope only.
 */

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_API = "https://api.github.com/user";
const ALLOWED_USER = "divyanshgarg-01";
const PRIMARY_ORIGIN = "https://divyanshgarg-01.github.io";
const STATE_COOKIE = "__Host-cms-oauth_state";
const STATE_MAX_AGE_SECONDS = 600;
const USER_AGENT = "DivyanshGarg-Portfolio-CMS-OAuth";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (_error) {
      // Deliberately do not log error details: they may contain tokens.
      return withHeaders(textResponse("Internal Server Error", 500), SECURITY_HEADERS);
    }
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const allowedOrigins = getAllowedOrigins(env);

  // Never emit a wildcard CORS header. Requests without an Origin are normal
  // top-level navigations (the GitHub redirect/callback), so they are allowed.
  if (origin && !allowedOrigins.includes(origin)) {
    return withHeaders(textResponse("Forbidden origin", 403), SECURITY_HEADERS);
  }

  const corsHeaders = origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : {};
  const headers = { ...SECURITY_HEADERS, ...corsHeaders };

  if (request.method === "OPTIONS") {
    return withHeaders(new Response(null, { status: 204 }), headers);
  }

  if (request.method !== "GET") {
    return withHeaders(textResponse("Method Not Allowed", 405, { Allow: "GET, OPTIONS" }), headers);
  }

  if (url.pathname === "/" || url.pathname === "/health") {
    return withHeaders(
      jsonResponse({
        service: "Divyansh Garg Portfolio CMS OAuth Gateway",
        status: "operational",
        allowed_user: ALLOWED_USER,
        configured: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      }),
      headers
    );
  }

  if (url.pathname === "/auth") {
    const configError = validateConfig(env);
    if (configError) {
      return withHeaders(textResponse(configError, 500), headers);
    }

    const state = createRandomState();
    const authUrl = new URL(GITHUB_AUTH_URL);
    authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    authUrl.searchParams.set("scope", "public_repo");
    authUrl.searchParams.set("state", state);
    if (env.GITHUB_CALLBACK_URL) {
      authUrl.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL);
    }

    return withHeaders(
      new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
          "Set-Cookie": buildStateCookie(state, STATE_MAX_AGE_SECONDS),
        },
      }),
      headers
    );
  }

  if (url.pathname === "/callback") {
    // The state cookie is cleared on every callback outcome.
    const callbackHeaders = { ...headers, "Set-Cookie": buildStateCookie("", 0) };
    const code = url.searchParams.get("code") || "";
    const receivedState = url.searchParams.get("state") || "";
    const expectedState = readCookie(request, STATE_COOKIE);

    if (!code) {
      return decapHtmlResponse("error", { message: "Missing authorization code from GitHub" }, allowedOrigins, callbackHeaders);
    }

    const configError = validateConfig(env);
    if (configError) {
      return decapHtmlResponse("error", { message: "CMS OAuth gateway is not configured" }, allowedOrigins, callbackHeaders);
    }

    if (!expectedState || !constantTimeEqual(receivedState, expectedState)) {
      return decapHtmlResponse("error", { message: "Invalid or expired OAuth state" }, allowedOrigins, callbackHeaders);
    }

    const tokenBody = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    });
    if (env.GITHUB_CALLBACK_URL) {
      tokenBody.set("redirect_uri", env.GITHUB_CALLBACK_URL);
    }

    let accessToken = "";
    try {
      const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: tokenBody.toString(),
      });

      if (!tokenResponse.ok) {
        return decapHtmlResponse("error", { message: "GitHub token exchange failed" }, allowedOrigins, callbackHeaders);
      }

      const tokenData = await tokenResponse.json();
      // tokenData is never logged or echoed back to the browser.
      if (!tokenData || tokenData.error || typeof tokenData.access_token !== "string" || !tokenData.access_token) {
        return decapHtmlResponse("error", { message: "GitHub did not return an access token" }, allowedOrigins, callbackHeaders);
      }
      accessToken = tokenData.access_token;
    } catch (_error) {
      return decapHtmlResponse("error", { message: "Unable to complete the GitHub token exchange" }, allowedOrigins, callbackHeaders);
    }

    try {
      const userResponse = await fetch(GITHUB_USER_API, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!userResponse.ok) {
        return decapHtmlResponse("error", { message: "Could not verify the GitHub account" }, allowedOrigins, callbackHeaders);
      }

      const userData = await userResponse.json();
      const login = typeof userData?.login === "string" ? userData.login.toLowerCase() : "";
      if (login !== ALLOWED_USER.toLowerCase()) {
        return withHeaders(forbiddenResponse(userData?.login), callbackHeaders);
      }
    } catch (_error) {
      return decapHtmlResponse("error", { message: "Unable to verify the GitHub account" }, allowedOrigins, callbackHeaders);
    }

    return decapHtmlResponse(
      "success",
      { token: accessToken, provider: "github" },
      allowedOrigins,
      callbackHeaders
    );
  }

  return withHeaders(textResponse("Not found", 404), headers);
}

/** Allow only the Pages origin plus explicitly configured extras. `*` is ignored. */
function getAllowedOrigins(env) {
  const origins = new Set();
  const sources = [PRIMARY_ORIGIN, typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : ""];

  for (const source of sources) {
    for (const candidate of source.split(/[\s,]+/)) {
      if (!candidate) continue;
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          origins.add(parsed.origin);
        }
      } catch (_error) {
        // Ignore malformed or wildcard entries rather than widening the policy.
      }
    }
  }

  return Array.from(origins);
}

function validateConfig(env) {
  if (!env.GITHUB_CLIENT_ID) return "Worker is missing GITHUB_CLIENT_ID";
  if (!env.GITHUB_CLIENT_SECRET) return "Worker is missing GITHUB_CLIENT_SECRET";
  return null;
}

function createRandomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildStateCookie(value, maxAge) {
  // __Host- requires Secure, Path=/ and no Domain attribute.
  return [
    `${STATE_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator === -1) continue;
    if (segment.slice(0, separator).trim() === name) {
      return segment.slice(separator + 1).trim();
    }
  }
  return "";
}

/** Compare without early exit so mismatches do not leak position via timing. */
function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left || "");
  const b = encoder.encode(right || "");
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Decap CMS opens the worker as a popup. It first sends `authorizing:github`
 * once it sees the same message from the popup, and then expects
 * `authorization:github:<status>:<json>` targeted at its own origin.
 */
function decapHtmlResponse(status, content, allowedOrigins, headers) {
  const payload = status === "success"
    ? JSON.stringify({ token: content.token, provider: content.provider || "github" })
    : JSON.stringify({ message: content.message || "Authorization failed" });
  const message = `authorization:github:${status}:${payload}`;
  const safeMessage = JSON.stringify(message).replace(/</g, "\\u003c");
  const safeOrigins = JSON.stringify(allowedOrigins).replace(/</g, "\\u003c");
  const httpStatus = status === "success" ? 200 : 400;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <title>Authorizing Decap CMS</title>
  </head>
  <body>
    <p style="font-family: sans-serif; text-align: center; margin-top: 50px;">
      Authenticating with GitHub. This window should close automatically.
    </p>
    <script>
      (function () {
        var allowedOrigins = ${safeOrigins};
        var message = ${safeMessage};
        var completed = false;

        function post(targetOrigin) {
          if (!window.opener) return;
          try {
            window.opener.postMessage(message, targetOrigin);
          } catch (_error) {
            // Ignore postMessage failures for origins other than the opener.
          }
        }

        function announce() {
          if (!window.opener) return;
          allowedOrigins.forEach(function (origin) {
            try {
              window.opener.postMessage("authorizing:github", origin);
            } catch (_error) {
              // Ignore postMessage failures for origins other than the opener.
            }
          });
        }

        function receive(event) {
          if (completed) return;
          if (allowedOrigins.indexOf(event.origin) === -1) return;
          completed = true;
          window.removeEventListener("message", receive, false);
          post(event.origin);
        }

        window.addEventListener("message", receive, false);
        announce();
      })();
    </script>
  </body>
</html>`;

  return withHeaders(
    new Response(html, { status: httpStatus, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    headers
  );
}

function forbiddenResponse(login) {
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Access Denied</title></head>
  <body style="font-family: sans-serif; background: #070b19; color: #fff; padding: 40px; text-align: center;">
    <h1 style="color: #f87171;">403 Forbidden: Unauthorized Account</h1>
    <p>The authenticated GitHub account <strong>${escapeHtml(login || "unknown")}</strong> is not authorized to edit this portfolio.</p>
    <p>Only <strong>${escapeHtml(ALLOWED_USER)}</strong> may access the CMS.</p>
  </body>
</html>`;
  return new Response(html, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function textResponse(message, status, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}

function withHeaders(response, extraHeaders) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, String(value));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
