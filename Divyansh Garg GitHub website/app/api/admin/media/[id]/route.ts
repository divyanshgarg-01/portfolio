import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import { deleteUpload, MediaError, replaceUpload } from '@/lib/media';
import { getMediaUsageMap, referencesForAsset } from '@/lib/media-usage';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';

interface Context {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner', 'editor']);
    const limit = await consumeRateLimit(`replace:${clientIdentity(request.headers)}`, 30, 60 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: 'Upload limit reached. Try again later.' }, { status: 429 });
    const id = (await context.params).id;
    const form = await request.formData();
    const file = form.get('file');
    const altText = form.get('altText');
    const db = await getAdminDb();
    if (file instanceof File) {
      const asset = await replaceUpload(id, file, user);
      await db.logActivity({ actor: user.email, action: 'media.replace', entityType: 'media', entityId: id, metadata: '{}' });
      revalidatePath('/');
      return NextResponse.json({ item: asset });
    }
    if (typeof altText === 'string') {
      const asset = await db.updateMedia(id, { altText: altText.slice(0, 300) });
      await db.logActivity({ actor: user.email, action: 'media.update', entityType: 'media', entityId: id, metadata: JSON.stringify({ altText }) });
      return NextResponse.json({ item: asset });
    }
    throw new MediaError('Provide a file or alt text');
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner']);
    const id = (await context.params).id;
    const db = await getAdminDb();
    const asset = await db.getMedia(id);
    if (!asset) throw new MediaError('Media asset not found', 404);
    const references = referencesForAsset(asset, await getMediaUsageMap(db));
    if (references.length > 0) throw new MediaError(`This asset is used by ${references.length} content record(s) and cannot be deleted`, 409);
    await deleteUpload(id, db);
    await db.logActivity({ actor: user.email, action: 'media.delete', entityType: 'media', entityId: id, metadata: '{}' });
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
