import { NextResponse } from 'next/server';
import { apiError, assertSameOrigin, readJson } from '@/lib/api';
import { login } from '@/lib/auth';
import { clientIdentity, consumeRateLimit } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email and password' }, { status: 400 });
    const attempt = await consumeRateLimit(
      `login:${clientIdentity(request.headers)}`,
      8,
      15 * 60 * 1000,
    );
    if (!attempt.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });

    const user = await login(parsed.data.email, parsed.data.password);
    if (user.mfaRequired) {
      return NextResponse.json({
        mfaRequired: true,
        factorId: user.factorId ?? null,
        message: user.factorId
          ? 'Enter your authenticator code to continue.'
          : 'Set up an authenticator app to continue.',
      });
    }
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
