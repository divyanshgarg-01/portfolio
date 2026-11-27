import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { dataMode } from '@/lib/db';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/** Requests the Supabase Auth nonce required by Secure password change. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser();
    const limit = await consumeRateLimit(
      `password-reauth:${clientIdentity(request.headers)}`,
      5,
      15 * 60 * 1000,
    );
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    if (dataMode !== 'supabase') {
      return NextResponse.json({ error: 'Verification codes are only used in hosted mode' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.reauthenticate();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: 'Verification code sent. Enter it below.' });
  } catch (error) {
    return apiError(error);
  }
}
