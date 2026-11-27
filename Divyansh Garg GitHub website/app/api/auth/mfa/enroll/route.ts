import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, assertSameOrigin } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { dataMode } from '@/lib/db';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser(undefined, { allowMfaPending: true });
    const limit = await consumeRateLimit(`mfa-enroll:${clientIdentity(request.headers)}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many enrollment attempts. Try again later.' }, { status: 429 });
    if (dataMode !== 'supabase') {
      return NextResponse.json({ error: 'MFA enrollment is only available in Supabase mode' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = z.object({ replace: z.boolean().optional() }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid enrollment request' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    if (!parsed.data.replace) {
      const { data: existing } = await supabase.auth.mfa.listFactors();
      if ((existing?.totp ?? []).some((factor) => factor.status === 'verified')) {
        return NextResponse.json({ error: 'A verified authenticator already exists' }, { status: 409 });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Portfolio CMS',
      issuer: 'Divyansh Garg Portfolio',
    });
    if (error || !data?.totp) {
      return NextResponse.json({ error: error?.message ?? 'Could not start MFA enrollment' }, { status: 400 });
    }

    // The TOTP secret is returned only to the authenticated owner's current
    // response. It is never logged or persisted by the application.
    return NextResponse.json({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  } catch (error) {
    return apiError(error);
  }
}
