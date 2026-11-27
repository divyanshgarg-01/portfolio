import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { dataMode, getAdminDb } from '@/lib/db';
import { createSignedMediaUrl, localObjectPath, MediaError } from '@/lib/media';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** Authorized short-lived access to private media. Never public-cacheable. */
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser(['owner', 'editor', 'viewer']);
    const id = (await context.params).id;
    const asset = await (await getAdminDb()).getMedia(id);
    if (!asset) throw new MediaError('Media asset not found', 404);
    if (asset.bucket !== 'media-private' && asset.mimeType !== 'application/pdf') {
      throw new MediaError('This asset is public', 400);
    }

    if (dataMode === 'supabase') {
      const url = await createSignedMediaUrl(id, user);
      return NextResponse.redirect(url, 302);
    }

    const bytes = await readFile(localObjectPath(asset));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
