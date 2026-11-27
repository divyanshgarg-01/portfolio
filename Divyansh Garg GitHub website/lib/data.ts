import { getPublicDb } from './db';
import type { DbAdapter } from './db/interface';
import type { AboutRecord, PortfolioData, SiteSettings } from './types';

export async function getPortfolioData(
  includeDrafts = false,
  adapter: DbAdapter = getPublicDb(),
): Promise<PortfolioData> {
  const [settings, about, socials, projects, experience, education, skillCategories, skills, achievements, media] = await Promise.all([
    adapter.getSingleton<SiteSettings>('settings'),
    adapter.getSingleton<AboutRecord>('about'),
    adapter.listEntities<PortfolioData['socials'][number]>('social_links', includeDrafts),
    adapter.listEntities<PortfolioData['projects'][number]>('projects', includeDrafts),
    adapter.listEntities<PortfolioData['experience'][number]>('experience', includeDrafts),
    adapter.listEntities<PortfolioData['education'][number]>('education', includeDrafts),
    adapter.listEntities<PortfolioData['skillCategories'][number]>('skill_categories', includeDrafts),
    adapter.listEntities<PortfolioData['skills'][number]>('skills', includeDrafts),
    adapter.listEntities<PortfolioData['achievements'][number]>('achievements', includeDrafts),
    adapter.listMedia(),
  ]);

  const visibleSocials = includeDrafts ? socials : socials.filter((link) => link.visible);

  return {
    settings,
    about,
    socials: visibleSocials,
    projects,
    experience,
    education,
    skillCategories,
    skills,
    achievements,
    media,
  };
}

export async function getPublishedPortfolio(): Promise<PortfolioData> {
  return getPortfolioData(false, getPublicDb());
}

export function countByStatus<T extends { visibility: string }>(items: T[]): { published: number; draft: number; unpublished: number } {
  return {
    published: items.filter((item) => item.visibility === 'published').length,
    draft: items.filter((item) => item.visibility === 'draft').length,
    unpublished: items.filter((item) => item.visibility === 'unpublished').length,
  };
}
