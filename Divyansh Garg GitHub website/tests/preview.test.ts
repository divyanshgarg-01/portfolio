// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localAdapter } from '../lib/db/local';

type PreviewModule = typeof import('../lib/preview');
let preview: PreviewModule;

beforeAll(async () => {
  vi.stubEnv('DATA_MODE', 'local');
  preview = await import('../lib/preview');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('preview tokens', () => {
  it('hashes the raw token with SHA-256 before storage', () => {
    expect(preview.hashPreviewToken('preview-token')).toBe(
      createHash('sha256').update('preview-token').digest('hex'),
    );
  });

  it('consumes a token exactly once and scopes it to its entity', async () => {
    const token = randomBytes(24).toString('base64url');
    const hash = preview.hashPreviewToken(token);
    const entityId = '00000000-4000-4000-8000-000000000000';
    await localAdapter.createPreviewToken(hash, { collection: 'projects', id: entityId }, 60);

    const first = await preview.buildTokenScopedPreview(token);
    expect(first?.settings.siteTitle).toMatch(/^DRAFT PREVIEW/);

    const second = await preview.buildTokenScopedPreview(token);
    expect(second).toBeNull();
  });

  it('rejects an unknown token', async () => {
    expect(await preview.buildTokenScopedPreview(randomBytes(24).toString('base64url'))).toBeNull();
  });
});
