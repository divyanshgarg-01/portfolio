import type {
  AboutRecord,
  Achievement,
  Education,
  Experience,
  MediaAsset,
  PortfolioData,
  Project,
  SiteSettings,
  Skill,
  SkillCategory,
  SocialLink,
} from '../original/lib/types';

type JsonObject = Record<string, unknown>;
type Ordered = { id: string; visibility?: string; order?: number };

const singletonModules = import.meta.glob('../content/*.json', { eager: true, import: 'default' });

const projectModules = import.meta.glob('../content/projects/*.json', { eager: true, import: 'default' });
const experienceModules = import.meta.glob('../content/experience/*.json', { eager: true, import: 'default' });
const educationModules = import.meta.glob('../content/education/*.json', { eager: true, import: 'default' });
const skillCategoryModules = import.meta.glob('../content/skill-categories/*.json', { eager: true, import: 'default' });
const skillModules = import.meta.glob('../content/skills/*.json', { eager: true, import: 'default' });
const achievementModules = import.meta.glob('../content/achievements/*.json', { eager: true, import: 'default' });
const socialModules = import.meta.glob('../content/socials/*.json', { eager: true, import: 'default' });

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function singleton(name: string): JsonObject {
  const entry = Object.entries(singletonModules).find(([key]) => key.endsWith(`/${name}.json`));
  if (!entry) throw new Error(`Missing content singleton: ${name}.json`);
  return asObject(entry[1]);
}

function publishedSorted<T extends Ordered>(items: T[]): T[] {
  return items
    .filter((item) => item && item.visibility === 'published')
    .sort((a, b) => asNumber(a.order) - asNumber(b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function collection<T extends Ordered>(modules: Record<string, unknown>): T[] {
  return publishedSorted(Object.values(modules).map((module) => asObject(module) as unknown as T));
}

function guessMimeType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

const mediaAssets: MediaAsset[] = [];

function registerMedia(id: string, filePath: string, meta: Partial<MediaAsset>): string {
  if (!filePath) return '';
  if (mediaAssets.some((asset) => asset.id === id)) return id;
  mediaAssets.push({
    id,
    path: filePath,
    bucket: meta.bucket ?? 'media-public',
    filename: meta.filename || filePath.split('/').pop() || '',
    folder: meta.folder ?? '',
    altText: meta.altText ?? '',
    mimeType: meta.mimeType || guessMimeType(filePath),
    size: meta.size ?? 0,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    uploadedBy: meta.uploadedBy || 'snapshot-import',
    blurDataUrl: meta.blurDataUrl ?? '',
    createdAt: meta.createdAt || '2026-11-28T00:00:00.000Z',
  });
  return id;
}

function mediaMeta(source: JsonObject, prefix: string): Partial<MediaAsset> {
  const bucket = asString(source[`${prefix}Bucket`]);
  return {
    altText: asString(source[`${prefix}Alt`]),
    mimeType: asString(source[`${prefix}MimeType`]),
    size: asNumber(source[`${prefix}Size`]),
    width: asNumber(source[`${prefix}Width`]),
    height: asNumber(source[`${prefix}Height`]),
    bucket: bucket === 'media-private' ? 'media-private' : 'media-public',
    filename: asString(source[`${prefix}Filename`]),
    folder: asString(source[`${prefix}Folder`]),
    uploadedBy: asString(source[`${prefix}UploadedBy`]),
    blurDataUrl: asString(source[`${prefix}BlurDataUrl`]),
    createdAt: asString(source[`${prefix}CreatedAt`]),
  };
}

const settingsJson = singleton('settings') as SiteSettings & JsonObject;
const aboutJson = singleton('about') as AboutRecord & JsonObject;

const aboutProfilePath = asString(aboutJson.profileImage);
const aboutProfileId = registerMedia('media_profile', aboutProfilePath, mediaMeta(aboutJson, 'profileImage'));
const about: AboutRecord = {
  ...aboutJson,
  profileImage: aboutProfileId,
};

const ogImagePath = asString(settingsJson.ogImage);
const ogImageId = ogImagePath.startsWith('/')
  ? registerMedia('media_og', ogImagePath, mediaMeta(settingsJson, 'ogImage'))
  : '';
const settings: SiteSettings = {
  ...settingsJson,
  ogImage: ogImageId || ogImagePath,
};

const projects: Project[] = collection<Project & JsonObject>(projectModules).map((raw) => {
  const coverPath = asString(raw.coverImage);
  const coverId = registerMedia(`cover_${raw.id}`, coverPath, mediaMeta(raw, 'cover'));
  return {
    ...raw,
    coverImage: coverId,
  };
});

const experience: Experience[] = collection<Experience>(experienceModules);
const education: Education[] = collection<Education>(educationModules);
const skillCategories: SkillCategory[] = collection<SkillCategory>(skillCategoryModules);
const skills: Skill[] = collection<Skill>(skillModules);

const staticFileUrls: Record<string, string> = {};
const achievements: Achievement[] = collection<Achievement & JsonObject>(achievementModules).map((raw) => {
  const filePath = asString(raw.file) || asString(raw.fileUrl);
  const fileId = registerMedia(`achievement_${raw.id}`, filePath, mediaMeta(raw, 'file'));
  staticFileUrls[raw.id] = asString(raw.fileUrl) || filePath;
  return {
    ...raw,
    file: fileId,
  };
});

const socials: SocialLink[] = collection<SocialLink>(socialModules).filter((social) => social.visible !== false);

export const portfolioData: PortfolioData = {
  settings,
  about,
  socials,
  projects,
  experience,
  education,
  skillCategories,
  skills,
  achievements,
  media: mediaAssets,
};

export { staticFileUrls };
