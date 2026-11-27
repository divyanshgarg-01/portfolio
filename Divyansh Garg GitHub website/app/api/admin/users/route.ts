import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';

const createSchema = z.object({
  email: z.string().trim().email('Enter a valid email').transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1).max(120),
  role: z.enum(['editor', 'viewer']),
  password: z.string().min(12, 'Temporary password must be at least 12 characters'),
});

export async function GET() {
  try {
    await requireUser(['owner']);
    const users = await (await getAdminDb()).listUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser(['owner']);
    const limit = await consumeRateLimit(`users:${clientIdentity(request.headers)}`, 20, 60 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many account changes. Try again later.' }, { status: 429 });
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    const db = await getAdminDb();
    const user = await db.createUser(parsed.data);
    await db.logActivity({
      actor: (await requireUser(['owner'])).email,
      action: 'users.create',
      entityType: 'users',
      entityId: user.id,
      metadata: JSON.stringify({ email: user.email, role: user.role }),
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
