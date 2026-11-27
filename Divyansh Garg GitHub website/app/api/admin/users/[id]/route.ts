import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';

interface Context {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['editor', 'viewer']).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const admin = await requireUser(['owner']);
    const id = (await context.params).id;
    if (admin.id === id) return NextResponse.json({ error: 'You cannot change your own role or status here' }, { status: 400 });
    const parsed = updateSchema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });

    const db = await getAdminDb();
    const user = await db.updateUser(id, parsed.data);
    await db.logActivity({ actor: admin.email, action: 'users.update', entityType: 'users', entityId: id, metadata: JSON.stringify(parsed.data) });
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const admin = await requireUser(['owner']);
    const id = (await context.params).id;
    if (admin.id === id) return NextResponse.json({ error: 'You cannot delete your own account here' }, { status: 400 });
    const db = await getAdminDb();
    await db.deleteUser(id);
    await db.logActivity({ actor: admin.email, action: 'users.delete', entityType: 'users', entityId: id, metadata: '{}' });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
