import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Narrowly scoped service-role entry point.
 *
 * This module is server-only by convention and by the `server-only` import.
 * It must never be imported from a client component or from public rendering
 * code. Every caller must verify the signed-in user and role before use.
 */
export function createServiceSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials are not configured');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
