import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const admin = await requireUser(['owner']);
    const id = (await context.params).id;
    if (admin.id === id) return NextResponse.json({ error: 'Use sign out for your own session' }, { status: 400 });
    const db = await getAdminDb();
    await db.deleteSessionsForUser(id);
    // In Supabase mode local sessions do not exist; deactivating the user bans
    // refresh-token use and is the supported server-side revocation path.
    if (id !== admin.id) await db.updateUser(id, { active: false });
    await db.logActivity({ actor: admin.email, action: 'users.revoke_sessions', entityType: 'users', entityId: id, metadata: '{}' });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
