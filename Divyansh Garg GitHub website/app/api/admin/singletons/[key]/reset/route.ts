import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { defaultAbout, defaultSettings } from '@/lib/defaults';
import { getAdminDb } from '@/lib/db';

interface Context {
  params: Promise<{ key: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(['owner']);
    const key = (await context.params).key;
    if (key !== 'about' && key !== 'settings') {
      return NextResponse.json({ error: 'Unknown setting' }, { status: 404 });
    }
    const defaults = key === 'settings' ? defaultSettings : defaultAbout;
    const db = await getAdminDb();
    const item = await db.updateSingleton(key, { ...defaults, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>);
    await db.logActivity({ actor: user.email, action: `${key}.reset`, entityType: key, entityId: key, metadata: '{}' });
    revalidatePath('/');
    return NextResponse.json({ item });
  } catch (error) {
    return apiError(error);
  }
}
