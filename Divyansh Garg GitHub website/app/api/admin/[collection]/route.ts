import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { collectionMap } from '@/lib/admin-config';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import type { CollectionKey } from '@/lib/types';
import { validateFields } from '@/lib/validation';

interface Context {
  params: Promise<{ collection: string }>;
}

function resolveCollection(key: string): CollectionKey | null {
  return Object.hasOwn(collectionMap, key) ? (key as CollectionKey) : null;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser(['owner', 'editor', 'viewer']);
    const collection = resolveCollection((await context.params).collection);
    if (!collection) return NextResponse.json({ error: 'Unknown collection' }, { status: 404 });
    const items = await (await getAdminDb()).listEntities(collection, true);
    return NextResponse.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner', 'editor']);
    const collection = resolveCollection((await context.params).collection);
    if (!collection) return NextResponse.json({ error: 'Unknown collection' }, { status: 404 });
    const config = collectionMap[collection];
    const body = await readJson(request);
    if (String(body.visibility ?? 'draft') !== 'draft' && user.role !== 'owner') {
      return NextResponse.json({ error: 'Editors can only create drafts' }, { status: 403 });
    }
    const validation = validateFields(config.fields, body, collection);
    if (!validation.success) return NextResponse.json({ errors: validation.errors }, { status: 400 });

    const data = validation.data as Record<string, unknown>;
    const db = await getAdminDb();
    if (collection === 'projects' && data.featured && data.visibility === 'published') {
      const published = await db.listEntities<{ featured: boolean }>('projects');
      if (published.filter((item) => item.featured).length >= 3) {
        return NextResponse.json({ errors: { featured: 'Maximum three published featured projects' } }, { status: 400 });
      }
    }

    const created = await db.createEntity(collection, data);
    await db.logActivity({ actor: user.email, action: `${collection}.create`, entityType: collection, entityId: String((created as { id: string }).id), metadata: JSON.stringify({ title: data[config.titleField] }) });
    revalidatePath('/');
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
