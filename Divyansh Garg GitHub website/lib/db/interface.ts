import type { ActivityEntry, CollectionKey, MediaAsset, SessionUser, UserRole } from '../types';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  mfaEnrolled: boolean;
  createdAt: string;
}

export interface DbAdapter {
  listEntities<T>(collection: CollectionKey, includeDrafts?: boolean): Promise<T[]>;
  getEntity<T>(collection: CollectionKey, id: string): Promise<T | null>;
  createEntity<T>(collection: CollectionKey, input: Record<string, unknown>): Promise<T>;
  updateEntity<T>(collection: CollectionKey, id: string, patch: Record<string, unknown>): Promise<T>;
  deleteEntity(collection: CollectionKey, id: string): Promise<void>;
  reorderEntities(collection: CollectionKey, ids: string[]): Promise<void>;
  getSingleton<T>(key: 'settings' | 'about'): Promise<T>;
  updateSingleton<T>(key: 'settings' | 'about', data: Record<string, unknown>): Promise<T>;
  listMedia(): Promise<MediaAsset[]>;
  getMedia(id: string): Promise<MediaAsset | null>;
  createMedia(input: Omit<MediaAsset, 'createdAt'>): Promise<MediaAsset>;
  updateMedia(id: string, patch: Partial<MediaAsset>): Promise<MediaAsset>;
  deleteMedia(id: string): Promise<void>;
  logActivity(input: Omit<ActivityEntry, 'id' | 'createdAt'>): Promise<void>;
  listActivity(limit?: number): Promise<ActivityEntry[]>;
  createPreviewToken(tokenHash: string, payload: { collection: string; id: string }, ttlSeconds: number): Promise<void>;
  getPreviewToken(tokenHash: string): Promise<{ collection: string; id: string } | null>;
  consumePreviewToken(tokenHash: string): Promise<{ collection: string; id: string } | null>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  seedOwner(email: string, passwordHash: string, name: string): Promise<void>;
  createSession(sessionId: string, userId: string, expiresAt: number): Promise<void>;
  getSessionUser(sessionId: string): Promise<SessionUser | null>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  listUsers(): Promise<ManagedUser[]>;
  createUser(input: { email: string; name: string; role: UserRole; password?: string }): Promise<ManagedUser>;
  updateUser(id: string, patch: { role?: UserRole; active?: boolean; name?: string }): Promise<ManagedUser>;
  deleteUser(id: string): Promise<void>;
  setMfaEnrolled(id: string, enrolled: boolean): Promise<void>;
}
