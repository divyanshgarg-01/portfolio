import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { dataMode } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    await requireUser(undefined, { allowMfaPending: true });
    if (dataMode !== 'supabase') return NextResponse.json({ factors: [] });
    const { data, error } = await (await createSupabaseServerClient()).auth.mfa.listFactors();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({
      factors: (data?.totp ?? []).map((factor) => ({
        id: factor.id,
        status: factor.status,
        friendlyName: factor.friendly_name ?? 'Authenticator',
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
