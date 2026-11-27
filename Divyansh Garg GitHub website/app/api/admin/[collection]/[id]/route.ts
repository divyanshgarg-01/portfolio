import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { collectionMap } from '@/lib/admin-config';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import type { CollectionKey } from '@/lib/types';
import { validateFields } from '@/lib/validation';

interface Context {
  params: Promise<{ collection: string; id: string }>;
}

function resolveCollection(key: string): CollectionKey | null {
  return Object.hasOwn(collectionMap, key) ? (key as CollectionKey) : null;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser(['owner', 'editor', 'viewer']);
    const collection = resolveCollection((await context.params).collection);
    if (!collection) return NextResponse.json({ error: 'Unknown collection' }, { status: 404 });
    const item = await (await getAdminDb()).getEntity(collection, (await context.params).id);
    if (!item) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner', 'editor']);
    const { collection: key, id } = await context.params;
    const collection = resolveCollection(key);
    if (!collection) return NextResponse.json({ error: 'Unknown collection' }, { status: 404 });
    const config = collectionMap[collection];
    const db = await getAdminDb();
    const existing = await db.getEntity<Record<string, unknown>>(collection, id);
    if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    // Editors may edit drafts only. They cannot alter live content, publish,
    // unpublish or soft-delete it through direct API calls.
    if (user.role === 'editor' && existing.visibility !== 'draft') {
      return NextResponse.json({ error: 'Editors can only edit draft records' }, { status: 403 });
    }

    const body = await readJson(request);
    if (body.visibility !== undefined && String(body.visibility) !== String(existing.visibility)) {
      await requireUser(['owner']);
    }
    const validation = validateFields(config.fields, { ...existing, ...body }, collection);
    if (!validation.success) return NextResponse.json({ errors: validation.errors }, { status: 400 });
    const data = validation.data as Record<string, unknown>;
    if (user.role === 'editor' && data.visibility !== 'draft') {
      return NextResponse.json({ error: 'Editors can only save drafts' }, { status: 403 });
    }

    if (collection === 'projects' && data.featured && data.visibility === 'published') {
      const published = await db.listEntities<{ id: string; featured: boolean }>('projects');
      if (published.filter((item) => item.featured && item.id !== id).length >= 3) {
        return NextResponse.json({ errors: { featured: 'Maximum three published featured projects' } }, { status: 400 });
      }
    }

    const updated = await db.updateEntity(collection, id, data);
    await db.logActivity({ actor: user.email, action: `${collection}.update`, entityType: collection, entityId: id, metadata: JSON.stringify({ title: data[config.titleField] }) });
    revalidatePath('/');
    return NextResponse.json({ item: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner']);
    const { collection: key, id } = await context.params;
    const collection = resolveCollection(key);
    if (!collection) return NextResponse.json({ error: 'Unknown collection' }, { status: 404 });
    const db = await getAdminDb();
    const existing = await db.getEntity<Record<string, unknown>>(collection, id);
    if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    await db.deleteEntity(collection, id);
    await db.logActivity({ actor: user.email, action: `${collection}.delete`, entityType: collection, entityId: id, metadata: JSON.stringify({ title: existing[collectionMap[collection].titleField] }) });
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
