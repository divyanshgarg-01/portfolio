import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware is a UX redirect only. It never treats a cookie's name or
 * presence as proof of authentication: in hosted mode Supabase validates the
 * session, and in local mode the protected layout/API verify the SQLite
 * session on the server.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();

  if (process.env.DATA_MODE !== 'supabase') {
    // Do not decide authentication from cookie names here. Pass the requested
    // path to the protected layout, which verifies the real SQLite session.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-admin-next', pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/admin/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/admin/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
