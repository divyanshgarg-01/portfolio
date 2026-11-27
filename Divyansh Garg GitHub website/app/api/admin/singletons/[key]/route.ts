import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import { validateSingleton } from '@/lib/validation';

interface Context {
  params: Promise<{ key: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser(['owner', 'editor', 'viewer']);
    const key = (await context.params).key;
    if (key !== 'about' && key !== 'settings') return NextResponse.json({ error: 'Unknown setting' }, { status: 404 });
    const data = await (await getAdminDb()).getSingleton(key);
    return NextResponse.json({ item: data });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner', 'editor']);
    const key = (await context.params).key;
    if (key !== 'about' && key !== 'settings') return NextResponse.json({ error: 'Unknown setting' }, { status: 404 });
    // Site-wide singletons are owner-managed in both the application and SQL.
    await requireUser(['owner']);
    const body = await readJson(request);
    const validation = validateSingleton(key, body);
    if (!validation.success) return NextResponse.json({ errors: validation.errors }, { status: 400 });
    const db = await getAdminDb();
    const data = await db.updateSingleton(key, validation.data as Record<string, unknown>);
    await db.logActivity({ actor: user.email, action: `${key}.update`, entityType: key, entityId: key, metadata: '{}' });
    revalidatePath('/');
    return NextResponse.json({ item: data });
  } catch (error) {
    return apiError(error);
  }
}
