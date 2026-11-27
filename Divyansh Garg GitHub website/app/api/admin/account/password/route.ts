import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { dataMode, getAdminDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const limit = await consumeRateLimit(`password:${clientIdentity(request.headers)}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });

    const body = await readJson(request);
    const current = String(body.currentPassword ?? '');
    const next = String(body.newPassword ?? '');
    const nonce = String(body.nonce ?? '').trim();
    if (!current) return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
    if (next.length < 12) return NextResponse.json({ error: 'New password must be at least 12 characters' }, { status: 400 });

    const db = await getAdminDb();
    if (dataMode === 'supabase') {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) throw new Error('Supabase credentials are not configured');

      // Verify the current password against Supabase Auth before changing it.
      // A temporary client is used so this check cannot replace the signed-in
      // session or its MFA assurance level.
      const verifier = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: verifyError } = await verifier.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (verifyError) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.updateUser({
        password: next,
        ...(nonce ? { nonce } : {}),
      });
      if (error) {
        if (/reauth|nonce|verification code/i.test(error.message)) {
          return NextResponse.json({
            error: 'Enter the verification code sent to your email to confirm this password change.',
            code: 'reauthentication_required',
          }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const stored = await db.findUserByEmail(user.email);
      if (!stored || !verifyPassword(current, stored.passwordHash)) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      }
      await db.updatePassword(user.id, hashPassword(next));
    }

    await db.logActivity({ actor: user.email, action: 'account.password_change', entityType: 'account', entityId: user.id, metadata: '{}' });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
