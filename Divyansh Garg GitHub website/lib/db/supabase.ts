import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { defaultAbout, defaultSettings } from '../defaults';
import { createServiceSupabaseClient } from '../service-supabase';
import type { ActivityEntry, CollectionKey, MediaAsset, SessionUser, UserRole } from '../types';
import type { DbAdapter, ManagedUser, StoredUser } from './interface';
import { entityToRow, rowToEntity, tableFor } from './mappers';

type Client = SupabaseClient;

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface SingleResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Least-privilege client for unauthenticated public reads. RLS applies. */
export function createPublicSupabaseClient(): Client {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials are not configured');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unwrap<T>(result: QueryResult<T> | SingleResult<T>, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (Array.isArray(result.data)) return result.data as T;
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

export function createSupabaseAdapter(client: Client): DbAdapter {
  const from = (collection: CollectionKey) => client.from(tableFor(collection));

  return {
    async listEntities<T>(collection: CollectionKey, includeDrafts = false): Promise<T[]> {
      let query = from(collection).select('*').is('deleted_at', null);
      if (!includeDrafts) query = query.eq('visibility', 'published');
      const { data, error } = (await query.order('order_index', { ascending: true })) as QueryResult<Record<string, unknown>>;
      if (error) throw new Error(`List ${collection}: ${error.message}`);
      return (data ?? []).map((row) => rowToEntity<T>(row));
    },

    async getEntity<T>(collection: CollectionKey, id: string): Promise<T | null> {
      const { data, error } = (await from(collection).select('*').eq('id', id).is('deleted_at', null).maybeSingle()) as SingleResult<Record<string, unknown>>;
      if (error) throw new Error(`Get ${collection}: ${error.message}`);
      return data ? rowToEntity<T>(data) : null;
    },

    async createEntity<T>(collection: CollectionKey, input: Record<string, unknown>): Promise<T> {
      const now = new Date().toISOString();
      const row = {
        ...entityToRow(input),
        created_at: now,
        updated_at: now,
        published_at: input.visibility === 'published' ? now : null,
      };
      const data = unwrap<(Record<string, unknown>)>(await from(collection).insert(row).select('*').single() as SingleResult<Record<string, unknown>>, `Create ${collection}`);
      return rowToEntity<T>(data);
    },

    async updateEntity<T>(collection: CollectionKey, id: string, patch: Record<string, unknown>): Promise<T> {
      const row = entityToRow({ ...patch, updated_at: new Date().toISOString() });
      const data = unwrap<Record<string, unknown>>(await from(collection).update(row).eq('id', id).select('*').single() as SingleResult<Record<string, unknown>>, `Update ${collection}`);
      return rowToEntity<T>(data);
    },

    async deleteEntity(collection: CollectionKey, id: string): Promise<void> {
      const { error } = await from(collection).update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(`Delete ${collection}: ${error.message}`);
    },

    async reorderEntities(collection: CollectionKey, ids: string[]): Promise<void> {
      for (let index = 0; index < ids.length; index += 1) {
        const { error } = await from(collection).update({ order_index: index + 1 }).eq('id', ids[index]);
        if (error) throw new Error(`Reorder ${collection}: ${error.message}`);
      }
    },

    async getSingleton<T>(key: 'settings' | 'about'): Promise<T> {
      const { data, error } = (await client.from(key === 'settings' ? 'site_settings' : 'about').select('*').maybeSingle()) as SingleResult<Record<string, unknown>>;
      if (error) throw new Error(`Get ${key}: ${error.message}`);
      if (!data) return (key === 'settings' ? defaultSettings : defaultAbout) as T;
      return rowToEntity<T>(data);
    },

    async updateSingleton<T>(key: 'settings' | 'about', data: Record<string, unknown>): Promise<T> {
      const row = { ...entityToRow(data), updated_at: new Date().toISOString() };
      const table = key === 'settings' ? 'site_settings' : 'about';
      const { data: current } = (await client.from(table).select('id').maybeSingle()) as SingleResult<Record<string, unknown>>;
      const result = current
        ? await client.from(table).update(row).eq('id', current.id).select('*').single()
        : await client.from(table).insert(row).select('*').single();
      if (result.error) throw new Error(`Update ${key}: ${result.error.message}`);
      return rowToEntity<T>(result.data as Record<string, unknown>);
    },

    async listMedia(): Promise<MediaAsset[]> {
      const { data, error } = (await client.from('media_assets').select('*').order('created_at', { ascending: false })) as QueryResult<Record<string, unknown>>;
      if (error) throw new Error(`List media: ${error.message}`);
      return (data ?? []).map((row) => rowToEntity<MediaAsset>(row));
    },

    async getMedia(id: string): Promise<MediaAsset | null> {
      const { data, error } = (await client.from('media_assets').select('*').eq('id', id).maybeSingle()) as SingleResult<Record<string, unknown>>;
      if (error) throw new Error(`Get media: ${error.message}`);
      return data ? rowToEntity<MediaAsset>(data) : null;
    },

    async createMedia(input: Omit<MediaAsset, 'createdAt'>): Promise<MediaAsset> {
      const row = { ...entityToRow(input as unknown as Record<string, unknown>), created_at: new Date().toISOString() };
      const data = unwrap<Record<string, unknown>>(await client.from('media_assets').insert(row).select('*').single() as SingleResult<Record<string, unknown>>, 'Create media');
      return rowToEntity<MediaAsset>(data);
    },

    async updateMedia(id: string, patch: Partial<MediaAsset>): Promise<MediaAsset> {
      const data = unwrap<Record<string, unknown>>(await client.from('media_assets').update(entityToRow(patch as Record<string, unknown>)).eq('id', id).select('*').single() as SingleResult<Record<string, unknown>>, 'Update media');
      return rowToEntity<MediaAsset>(data);
    },

    async deleteMedia(id: string): Promise<void> {
      const { error } = await client.from('media_assets').delete().eq('id', id);
      if (error) throw new Error(`Delete media: ${error.message}`);
    },

    async logActivity(input: Omit<ActivityEntry, 'id' | 'createdAt'>): Promise<void> {
      const service = createServiceSupabaseClient();
      const row = entityToRow({ ...input, created_at: new Date().toISOString() });
      const { error } = await service.from('activity_log').insert(row);
      if (error) throw new Error(`Log activity: ${error.message}`);
    },

    async listActivity(limit = 20): Promise<ActivityEntry[]> {
      const { data, error } = (await client.from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit)) as QueryResult<Record<string, unknown>>;
      if (error) throw new Error(`List activity: ${error.message}`);
      return (data ?? []).map((row) => rowToEntity<ActivityEntry>(row));
    },

    async createPreviewToken(tokenHash: string, payload: { collection: string; id: string }, ttlSeconds: number): Promise<void> {
      const service = createServiceSupabaseClient();
      const { error } = await service.from('preview_tokens').insert({
        token_hash: tokenHash,
        collection: payload.collection,
        entity_type: payload.collection,
        entity_id: payload.id,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      });
      if (error) throw new Error(`Create preview token: ${error.message}`);
    },

    async getPreviewToken(tokenHash: string): Promise<{ collection: string; id: string } | null> {
      const service = createServiceSupabaseClient();
      const { data, error } = await service.from('preview_tokens')
        .select('collection, entity_type, entity_id, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error || !data) return null;
      if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;
      return { collection: String(data.entity_type ?? data.collection), id: String(data.entity_id) };
    },

    async consumePreviewToken(tokenHash: string): Promise<{ collection: string; id: string } | null> {
      const service = createServiceSupabaseClient();
      const { data, error } = await service.from('preview_tokens')
        .select('collection, entity_type, entity_id')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error || !data) return null;
      const collection = String(data.entity_type ?? data.collection);
      const id = String(data.entity_id);
      const { data: valid, error: rpcError } = await service.rpc('verify_preview_token', {
        p_token_hash: tokenHash,
        p_entity_type: collection,
        p_entity_id: id,
        p_consume: true,
      });
      if (rpcError || valid !== true) return null;
      return { collection, id };
    },

    async findUserByEmail(email: string): Promise<StoredUser | null> {
      const { data, error } = (await client.from('profiles').select('id, email, display_name, role, active').eq('email', email.toLowerCase()).maybeSingle()) as SingleResult<Record<string, unknown>>;
      if (error || !data || data.active === false) return null;
      return {
        id: String(data.id),
        email: String(data.email),
        name: String(data.display_name ?? 'Divyansh Garg'),
        role: (data.role as StoredUser['role']) ?? 'viewer',
        passwordHash: '',
      };
    },

    async seedOwner(): Promise<void> {
      // Owner is created via Supabase Auth; role is set in profiles table.
    },

    async createSession(): Promise<void> {
      // Supabase SSR cookies are managed in lib/auth.ts.
    },

    async getSessionUser(sessionId: string): Promise<SessionUser | null> {
      const { data, error } = await client.auth.getUser(sessionId);
      if (error || !data.user) return null;
      const profile = await this.findUserByEmail(data.user.email ?? '');
      if (!profile) return null;
      return { id: profile.id, email: profile.email, name: profile.name, role: profile.role };
    },

    async deleteSession(): Promise<void> {
      await client.auth.signOut();
    },

    async updatePassword(): Promise<void> {
      // Passwords are managed by Supabase Auth.
    },

    async deleteSessionsForUser(): Promise<void> {
      // Supabase Auth does not expose sign-out-all by user id through the
      // admin API without that user's JWT. Deactivation in updateUser bans the
      // user from refreshing sessions; existing access tokens expire normally.
    },

    async listUsers(): Promise<ManagedUser[]> {
      const service = createServiceSupabaseClient();
      const { data, error } = await service.from('profiles')
        .select('id, email, display_name, role, active, mfa_enabled, created_at')
        .order('created_at', { ascending: true });
      if (error) throw new Error(`List users: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        email: String(row.email),
        name: String(row.display_name ?? 'Divyansh Garg'),
        role: (row.role as UserRole) ?? 'viewer',
        active: row.active !== false,
        mfaEnrolled: row.mfa_enabled === true,
        createdAt: String(row.created_at),
      }));
    },

    async createUser(input: { email: string; name: string; role: UserRole; password?: string }): Promise<ManagedUser> {
      const service = createServiceSupabaseClient();
      if (!input.password) throw new Error('A temporary password is required in Supabase mode');
      const { data, error } = await service.auth.admin.createUser({
        email: input.email.toLowerCase(),
        password: input.password,
        email_confirm: true,
        user_metadata: { name: input.name },
      });
      if (error || !data.user) throw new Error(`Create user: ${error?.message ?? 'no user returned'}`);
      const { error: profileError } = await service.from('profiles')
        .update({ role: input.role, display_name: input.name, active: true })
        .eq('id', data.user.id);
      if (profileError) throw new Error(`Set user role: ${profileError.message}`);
      return {
        id: data.user.id,
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        active: true,
        mfaEnrolled: false,
        createdAt: data.user.created_at ?? new Date().toISOString(),
      };
    },

    async updateUser(id: string, patch: { role?: UserRole; active?: boolean; name?: string }): Promise<ManagedUser> {
      const service = createServiceSupabaseClient();
      if (patch.role === 'owner') {
        const { count } = await service.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner');
        if ((count ?? 0) > 0) throw new Error('Transfer ownership from the existing owner first');
      }
      const profilePatch: Record<string, unknown> = {};
      if (patch.role) profilePatch.role = patch.role;
      if (patch.active !== undefined) profilePatch.active = patch.active;
      if (patch.name !== undefined) profilePatch.display_name = patch.name;
      if (Object.keys(profilePatch).length > 0) {
        const { error } = await service.from('profiles').update(profilePatch).eq('id', id);
        if (error) throw new Error(`Update user: ${error.message}`);
      }
      if (patch.active !== undefined) {
        const { error } = await service.auth.admin.updateUserById(id, {
          ban_duration: patch.active ? 'none' : '876000h',
        });
        if (error) throw new Error(`Update user status: ${error.message}`);
      }
      const { data, error } = await service.from('profiles')
        .select('id, email, display_name, role, active, mfa_enabled, created_at')
        .eq('id', id)
        .single();
      if (error || !data) throw new Error(`Load user: ${error?.message ?? 'not found'}`);
      return {
        id: String(data.id),
        email: String(data.email),
        name: String(data.display_name ?? 'Divyansh Garg'),
        role: (data.role as UserRole) ?? 'viewer',
        active: data.active !== false,
        mfaEnrolled: data.mfa_enabled === true,
        createdAt: String(data.created_at),
      };
    },

    async deleteUser(id: string): Promise<void> {
      const service = createServiceSupabaseClient();
      const { data } = await service.from('profiles').select('role').eq('id', id).maybeSingle();
      if (data?.role === 'owner') {
        const { count } = await service.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner');
        if ((count ?? 0) <= 1) throw new Error('The last owner cannot be deleted');
      }
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw new Error(`Delete user: ${error.message}`);
    },

    async setMfaEnrolled(id: string, enrolled: boolean): Promise<void> {
      const service = createServiceSupabaseClient();
      const { error } = await service.from('profiles').update({ mfa_enabled: enrolled }).eq('id', id);
      if (error) throw new Error(`Update MFA state: ${error.message}`);
    },
  };
}
