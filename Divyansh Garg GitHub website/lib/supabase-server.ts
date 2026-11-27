import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase credentials are not configured');
  }
  return { url, anonKey };
}

/**
 * Authenticated Supabase client bound to the current request cookies.
 * All admin database operations use this client so Postgres RLS sees the
 * real signed-in user instead of a privileged service role.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; middleware refreshes them.
        }
      },
    },
  });
}
