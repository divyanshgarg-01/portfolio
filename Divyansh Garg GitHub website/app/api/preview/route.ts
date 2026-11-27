import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';
import type { CollectionKey } from '@/lib/types';
import { previewTokenSchema } from '@/lib/validation';

const TTL_SECONDS = 30 * 60;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser(['owner', 'editor']);
    const limit = await consumeRateLimit(`preview:${clientIdentity(request.headers)}`, 20, 15 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many preview links. Try again later.' }, { status: 429 });

    const body = await readJson(request);
    const parsed = previewTokenSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid preview request' }, { status: 400 });

    const collection = parsed.data.collection as CollectionKey;
    const db = await getAdminDb();
    const entity = await db.getEntity(collection, parsed.data.id);
    if (!entity) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    await db.createPreviewToken(hash, parsed.data, TTL_SECONDS);
    return NextResponse.json({ url: `/preview/${token}` });
  } catch (error) {
    return apiError(error);
  }
}
