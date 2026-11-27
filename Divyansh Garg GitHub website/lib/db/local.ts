import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  defaultAbout,
  defaultSettings,
  seedAchievements,
  seedEducation,
  seedExperience,
  seedProjects,
  seedSkillCategories,
  seedSkills,
  seedSocials,
} from '../defaults';
import { hashPassword } from '../password';
import type { ActivityEntry, CollectionKey, MediaAsset, SessionUser, UserRole } from '../types';
import type { DbAdapter, ManagedUser, StoredUser } from './interface';

interface EntityRow {
  data: string;
  order_index: number;
  visibility: string;
  featured: number;
  deleted_at: string | null;
}

interface MediaRow { data: string }
interface ActivityRow { data: string }

function normaliseMedia(asset: MediaAsset): MediaAsset {
  return { ...asset, bucket: asset.bucket ?? 'media-public' };
}
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: StoredUser['role'];
  password_hash: string;
  active?: number;
  mfa_enabled?: number;
}
interface SessionRow { user_id: string; expires_at: number }

declare global {
  // eslint-disable-next-line no-var
  var __dgLocalDb: DatabaseSync | undefined;
}

function getDb(): DatabaseSync {
  if (globalThis.__dgLocalDb) return globalThis.__dgLocalDb;
  const dir = join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'portfolio.db'));
  // The dev server, E2E server and one-off scripts can share this file.
  // WAL keeps readers from blocking writers; busy_timeout absorbs short races.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'draft',
      featured INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_entities_public
      ON entities(collection, visibility, deleted_at, order_index);
    CREATE TABLE IF NOT EXISTS singletons (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preview_tokens (
      token_hash TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all() as unknown as Array<{ name: string }>;
  const hasUserColumn = (name: string): boolean => userColumns.some((column) => column.name === name);
  if (!hasUserColumn('active')) db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  if (!hasUserColumn('mfa_enabled')) db.exec('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0');

  const now = new Date().toISOString();
  const settingsExists = db.prepare('SELECT 1 FROM singletons WHERE key = ?').get('settings');
  if (!settingsExists) db.prepare('INSERT INTO singletons (key, data, updated_at) VALUES (?, ?, ?)').run('settings', JSON.stringify(defaultSettings), now);
  const aboutExists = db.prepare('SELECT 1 FROM singletons WHERE key = ?').get('about');
  if (!aboutExists) db.prepare('INSERT INTO singletons (key, data, updated_at) VALUES (?, ?, ?)').run('about', JSON.stringify(defaultAbout), now);

  const ownerEmail = process.env.ADMIN_EMAIL;
  const ownerPassword = process.env.ADMIN_PASSWORD;
  if (ownerEmail && ownerPassword) {
    const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(ownerEmail.toLowerCase());
    if (!existing) {
      db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        randomUUID(),
        ownerEmail.toLowerCase(),
        'Divyansh Garg',
        'owner',
        hashPassword(ownerPassword),
        now,
      );
    }
  }

  const entityCount = db.prepare('SELECT COUNT(*) AS count FROM entities').get() as { count: number };
  if (entityCount.count === 0) {
    const insert = db.prepare(`INSERT OR IGNORE INTO entities
      (collection, id, data, order_index, visibility, featured, deleted_at, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`);
    const seedGroups: Array<[CollectionKey, Array<Record<string, unknown>>]> = [
      ['projects', seedProjects as unknown as Array<Record<string, unknown>>],
      ['experience', seedExperience as unknown as Array<Record<string, unknown>>],
      ['education', seedEducation as unknown as Array<Record<string, unknown>>],
      ['skill_categories', seedSkillCategories as unknown as Array<Record<string, unknown>>],
      ['skills', seedSkills as unknown as Array<Record<string, unknown>>],
      ['achievements', seedAchievements as unknown as Array<Record<string, unknown>>],
      ['social_links', seedSocials as unknown as Array<Record<string, unknown>>],
    ];
    for (const [collection, rows] of seedGroups) {
      for (const [index, row] of rows.entries()) {
        const source = row as Record<string, unknown>;
        const entity = {
          ...source,
          id: String(source.id ?? randomUUID()),
          visibility: 'published',
          order: Number(source.order ?? index + 1),
          featured: Boolean(source.featured),
          createdAt: now,
          updatedAt: now,
          publishedAt: now,
          deletedAt: null,
        };
        insert.run(collection, entity.id, JSON.stringify(entity), entity.order, entity.visibility, entity.featured ? 1 : 0, now, now, now);
      }
    }
  }

  globalThis.__dgLocalDb = db;
  return db;
}

function parseEntity<T>(row: EntityRow): T {
  return JSON.parse(row.data) as T;
}

export const localAdapter: DbAdapter = {
  async listEntities<T>(collection: CollectionKey, includeDrafts = false): Promise<T[]> {
    const db = getDb();
    const sql = includeDrafts
      ? 'SELECT data FROM entities WHERE collection = ? AND deleted_at IS NULL ORDER BY order_index ASC'
      : "SELECT data FROM entities WHERE collection = ? AND deleted_at IS NULL AND visibility = 'published' ORDER BY order_index ASC";
    return (db.prepare(sql).all(collection) as unknown as EntityRow[]).map((row) => parseEntity<T>(row));
  },

  async getEntity<T>(collection: CollectionKey, id: string): Promise<T | null> {
    const row = getDb().prepare('SELECT data FROM entities WHERE collection = ? AND id = ? AND deleted_at IS NULL').get(collection, id) as unknown as EntityRow | null;
    return row ? parseEntity<T>(row) : null;
  },

  async createEntity<T>(collection: CollectionKey, input: Record<string, unknown>): Promise<T> {
    const db = getDb();
    const now = new Date().toISOString();
    const id = String(input.id ?? randomUUID());
    const visibility = String(input.visibility ?? 'draft') as 'draft' | 'published' | 'unpublished';
    const order = Number(input.order ?? 999);
    const featured = Boolean(input.featured);
    const entity = {
      ...input,
      id,
      visibility,
      order,
      featured,
      createdAt: now,
      updatedAt: now,
      publishedAt: visibility === 'published' ? now : null,
      deletedAt: null,
    };
    db.prepare(`INSERT INTO entities
      (collection, id, data, order_index, visibility, featured, deleted_at, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .run(collection, id, JSON.stringify(entity), order, visibility, featured ? 1 : 0, now, now, entity.publishedAt);
    return entity as T;
  },

  async updateEntity<T>(collection: CollectionKey, id: string, patch: Record<string, unknown>): Promise<T> {
    const db = getDb();
    const existing = await this.getEntity<Record<string, unknown>>(collection, id);
    if (!existing) throw new Error('Record not found');
    const now = new Date().toISOString();
    const visibility = String(patch.visibility ?? existing.visibility ?? 'draft') as 'draft' | 'published' | 'unpublished';
    const order = Number(patch.order ?? existing.order ?? 999);
    const featured = Boolean(patch.featured ?? existing.featured);
    const publishedAt = visibility === 'published' && !existing.publishedAt ? now : (existing.publishedAt as string | null) ?? null;
    const entity = {
      ...existing,
      ...patch,
      id,
      visibility,
      order,
      featured,
      publishedAt,
      updatedAt: now,
      deletedAt: null,
    };
    db.prepare(`UPDATE entities SET data = ?, order_index = ?, visibility = ?, featured = ?, updated_at = ?, published_at = ?
      WHERE collection = ? AND id = ?`)
      .run(JSON.stringify(entity), order, visibility, featured ? 1 : 0, now, publishedAt, collection, id);
    return entity as T;
  },

  async deleteEntity(collection: CollectionKey, id: string): Promise<void> {
    getDb().prepare('UPDATE entities SET deleted_at = ?, data = ? WHERE collection = ? AND id = ?')
      .run(new Date().toISOString(), JSON.stringify({ deleted: true }), collection, id);
  },

  async reorderEntities(collection: CollectionKey, ids: string[]): Promise<void> {
    const db = getDb();
    db.exec('BEGIN');
    try {
      const update = db.prepare('UPDATE entities SET order_index = ?, data = ? WHERE collection = ? AND id = ?');
      ids.forEach((id, index) => {
        const row = db.prepare('SELECT data FROM entities WHERE collection = ? AND id = ?').get(collection, id) as unknown as EntityRow | null;
        if (!row) return;
        const data = JSON.parse(row.data) as Record<string, unknown>;
        data.order = index + 1;
        update.run(index + 1, JSON.stringify(data), collection, id);
      });
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },

  async getSingleton<T>(key: 'settings' | 'about'): Promise<T> {
    const row = getDb().prepare('SELECT data FROM singletons WHERE key = ?').get(key) as unknown as MediaRow | null;
    if (!row) throw new Error(`Missing singleton: ${key}`);
    return JSON.parse(row.data) as T;
  },

  async updateSingleton<T>(key: 'settings' | 'about', data: Record<string, unknown>): Promise<T> {
    const now = new Date().toISOString();
    const merged = { ...data, updatedAt: now };
    getDb().prepare('UPDATE singletons SET data = ?, updated_at = ? WHERE key = ?').run(JSON.stringify(merged), now, key);
    return merged as T;
  },

  async listMedia(): Promise<MediaAsset[]> {
    return (getDb().prepare('SELECT data FROM media ORDER BY created_at DESC').all() as unknown as MediaRow[])
      .map((row) => normaliseMedia(JSON.parse(row.data) as MediaAsset));
  },

  async getMedia(id: string): Promise<MediaAsset | null> {
    const row = getDb().prepare('SELECT data FROM media WHERE id = ?').get(id) as unknown as MediaRow | null;
    return row ? normaliseMedia(JSON.parse(row.data) as MediaAsset) : null;
  },

  async createMedia(input: Omit<MediaAsset, 'createdAt'>): Promise<MediaAsset> {
    const asset: MediaAsset = { ...input, bucket: input.bucket ?? 'media-public', createdAt: new Date().toISOString() };
    getDb().prepare('INSERT INTO media (id, data, created_at) VALUES (?, ?, ?)').run(asset.id, JSON.stringify(asset), asset.createdAt);
    return asset;
  },

  async updateMedia(id: string, patch: Partial<MediaAsset>): Promise<MediaAsset> {
    const existing = await this.getMedia(id);
    if (!existing) throw new Error('Media not found');
    const asset = { ...existing, ...patch, id };
    getDb().prepare('UPDATE media SET data = ? WHERE id = ?').run(JSON.stringify(asset), id);
    return asset;
  },

  async deleteMedia(id: string): Promise<void> {
    getDb().prepare('DELETE FROM media WHERE id = ?').run(id);
  },

  async logActivity(input: Omit<ActivityEntry, 'id' | 'createdAt'>): Promise<void> {
    const entry: ActivityEntry = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    getDb().prepare('INSERT INTO activity (id, data, created_at) VALUES (?, ?, ?)').run(entry.id, JSON.stringify(entry), entry.createdAt);
  },

  async listActivity(limit = 20): Promise<ActivityEntry[]> {
    return (getDb().prepare('SELECT data FROM activity ORDER BY created_at DESC LIMIT ?').all(limit) as unknown as ActivityRow[])
      .map((row) => JSON.parse(row.data) as ActivityEntry);
  },

  async createPreviewToken(tokenHash: string, payload: { collection: string; id: string }, ttlSeconds: number): Promise<void> {
    getDb().prepare('INSERT INTO preview_tokens (token_hash, data, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, JSON.stringify(payload), Date.now() + ttlSeconds * 1000);
  },

  async getPreviewToken(tokenHash: string): Promise<{ collection: string; id: string } | null> {
    const row = getDb().prepare('SELECT data, expires_at FROM preview_tokens WHERE token_hash = ?').get(tokenHash) as { data: string; expires_at: number } | null;
    if (!row || row.expires_at < Date.now()) return null;
    return JSON.parse(row.data) as { collection: string; id: string };
  },

  async consumePreviewToken(tokenHash: string): Promise<{ collection: string; id: string } | null> {
    const row = getDb().prepare(
      'DELETE FROM preview_tokens WHERE token_hash = ? AND expires_at >= ? RETURNING data',
    ).get(tokenHash, Date.now()) as { data: string } | null;
    return row ? (JSON.parse(row.data) as { collection: string; id: string }) : null;
  },

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const row = getDb().prepare('SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?').get(email.toLowerCase()) as unknown as UserRow | null;
    if (!row || row.active === 0) return null;
    return { id: row.id, email: row.email, name: row.name, role: row.role, passwordHash: row.password_hash };
  },

  async seedOwner(email: string, passwordHash: string, name: string): Promise<void> {
    getDb().prepare('INSERT OR IGNORE INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), email.toLowerCase(), name, 'owner', passwordHash, new Date().toISOString());
  },

  async createSession(sessionId: string, userId: string, expiresAt: number): Promise<void> {
    getDb().prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, userId, expiresAt, new Date().toISOString());
  },

  async getSessionUser(sessionId: string): Promise<SessionUser | null> {
    const row = getDb().prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(sessionId) as unknown as SessionRow | null;
    if (!row || row.expires_at < Date.now()) return null;
    const userRow = getDb().prepare('SELECT id, email, name, role, active FROM users WHERE id = ?').get(row.user_id) as unknown as Omit<UserRow, 'password_hash'> | null;
    if (!userRow || userRow.active === 0) return null;
    return { id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role };
  },

  async deleteSession(sessionId: string): Promise<void> {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  },

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  },

  async deleteSessionsForUser(userId: string): Promise<void> {
    getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  async listUsers(): Promise<ManagedUser[]> {
    const rows = getDb().prepare(
      'SELECT id, email, name, role, active, mfa_enabled, created_at FROM users ORDER BY created_at ASC',
    ).all() as unknown as Array<UserRow & { created_at: string }>;
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      active: row.active !== 0,
      mfaEnrolled: row.mfa_enabled === 1,
      createdAt: row.created_at,
    }));
  },

  async createUser(input: { email: string; name: string; role: UserRole; password?: string }): Promise<ManagedUser> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const password = input.password || randomUUID();
    getDb().prepare(
      'INSERT INTO users (id, email, name, role, password_hash, active, mfa_enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?)',
    ).run(id, input.email.toLowerCase(), input.name, input.role, hashPassword(password), createdAt);
    return { id, email: input.email.toLowerCase(), name: input.name, role: input.role, active: true, mfaEnrolled: false, createdAt };
  },

  async updateUser(id: string, patch: { role?: UserRole; active?: boolean; name?: string }): Promise<ManagedUser> {
    const existing = getDb().prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!existing) throw new Error('User not found');
    if (patch.active === false) {
      const current = getDb().prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: UserRole };
      if (current.role === 'owner') {
        const owners = getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1").get() as { count: number };
        if (owners.count <= 1) throw new Error('At least one active owner is required');
      }
    }
    const assignments: string[] = [];
    const values: Array<string | number> = [];
    if (patch.role) {
      assignments.push('role = ?');
      values.push(patch.role);
    }
    if (patch.active !== undefined) {
      assignments.push('active = ?');
      values.push(patch.active ? 1 : 0);
    }
    if (patch.name !== undefined) {
      assignments.push('name = ?');
      values.push(patch.name);
    }
    if (assignments.length > 0) {
      values.push(id);
      getDb().prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    }
    if (patch.active === false) await this.deleteSessionsForUser(id);
    const row = getDb().prepare(
      'SELECT id, email, name, role, active, mfa_enabled, created_at FROM users WHERE id = ?',
    ).get(id) as unknown as UserRow & { created_at: string };
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      active: row.active !== 0,
      mfaEnrolled: row.mfa_enabled === 1,
      createdAt: row.created_at,
    };
  },

  async deleteUser(id: string): Promise<void> {
    const current = getDb().prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: UserRole } | null;
    if (!current) throw new Error('User not found');
    if (current.role === 'owner') {
      const owners = getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'").get() as { count: number };
      if (owners.count <= 1) throw new Error('The last owner cannot be deleted');
    }
    await this.deleteSessionsForUser(id);
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  async setMfaEnrolled(id: string, enrolled: boolean): Promise<void> {
    getDb().prepare('UPDATE users SET mfa_enabled = ? WHERE id = ?').run(enrolled ? 1 : 0, id);
  },
};
