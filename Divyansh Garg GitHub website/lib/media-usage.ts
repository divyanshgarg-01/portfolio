import { getPortfolioData } from './data';
import { getAdminDb } from './db';
import type { DbAdapter } from './db/interface';
import type { MediaAsset } from './types';

/**
 * Builds a map of every string stored in CMS content so media references can be
 * detected by asset id or public path. Drafts are included: deleting an asset
 * used by an unpublished draft would silently break the editor's work.
 */
export async function getMediaUsageMap(adapter?: DbAdapter): Promise<Record<string, string[]>> {
  const data = await getPortfolioData(true, adapter ?? await getAdminDb());
  const usage: Record<string, string[]> = {};

  const visit = (value: unknown, label: string): void => {
    if (typeof value === 'string') {
      if (!value) return;
      if (!usage[value]) usage[value] = [];
      if (!usage[value].includes(label)) usage[value].push(label);
      return;
    }
    if (Array.isArray(value)) value.forEach((entry) => visit(entry, label));
  };

  const collections: Record<string, Array<Record<string, unknown>>> = {
    projects: data.projects as unknown as Array<Record<string, unknown>>,
    experience: data.experience as unknown as Array<Record<string, unknown>>,
    education: data.education as unknown as Array<Record<string, unknown>>,
    achievements: data.achievements as unknown as Array<Record<string, unknown>>,
    socials: data.socials as unknown as Array<Record<string, unknown>>,
    skills: data.skills as unknown as Array<Record<string, unknown>>,
    skillCategories: data.skillCategories as unknown as Array<Record<string, unknown>>,
  };

  for (const [collection, entries] of Object.entries(collections)) {
    for (const entry of entries) {
      const title = String(entry.title ?? entry.role ?? entry.name ?? entry.label ?? collection);
      for (const value of Object.values(entry)) visit(value, `${collection}: ${title}`);
    }
  }
  visit(data.about.profileImage, 'about: profile image');
  visit(data.settings.ogImage, 'settings: social image');

  return usage;
}

export function referencesForAsset(asset: MediaAsset, usage: Record<string, string[]>): string[] {
  return Array.from(new Set([
    ...(usage[asset.id] ?? []),
    ...(usage[asset.path] ?? []),
  ]));
}
