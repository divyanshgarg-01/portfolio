import 'server-only';
import type { DbAdapter } from './interface';
import { localAdapter } from './local';
import { resolveDataMode } from './mode';
import { createSupabaseAdapter, createPublicSupabaseClient } from './supabase';
import { createSupabaseServerClient } from '../supabase-server';

export const dataMode = resolveDataMode(process.env as NodeJS.ProcessEnv);

/**
 * Least-privilege database access for public server rendering.
 * In Supabase mode this uses the anon key, so RLS is the final guard against
 * draft or deleted content leaking to anonymous visitors.
 */
export function getPublicDb(): DbAdapter {
  if (dataMode === 'local') return localAdapter;
  return createSupabaseAdapter(createPublicSupabaseClient());
}

/**
 * Database access for authenticated admin operations.
 * In Supabase mode the client is bound to the signed-in user's cookies, so
 * owner/editor/viewer permissions are enforced by Postgres RLS.
 */
export async function getAdminDb(): Promise<DbAdapter> {
  if (dataMode === 'local') return localAdapter;
  return createSupabaseAdapter(await createSupabaseServerClient());
}

export { resolveDataMode } from './mode';
export type { DataMode } from './mode';
export { createSupabaseAdapter, createPublicSupabaseClient };
