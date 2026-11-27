import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { dataMode, getAdminDb } from './db';
import { createSupabaseServerClient } from './supabase-server';
import { verifyPassword } from './password';
import type { SessionUser, UserRole } from './types';

export const SESSION_COOKIE = 'dg_session';
const SESSION_MAX_AGE = 60 * 60 * 8;

export class AuthError extends Error {
  constructor(message: string, public status = 401, public code = 'auth_error') {
    super(message);
    this.name = 'AuthError';
  }
}

export interface RequireUserOptions {
  /** Allows MFA enrollment/verification endpoints to run before AAL2. */
  allowMfaPending?: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const db = await getAdminDb();
  const cookieStore = await cookies();

  if (dataMode === 'supabase') {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const email = data.user.email ?? '';
    const profile = await db.findUserByEmail(email);
    if (!profile) return null;

    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const aal = assurance?.currentLevel ?? 'aal1';
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp ?? []).find((factor) => factor.status === 'verified');
    const mfaRequired = profile.role === 'owner' && (!verified || aal !== 'aal2');

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      mfaRequired,
      aal,
      factorId: verified?.id,
    };
  }

  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  return sessionId ? db.getSessionUser(sessionId) : null;
}

export async function requireUser(
  roles?: UserRole[],
  options: RequireUserOptions = {},
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('Authentication required', 401);
  if (roles && !roles.includes(user.role)) throw new AuthError('Insufficient permissions', 403);

  // Owner operations require a verified second factor in Supabase mode. The
  // profile.mfa_enabled boolean is never trusted as proof of MFA.
  if (
    dataMode === 'supabase'
    && user.role === 'owner'
    && user.mfaRequired
    && !options.allowMfaPending
  ) {
    throw new AuthError('MFA verification required', 403, 'mfa_required');
  }

  return user;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const normalisedEmail = email.trim().toLowerCase();
  const db = await getAdminDb();

  if (dataMode === 'supabase') {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: normalisedEmail, password });
    if (error) throw new AuthError('Invalid email or password', 401);
    const user = await getSessionUser();
    if (!user) throw new AuthError('Could not load account', 401);
    return user;
  }

  const user = await db.findUserByEmail(normalisedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new AuthError('Invalid email or password', 401);
  }
  const sessionId = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  await db.createSession(sessionId, user.id, Date.now() + SESSION_MAX_AGE * 1000);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    // The local adapter is exercised through a production build over plain
    // HTTP; a Secure cookie would be dropped and every authenticated API call
    // would appear signed out. Real deployments use HTTPS.
    secure: process.env.NODE_ENV === 'production' && dataMode !== 'local',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  if (dataMode === 'supabase') {
    await (await createSupabaseServerClient()).auth.signOut();
  } else {
    const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
    if (sessionId) await (await getAdminDb()).deleteSession(sessionId);
    cookieStore.delete(SESSION_COOKIE);
  }
}

export function can(role: UserRole, action: 'edit' | 'publish' | 'settings' | 'users' | 'media-delete'): boolean {
  if (role === 'owner') return true;
  if (role === 'editor') return action === 'edit';
  return false;
}
