import type { CollectionKey } from '../types';

const TABLE: Record<CollectionKey, string> = {
  projects: 'projects',
  experience: 'experience',
  education: 'education',
  skill_categories: 'skill_categories',
  skills: 'skills',
  achievements: 'achievements',
  social_links: 'social_links',
};

export const tableFor = (collection: CollectionKey): string => TABLE[collection];

const ENTITY_TO_COLUMN: Record<string, string> = {
  order: 'order_index',
  availability: 'availability_status',
  altText: 'alt_text',
  mimeType: 'mime_type',
  size: 'size_bytes',
  blurDataUrl: 'blur_data_url',
  uploadedBy: 'uploaded_by',
  replacedBy: 'replaced_by',
  actor: 'actor_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  publishedAt: 'published_at',
  deletedAt: 'deleted_at',
  githubUrl: 'github_url',
  liveUrl: 'live_url',
  verificationUrl: 'verification_url',
  issueDate: 'issue_date',
  expiryDate: 'expiry_date',
  credentialId: 'credential_id',
  profileImage: 'profile_image',
  coverImage: 'cover_image',
  categoryId: 'category_id',
  colourToken: 'colour_token',
  iconKey: 'icon_key',
  employmentType: 'employment_type',
  startDate: 'start_date',
  endDate: 'end_date',
  isCurrent: 'is_current',
  achievementNote: 'achievement_note',
  currentlyLearning: 'currently_learning',
  careerDirection: 'career_direction',
  siteTitle: 'site_title',
  siteDescription: 'site_description',
  contactEmail: 'contact_email',
  footerNote: 'footer_note',
  navItems: 'nav_items',
  sectionVisibility: 'section_visibility',
  ogImage: 'og_image',
  entityType: 'entity_type',
  entityId: 'entity_id',
  mfaEnrolled: 'mfa_enabled',
};

const COLUMN_TO_ENTITY: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_TO_COLUMN).map(([entityKey, column]) => [column, entityKey]),
);

const UUID_COLUMNS = new Set([
  'cover_image',
  'profile_image',
  'og_image',
  'logo',
  'certificate',
  'file',
  'category_id',
  'uploaded_by',
  'replaced_by',
  'actor_id',
]);

const DATE_COLUMNS = new Set(['start_date', 'end_date', 'issue_date', 'expiry_date']);

const SOCIAL_PLATFORMS = new Set([
  'github',
  'linkedin',
  'email',
  'youtube',
  'x',
  'instagram',
  'topmate',
  'other',
]);

const camel = (key: string): string => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const snake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

interface Appearance {
  accent: string;
  grain: boolean;
  loader: boolean;
  terminal: boolean;
  emberDensity: 'low' | 'medium' | 'high';
}

function appearanceToRow(value: Record<string, unknown>): Record<string, unknown> {
  const density = value.emberDensity ?? value.ember_density ?? 'medium';
  return {
    accent: value.accent ?? 'caramel',
    grain: Boolean(value.grain),
    loader: Boolean(value.loader),
    terminal: Boolean(value.terminal),
    ember_density: density,
  };
}

function appearanceToEntity(value: Record<string, unknown>): Record<string, unknown> {
  if (!('ember_density' in value)) return value;
  const { ember_density, ...rest } = value;
  return { ...rest, emberDensity: ember_density };
}

function normaliseColumnValue(column: string, value: unknown): unknown {
  if ((UUID_COLUMNS.has(column) || DATE_COLUMNS.has(column)) && value === '') return null;
  if (column === 'platform' && typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    return SOCIAL_PLATFORMS.has(normalised) ? normalised : 'other';
  }
  if (column === 'appearance' && value && typeof value === 'object' && !Array.isArray(value)) {
    return appearanceToRow(value as Record<string, unknown>);
  }
  return value;
}

export function rowToEntity<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const mappedKey = COLUMN_TO_ENTITY[key] ?? camel(key);
    result[mappedKey] = key === 'appearance' && value && typeof value === 'object' && !Array.isArray(value)
      ? appearanceToEntity(value as Record<string, unknown>)
      : value;
  }
  return result as T;
}

export function entityToRow(input: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const column = ENTITY_TO_COLUMN[key] ?? snake(key);
    row[column] = normaliseColumnValue(column, value);
  }
  return row;
}

export type { Appearance };
