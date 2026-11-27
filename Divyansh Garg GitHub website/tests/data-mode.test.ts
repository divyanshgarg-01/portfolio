// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ConfigurationError, resolveDataMode } from '../lib/db/mode';

describe('resolveDataMode', () => {
  it('accepts only exact local and supabase values', () => {
    expect(resolveDataMode({ DATA_MODE: 'local', NODE_ENV: 'development' })).toBe('local');
    expect(resolveDataMode({ DATA_MODE: 'supabase', NODE_ENV: 'production' })).toBe('supabase');
    expect(resolveDataMode({ DATA_MODE: ' SUPABASE ', NODE_ENV: 'production' })).toBe('supabase');
  });

  it('fails closed when the variable is missing or unexpected', () => {
    expect(() => resolveDataMode({})).toThrow(ConfigurationError);
    expect(() => resolveDataMode({ DATA_MODE: '' })).toThrow(ConfigurationError);
    expect(() => resolveDataMode({ DATA_MODE: 'sqlite' })).toThrow(ConfigurationError);
    expect(() => resolveDataMode({ DATA_MODE: 'sqlite' })).toThrow(/exactly "local" or "supabase"/);
  });

  it('rejects local persistence in production without the harness opt-in', () => {
    expect(() => resolveDataMode({ DATA_MODE: 'local', NODE_ENV: 'production' }))
      .toThrow(/not allowed in production/);
    expect(resolveDataMode({
      DATA_MODE: 'local',
      NODE_ENV: 'production',
      DG_ALLOW_LOCAL_IN_PRODUCTION: '1',
    })).toBe('local');
    expect(() => resolveDataMode({
      DATA_MODE: 'local',
      NODE_ENV: 'production',
      DG_ALLOW_LOCAL_IN_PRODUCTION: 'true',
    })).toThrow(/not allowed in production/);
  });
});
