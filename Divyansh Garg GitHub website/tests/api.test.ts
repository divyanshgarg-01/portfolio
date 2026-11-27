import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type ApiModule = typeof import('../lib/api');
type AuthModule = typeof import('../lib/auth');
let api: ApiModule;
let AuthError: AuthModule['AuthError'];

beforeAll(async () => {
  vi.stubEnv('DATA_MODE', 'local');
  api = await import('../lib/api');
  ({ AuthError } = await import('../lib/auth'));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function request(headers: Record<string, string>): Request {
  return new Request('https://portfolio.example/api/admin/projects', {
    method: 'POST',
    headers,
  });
}

describe('assertSameOrigin', () => {
  it('allows matching browser origins and referers', () => {
    expect(() => api.assertSameOrigin(request({ origin: 'https://portfolio.example' }))).not.toThrow();
    expect(() => api.assertSameOrigin(request({ referer: 'https://portfolio.example/admin/projects' }))).not.toThrow();
  });

  it('rejects cross-site and non-web origins', () => {
    expect(() => api.assertSameOrigin(request({ origin: 'https://attacker.example' }))).toThrow(AuthError);
    expect(() => api.assertSameOrigin(request({ origin: 'chrome-extension://attacker.example' }))).toThrow(AuthError);
  });

  it('does not trust a client-supplied forwarded host', () => {
    expect(() => api.assertSameOrigin(request({
      origin: 'https://attacker.example',
      'x-forwarded-host': 'attacker.example',
    }))).toThrow(AuthError);
  });

  it('rejects state-changing requests without an origin or referer', () => {
    expect(() => api.assertSameOrigin(request({}))).toThrow(AuthError);
  });
});
