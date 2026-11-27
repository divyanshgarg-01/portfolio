// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIdentity, consumeRateLimit } from '../lib/rate-limit';

type RpcClient = Pick<SupabaseClient, 'rpc'>;

let keyCounter = 0;
const nextKey = (): string => `unit-test-key-${++keyCounter}`;
const local = (key: string, limit: number, windowMs: number) =>
  consumeRateLimit(key, limit, windowMs, { mode: 'local' });

describe('consumeRateLimit (local mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows calls up to the limit and blocks the next one', async () => {
    const key = nextKey();

    expect(await local(key, 2, 1000)).toEqual({ allowed: true, remaining: 1 });
    expect(await local(key, 2, 1000)).toEqual({ allowed: true, remaining: 0 });
    expect(await local(key, 2, 1000)).toEqual({ allowed: false, remaining: 0 });
  });

  it('resets once the full window has elapsed', async () => {
    const key = nextKey();
    const windowMs = 1000;

    expect(await local(key, 1, windowMs)).toEqual({ allowed: true, remaining: 0 });
    vi.advanceTimersByTime(windowMs - 1);
    expect((await local(key, 1, windowMs)).allowed).toBe(false);

    vi.advanceTimersByTime(1);
    expect(await local(key, 1, windowMs)).toEqual({ allowed: true, remaining: 0 });
  });

  it('tracks separate keys independently', async () => {
    const firstKey = nextKey();
    const secondKey = nextKey();

    expect(await local(firstKey, 1, 1000)).toEqual({ allowed: true, remaining: 0 });
    expect((await local(firstKey, 1, 1000)).allowed).toBe(false);
    expect(await local(secondKey, 1, 1000)).toEqual({ allowed: true, remaining: 0 });
  });
});

describe('consumeRateLimit (Supabase mode)', () => {
  it('uses the atomic RPC with whole-second windows', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as RpcClient;

    await expect(consumeRateLimit('login:1.2.3.4', 8, 15 * 60 * 1000 + 250, {
      mode: 'supabase',
      client,
    })).resolves.toEqual({ allowed: true, remaining: 7 });
    expect(rpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_key: 'login:1.2.3.4',
      p_limit: 8,
      p_window_seconds: 901,
    });
  });

  it('treats a false RPC result as blocked and surfaces errors', async () => {
    const blocked = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) } as unknown as RpcClient;
    await expect(consumeRateLimit('k', 1, 1000, { mode: 'supabase', client: blocked }))
      .resolves.toEqual({ allowed: false, remaining: 0 });

    const failed = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc down' } }) } as unknown as RpcClient;
    await expect(consumeRateLimit('k', 1, 1000, { mode: 'supabase', client: failed }))
      .rejects.toThrow('rpc down');
  });
});

describe('clientIdentity', () => {
  it('uses trusted proxy headers and ignores spoofed forwards', () => {
    const identity = clientIdentity(new Headers({
      'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1',
      'x-forwarded-for': '198.51.100.99',
    }));
    expect(identity.startsWith('203.0.113.9:')).toBe(true);
    expect(identity).not.toContain('198.51.100.99');
  });

  it('has a stable fallback when no trusted header is present', () => {
    expect(clientIdentity(new Headers())).toMatch(/^unknown:/);
  });
});
