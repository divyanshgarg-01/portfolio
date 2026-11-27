import 'server-only';
import { createHash } from 'node:crypto';
import { dataMode, getPublicDb } from './db';
import { localAdapter } from './db/local';
import { createSupabaseAdapter } from './db/supabase';
import { createServiceSupabaseClient } from './service-supabase';
import { getPortfolioData } from './data';
import type { CollectionKey, PortfolioData } from './types';

const DATA_KEYS: Record<CollectionKey, keyof PortfolioData> = {
  projects: 'projects',
  experience: 'experience',
  education: 'education',
  skill_categories: 'skillCategories',
  skills: 'skills',
  achievements: 'achievements',
  social_links: 'socials',
};

export function hashPreviewToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Consume a preview token and return exactly one draft record scoped to that
 * token. Public data is always read through the least-privilege adapter; only
 * the single referenced entity is fetched with the narrowly scoped service
 * client after the token has been atomically consumed.
 */
export async function buildTokenScopedPreview(token: string): Promise<PortfolioData | null> {
  const hash = hashPreviewToken(token);
  const publicDb = getPublicDb();
  const payload = await publicDb.consumePreviewToken(hash);
  if (!payload) return null;
  if (!Object.hasOwn(DATA_KEYS, payload.collection)) return null;

  const collection = payload.collection as CollectionKey;
  const privilegedDb = dataMode === 'local'
    ? localAdapter
    : createSupabaseAdapter(createServiceSupabaseClient());
  const entity = await privilegedDb.getEntity<Record<string, unknown>>(collection, payload.id);

  const data = await getPortfolioData(false, publicDb);
  if (entity) {
    const current = data[DATA_KEYS[collection]] as unknown as Array<Record<string, unknown>>;
    const index = current.findIndex((item) => item.id === payload.id);
    if (index >= 0) current[index] = entity;
    else current.unshift(entity);
  }

  return {
    ...data,
    settings: {
      ...data.settings,
      siteTitle: `DRAFT PREVIEW — ${data.settings.siteTitle}`,
    },
  };
}
