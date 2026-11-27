import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { getSessionUser, requireUser } from '@/lib/auth';
import { dataMode, getAdminDb } from '@/lib/db';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const schema = z.object({
  factorId: z.string().uuid('Invalid authenticator'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser(undefined, { allowMfaPending: true });
    const limit = await consumeRateLimit(`mfa-verify:${clientIdentity(request.headers)}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    if (dataMode !== 'supabase') {
      return NextResponse.json({ error: 'MFA verification is only available in Supabase mode' }, { status: 400 });
    }

    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: parsed.data.factorId,
      code: parsed.data.code,
    });
    if (error) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });

    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'MFA verification did not complete' }, { status: 400 });
    }

    const user = await getSessionUser();
    if (user?.role === 'owner') await (await getAdminDb()).setMfaEnrolled(user.id, true);
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
