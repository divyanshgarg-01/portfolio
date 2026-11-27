import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { dataMode, getPublicDb } from './db';
import { createSignedCertificateUrl, getCertificateAsset, localObjectPath, MediaError } from './media';
import type { Achievement } from './types';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface ServeOptions {
  label: string;
  type?: Achievement['type'];
}

/**
 * Streams a file attached to a published, non-deleted achievement through an
 * authorized route. Private storage never receives a direct public URL.
 */
export async function servePublishedAchievementFile(
  id: string,
  { label, type }: ServeOptions,
): Promise<NextResponse> {
  const achievements = await getPublicDb().listEntities<Achievement>('achievements');
  const record = achievements.find((item) => item.id === id && (!type || item.type === type));
  if (!record || !record.file) throw new MediaError(`${label} not found`, 404);

  const asset = await getCertificateAsset(record.file);
  if (!asset || !ALLOWED_MIME.has(asset.mimeType)) throw new MediaError(`${label} file not found`, 404);

  if (dataMode === 'supabase') {
    const publicUrl = asset.bucket === 'media-public' && /^https?:\/\//i.test(asset.path)
      ? asset.path
      : await createSignedCertificateUrl(asset);
    return NextResponse.redirect(publicUrl, 302);
  }

  const bytes = await readFile(localObjectPath(asset));
  const filename = (asset.filename || record.title || label.toLowerCase())
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    status: 200,
  });
}
