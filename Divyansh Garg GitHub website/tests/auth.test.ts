// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type AuthModule = typeof import('../lib/auth');
let auth: AuthModule;

beforeAll(async () => {
  vi.stubEnv('DATA_MODE', 'local');
  auth = await import('../lib/auth');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('role policy', () => {
  it('grants owners every capability', () => {
    for (const action of ['edit', 'publish', 'settings', 'users', 'media-delete'] as const) {
      expect(auth.can('owner', action)).toBe(true);
    }
  });

  it('limits editors to content edits', () => {
    expect(auth.can('editor', 'edit')).toBe(true);
    expect(auth.can('editor', 'publish')).toBe(false);
    expect(auth.can('editor', 'settings')).toBe(false);
    expect(auth.can('editor', 'users')).toBe(false);
    expect(auth.can('editor', 'media-delete')).toBe(false);
  });

  it('gives viewers no write capability', () => {
    for (const action of ['edit', 'publish', 'settings', 'users', 'media-delete'] as const) {
      expect(auth.can('viewer', action)).toBe(false);
    }
  });

  it('exposes structured auth errors for API handlers', () => {
    expect(new auth.AuthError('nope', 403, 'forbidden')).toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });
});
