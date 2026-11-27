import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { collectionMap } from '@/lib/admin-config';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import { collectionKeySchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner', 'editor']);
    const body = await readJson(request);
    const parsed = collectionKeySchema.safeParse(body.collection);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!parsed.success || !Object.hasOwn(collectionMap, parsed.data) || ids.length === 0) {
      return NextResponse.json({ error: 'Invalid reorder request' }, { status: 400 });
    }
    const collection = parsed.data;
    const db = await getAdminDb();

    if (user.role !== 'owner') {
      for (const id of ids) {
        const item = await db.getEntity<{ visibility: string }>(collection, id);
        if (!item || item.visibility !== 'draft') {
          return NextResponse.json({ error: 'Editors can only reorder draft records' }, { status: 403 });
        }
      }
    }

    await db.reorderEntities(collection, ids);
    await db.logActivity({ actor: user.email, action: `${collection}.reorder`, entityType: collection, entityId: '', metadata: JSON.stringify({ count: ids.length }) });
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
