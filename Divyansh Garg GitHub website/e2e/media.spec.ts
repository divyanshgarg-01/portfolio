import { expect, test } from '@playwright/test';
import { apiFor, loginWithApi } from './helpers/api';
import { tinyWebpBuffer } from './helpers/fixtures';

test('admin media accepts a generated WebP and rejects SVG', async ({ page }) => {
  const api = apiFor(page);
  await loginWithApi(api);

  const webp = await tinyWebpBuffer();
  expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');

  let assetId: string | undefined;
  try {
    const response = await api.post('/api/admin/media', {
      multipart: {
        folder: 'e2e',
        file: { name: 'e2e-pixel.webp', mimeType: 'image/webp', buffer: webp },
      },
    });
    expect(response.status(), 'WebP upload should be accepted').toBe(201);

    const body = (await response.json()) as {
      item: { id: string; path: string; mimeType: string };
    };
    assetId = body.item.id;
    expect(body.item.path).toMatch(/^\/uploads\/e2e\/.*\.webp$/);
    expect(body.item.mimeType).toBe('image/webp');

    const publicFile = await api.get(body.item.path);
    expect(publicFile.ok(), 'the uploaded asset should have a public URL').toBeTruthy();
    expect(publicFile.headers()['content-type']).toContain('image/webp');
  } finally {
    if (assetId) {
      const cleanup = await api.delete(`/api/admin/media/${assetId}`);
      expect(cleanup.ok(), 'uploaded test asset should be removable').toBeTruthy();
    }
  }

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const rejected = await api.post('/api/admin/media', {
    multipart: {
      folder: 'e2e',
      file: { name: 'e2e-vector.svg', mimeType: 'image/svg+xml', buffer: svg },
    },
  });
  expect(rejected.status(), 'SVG upload should be rejected').toBe(400);
});
