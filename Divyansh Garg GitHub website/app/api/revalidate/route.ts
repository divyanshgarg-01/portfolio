import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export async function POST(request: Request) {
  const supplied = request.headers.get('x-revalidation-secret') ?? '';
  const expected = process.env.REVALIDATION_SECRET ?? '';
  const valid = expected.length > 0 && supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
