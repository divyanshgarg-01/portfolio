import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import { getMediaUsageMap } from '@/lib/media-usage';
import { MediaError, processUpload } from '@/lib/media';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';

export async function GET() {
  try {
    await requireUser(['owner', 'editor', 'viewer']);
    const db = await getAdminDb();
    const [items, usage] = await Promise.all([db.listMedia(), getMediaUsageMap(db)]);
    return NextResponse.json({ items, usage });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner', 'editor']);
    const limit = await consumeRateLimit(`upload:${clientIdentity(request.headers)}`, 30, 60 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: 'Upload limit reached. Try again later.' }, { status: 429 });
    const form = await request.formData();
    const file = form.get('file');
    const folder = String(form.get('folder') ?? 'misc');
    if (!(file instanceof File)) throw new MediaError('No file was uploaded');
    const asset = await processUpload(file, folder, user);
    const db = await getAdminDb();
    await db.logActivity({ actor: user.email, action: 'media.upload', entityType: 'media', entityId: asset.id, metadata: JSON.stringify({ filename: asset.filename }) });
    return NextResponse.json({ item: asset }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
