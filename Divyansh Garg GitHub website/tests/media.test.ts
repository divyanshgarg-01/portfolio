// @vitest-environment node
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MediaAsset } from '../lib/types';

type MediaModule = typeof import('../lib/media');
let media: MediaModule;

const asset = (path: string, bucket: MediaAsset['bucket'] = 'media-public'): MediaAsset => ({
  id: 'asset-1',
  path,
  bucket,
  filename: 'abc.webp',
  folder: 'projects',
  altText: '',
  mimeType: bucket === 'media-private' ? 'application/pdf' : 'image/webp',
  size: 1,
  width: 1,
  height: 1,
  uploadedBy: 'owner-1',
  blurDataUrl: '',
  createdAt: '2026-01-01T00:00:00Z',
});

beforeAll(async () => {
  vi.stubEnv('DATA_MODE', 'local');
  media = await import('../lib/media');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('storage object paths', () => {
  it('extracts local upload paths', () => {
    expect(media.storageObjectPath(asset('/uploads/projects/abc.webp'))).toBe('projects/abc.webp');
  });

  it('extracts Supabase public and private object paths', () => {
    expect(media.storageObjectPath(asset(
      'https://example.supabase.co/storage/v1/object/public/media-public/projects/abc.webp',
    ))).toBe('projects/abc.webp');
    expect(media.storageObjectPath(asset(
      'https://example.supabase.co/storage/v1/object/media-private/projects/abc.webp',
      'media-private',
    ))).toBe('projects/abc.webp');
  });

  it('falls back to folder and filename for legacy paths', () => {
    expect(media.storageObjectPath(asset('/legacy/path'))).toBe('projects/abc.webp');
  });

  it('returns local paths unchanged in local mode', () => {
    expect(media.getPublicMediaUrl(asset('/uploads/projects/abc.webp'))).toBe('/uploads/projects/abc.webp');
  });

  it('stores private local media outside the public directory', () => {
    const pdf = asset('/uploads/achievements/abc.pdf', 'media-private');
    expect(media.localObjectPath(pdf)).toBe(resolve(process.cwd(), 'private-uploads/achievements/abc.pdf'));
    expect(media.localObjectPath(asset('/uploads/projects/abc.webp')))
      .toBe(resolve(process.cwd(), 'public/uploads/projects/abc.webp'));
    const publicCv = { ...asset('/uploads/resume/Divyansh_Garg_CV.pdf'), mimeType: 'application/pdf' };
    expect(media.localObjectPath(publicCv))
      .toBe(resolve(process.cwd(), 'public/uploads/resume/Divyansh_Garg_CV.pdf'));
  });
});
