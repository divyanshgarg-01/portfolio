import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/api';
import { logout } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await logout();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
