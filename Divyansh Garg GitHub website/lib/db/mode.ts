export type DataMode = 'local' | 'supabase';

export interface ModeEnvironment {
  DATA_MODE?: string;
  NODE_ENV?: string;
  DG_ALLOW_LOCAL_IN_PRODUCTION?: string;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Resolve persistence mode without ever failing open to SQLite.
 *
 * SQLite is explicitly opt-in for development and for the local production
 * build used by the E2E harness. A real production deployment must set
 * DATA_MODE=supabase. The harness-only override is named separately so it
 * cannot be confused with normal production configuration.
 */
export function resolveDataMode(env: ModeEnvironment): DataMode {
  const raw = (env.DATA_MODE ?? '').trim().toLowerCase();

  if (raw === 'supabase') return 'supabase';

  if (raw === 'local') {
    const isProduction = env.NODE_ENV === 'production';
    const harnessOverride = env.DG_ALLOW_LOCAL_IN_PRODUCTION === '1';
    if (isProduction && !harnessOverride) {
      throw new ConfigurationError(
        'DATA_MODE=local is not allowed in production. Set DATA_MODE=supabase and configure Supabase credentials.',
      );
    }
    return 'local';
  }

  if (!raw) {
    throw new ConfigurationError('DATA_MODE is required. Set it to "local" for development or "supabase" for hosted use.');
  }

  throw new ConfigurationError(
    `Invalid DATA_MODE "${raw}". Use exactly "local" or "supabase".`,
  );
}
