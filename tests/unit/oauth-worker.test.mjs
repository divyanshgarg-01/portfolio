import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../oauth-worker/worker.js';

const ORIGIN = 'https://worker.test';
const PAGES_ORIGIN = 'https://divyanshgarg-01.github.io';
const ALLOWED_USER = 'divyanshgarg-01';
const ENV = {
  GITHUB_CLIENT_ID: 'fake-client-id',
  GITHUB_CLIENT_SECRET: 'fake-client-secret',
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(path, init = {}) {
  return new Request(`${ORIGIN}${path}`, init);
}

function invoke(path, init = {}, env = ENV) {
  return worker.fetch(request(path, init), env);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function startAuth() {
  const response = await invoke('/auth');
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  const state = location.searchParams.get('state') || '';
  assert.match(state, /^[0-9a-f]{64}$/);
  return {
    state,
    cookie: `__Host-cms-oauth_state=${state}`,
    location,
    setCookie: response.headers.get('set-cookie') || '',
  };
}

function stubGitHub({ login = ALLOWED_USER, token = 'fake-access-token', tokenOk = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    calls.push({ target, options });
    if (target.includes('github.com/login/oauth/access_token')) {
      if (!tokenOk) return jsonResponse({ error: 'bad_verification_code' }, 400);
      return jsonResponse({ access_token: token });
    }
    if (target.includes('api.github.com/user')) {
      return jsonResponse({ login });
    }
    throw new Error(`Unexpected stubbed fetch: ${target}`);
  };
  return calls;
}

describe('OAuth worker runtime', () => {
  it('reports configuration without exposing secrets', async () => {
    const unconfigured = await invoke('/health', {}, {});
    assert.equal(unconfigured.status, 200);
    assert.deepEqual(await unconfigured.json(), {
      service: 'Divyansh Garg Portfolio CMS OAuth Gateway',
      status: 'operational',
      allowed_user: ALLOWED_USER,
      configured: false,
    });

    const configured = await invoke('/health');
    assert.equal(configured.status, 200);
    assert.equal((await configured.json()).configured, true);
    assert.equal(configured.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
    assert.equal(configured.headers.get('x-frame-options'), 'DENY');
  });

  it('rejects unknown origins and handles CORS preflight explicitly', async () => {
    const forbidden = await invoke('/health', { headers: { Origin: 'https://attacker.example' } });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get('access-control-allow-origin'), null);

    const allowed = await invoke('/health', { headers: { Origin: PAGES_ORIGIN } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), PAGES_ORIGIN);
    assert.equal(allowed.headers.get('vary'), 'Origin');

    const preflight = await invoke('/auth', {
      method: 'OPTIONS',
      headers: { Origin: PAGES_ORIGIN },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), PAGES_ORIGIN);
  });

  it('starts GitHub auth with least privilege and a hardened state cookie', async () => {
    const { state, location, setCookie } = await startAuth();
    assert.equal(location.origin, 'https://github.com');
    assert.equal(location.pathname, '/login/oauth/authorize');
    assert.equal(location.searchParams.get('client_id'), ENV.GITHUB_CLIENT_ID);
    assert.equal(location.searchParams.get('scope'), 'public_repo');
    assert.equal(location.searchParams.get('state'), state);
    assert.equal(location.searchParams.has('redirect_uri'), false);

    for (const fragment of [
      `__Host-cms-oauth_state=${state}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Max-Age=600',
    ]) {
      assert.ok(setCookie.includes(fragment), `state cookie missing ${fragment}`);
    }
    assert.equal(/Domain=/i.test(setCookie), false);
  });

  it('rejects callbacks with missing, mismatched or invalid state', async () => {
    const missing = await invoke('/callback?state=abc', {
      headers: { Cookie: '__Host-cms-oauth_state=abc' },
    });
    assert.equal(missing.status, 400);
    assert.match(await missing.text(), /Missing authorization code/);

    const { state } = await startAuth();
    const badState = await invoke(`/callback?code=fake-code&state=${state}`, {
      headers: { Cookie: '__Host-cms-oauth_state=different' },
    });
    assert.equal(badState.status, 400);
    assert.match(await badState.text(), /Invalid or expired OAuth state/);
    assert.match(badState.headers.get('set-cookie') || '', /Max-Age=0/);
  });

  it('completes the Decap handshake for the allowed GitHub account', async () => {
    const { state, cookie } = await startAuth();
    const calls = stubGitHub();
    const response = await invoke(`/callback?code=fake-code&state=${state}`, {
      headers: { Cookie: cookie },
    });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /authorization:github:success/);
    assert.match(html, /fake-access-token/);
    assert.ok(html.includes(JSON.stringify(PAGES_ORIGIN)));
    assert.match(response.headers.get('set-cookie') || '', /Max-Age=0/);

    assert.equal(calls.length, 2);
    assert.match(calls[0].target, /github\.com\/login\/oauth\/access_token$/);
    assert.match(calls[0].options.body, /client_secret=fake-client-secret/);
    assert.equal(calls[1].target, 'https://api.github.com/user');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer fake-access-token');
  });

  it('does not issue a token for another GitHub account', async () => {
    const { state, cookie } = await startAuth();
    stubGitHub({ login: 'someone-else' });
    const response = await invoke(`/callback?code=fake-code&state=${state}`, {
      headers: { Cookie: cookie },
    });

    assert.equal(response.status, 403);
    assert.match(await response.text(), /403 Forbidden: Unauthorized Account/);
  });

  it('surfaces GitHub token exchange failures without a token', async () => {
    const { state, cookie } = await startAuth();
    stubGitHub({ tokenOk: false });
    const response = await invoke(`/callback?code=fake-code&state=${state}`, {
      headers: { Cookie: cookie },
    });

    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /GitHub token exchange failed/);
    assert.equal(html.includes('fake-access-token'), false);
  });
});
