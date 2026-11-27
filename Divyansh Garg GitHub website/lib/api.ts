import { NextResponse } from 'next/server';
import { AuthError } from './auth';
import { MediaError } from './media';

export function apiError(error: unknown): NextResponse {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof MediaError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
}

export async function readJson<T extends Record<string, unknown>>(request: Request): Promise<T> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new Error('Invalid JSON body');
  return body as T;
}

/** Rejects cross-site state-changing requests using browser Origin/Referer headers. */
export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return;

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  if (!origin && !referer) throw new AuthError('Origin check failed', 403);

  // Compare the browser origin to the request host, as recommended for CSRF
  // checks. The Host header is the target the browser actually contacted;
  // client-supplied forwarded headers must not widen the allowlist. Scheme is
  // intentionally not compared because a TLS-terminating proxy can present an
  // HTTPS origin to a server that sees an internal HTTP request URL.
  const allowedHosts = new Set<string>();
  const addHost = (value: string | null) => {
    if (!value) return;
    try {
      const host = new URL(value.includes('://') ? value : `http://${value}`).host.toLowerCase();
      allowedHosts.add(host);
    } catch {
      // Malformed headers and configured values are ignored rather than trusted.
    }
  };
  addHost(request.url);
  addHost(request.headers.get('host'));
  addHost(process.env.NEXT_PUBLIC_SITE_URL ?? null);

  for (const value of [origin, referer]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AuthError('Origin check failed', 403);
      if (!allowedHosts.has(url.host.toLowerCase())) throw new AuthError('Origin check failed', 403);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Origin check failed', 403);
    }
  }
}
