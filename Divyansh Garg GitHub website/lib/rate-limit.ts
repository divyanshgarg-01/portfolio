import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from './service-supabase';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimitOptions {
  mode?: 'local' | 'supabase';
  client?: Pick<SupabaseClient, 'rpc'>;
}

const buckets = new Map<string, Bucket>();

function localConsume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1) };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) };
}

/**
 * Atomic, distributed rate limiting in Supabase mode. Local mode keeps the
 * simple in-process limiter for development and E2E only.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const mode = options.mode ?? (process.env.DATA_MODE === 'supabase' ? 'supabase' : 'local');

  if (mode === 'local') return localConsume(key, limit, windowMs);

  const client = options.client ?? createServiceSupabaseClient();
  const { data, error } = await client.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  const allowed = data === true;
  return { allowed, remaining: allowed ? Math.max(0, limit - 1) : 0 };
}

/** Trusted platform headers only; never trust arbitrary x-forwarded-for. */
export function clientIdentity(headers: Headers): string {
  const value = headers.get('x-vercel-forwarded-for')
    ?? headers.get('x-real-ip')
    ?? headers.get('cf-connecting-ip')
    ?? 'unknown';
  const ip = value.split(',')[0].trim() || 'unknown';
  const secret = process.env.SESSION_SECRET ?? '';
  return `${ip}:${secret.length > 0 ? secret.slice(0, 8) : 'local'}`;
}
