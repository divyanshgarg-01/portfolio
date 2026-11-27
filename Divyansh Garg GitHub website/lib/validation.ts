import { z } from 'zod';
import type { FieldConfig } from './admin-config';
import { sectionKeys } from './defaults';

export function parseFieldValue(field: FieldConfig, raw: unknown): unknown {
  switch (field.type) {
    case 'tags':
    case 'media-list': {
      const value = Array.isArray(raw)
        ? raw
        : String(raw ?? '')
            .split(/[\n,]/)
            .map((part) => part.trim())
            .filter(Boolean);
      return value;
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === 'on' || raw === '1';
    case 'number': {
      const value = Number(raw ?? 0);
      return Number.isFinite(value) ? value : 0;
    }
    default:
      return String(raw ?? '').trim();
  }
}

export function normaliseFields(fields: FieldConfig[], raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) result[field.key] = parseFieldValue(field, raw[field.key]);
  return result;
}

function schemaForFields(fields: FieldConfig[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let schema: z.ZodTypeAny;
    if (field.type === 'tags' || field.type === 'media-list') {
      schema = z.array(z.string().trim().min(1));
      if (field.required) schema = (schema as z.ZodArray<z.ZodString>).min(1, 'Add at least one item');
    } else if (field.type === 'boolean') {
      schema = z.boolean();
    } else if (field.type === 'number') {
      schema = z.number().nonnegative();
    } else if (field.type === 'url') {
      schema = z.string().trim().refine(
        (value) => !value || /^https?:\/\//i.test(value) || value.startsWith('mailto:'),
        'Use a full http(s) or mailto URL',
      );
      if (field.required) schema = (schema as z.ZodEffects<z.ZodString>).refine((v) => String(v).length > 0, 'Required');
    } else if (field.type === 'date') {
      schema = z.string().trim().refine(
        (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
        'Use a valid date',
      );
      if (field.required) schema = (schema as z.ZodEffects<z.ZodString>).refine((v) => String(v).length > 0, 'Required');
    } else if (field.type === 'select' && field.options?.length) {
      const allowed = field.options.map((option) => option.value);
      schema = z.string().trim().refine((value) => !value || allowed.includes(value), 'Choose a valid option');
      if (field.required) schema = (schema as z.ZodEffects<z.ZodString>).refine((v) => String(v).length > 0, 'Required');
    } else {
      schema = z.string().trim();
      if (field.required) schema = (schema as z.ZodString).min(1, 'Required');
    }
    shape[field.key] = schema;
  }
  return z.object(shape).passthrough();
}

export interface ValidationResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  errors: Record<string, string>;
}

export function validateFields<T extends Record<string, unknown> = Record<string, unknown>>(
  fields: FieldConfig[],
  raw: Record<string, unknown>,
  collection?: string,
): ValidationResult<T> {
  const values = normaliseFields(fields, raw);
  const isDraft = collection === 'projects' && ['draft', 'unpublished'].includes(String(raw.visibility ?? 'published'));
  const result = schemaForFields(fields).safeParse(values);
  const data = (result.success ? result.data : values) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!errors[key]) errors[key] = issue.message;
    }
  }

  if (collection === 'projects') {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(data.slug ?? ''))) {
      errors.slug = 'Use lowercase letters, numbers and hyphens only';
    }
    if (!isDraft && !data.githubUrl && !data.liveUrl) {
      errors.githubUrl = 'Add a GitHub or live URL';
    }
  }
  if (collection === 'experience' && data.isCurrent && data.endDate) {
    errors.endDate = 'Clear the end date for an ongoing role';
  }
  if (collection === 'achievements' && data.verificationUrl && !/^https?:\/\//i.test(String(data.verificationUrl))) {
    errors.verificationUrl = 'Use a full http(s) URL';
  }

  if (Object.keys(errors).length) return { success: false, errors };
  return { success: true, data: data as T, errors: {} };
}

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email').transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const collectionKeySchema = z.enum([
  'projects',
  'experience',
  'education',
  'skill_categories',
  'skills',
  'achievements',
  'social_links',
]);

export const previewTokenSchema = z.object({
  collection: collectionKeySchema,
  id: z.string().min(1),
});

export function isValidPath(value: string): boolean {
  return value.startsWith('/uploads/') && !value.includes('..') && !value.includes('\\');
}

const optionalSafeUrl = z.string().trim().refine(
  (value) => !value || /^https?:\/\//i.test(value) || value.startsWith('mailto:') || value.startsWith('/#'),
  'Use a full http(s), mailto or in-page URL',
);

export const siteSettingsSchema = z.object({
  id: z.string().optional(),
  siteTitle: z.string().trim().min(1, 'Required').max(120),
  siteDescription: z.string().trim().min(1, 'Required').max(400),
  contactEmail: z.string().trim().email('Enter a valid email'),
  location: z.string().trim().max(120),
  timezone: z.string().trim().min(1, 'Required').max(80),
  footerNote: z.string().trim().max(240),
  ogImage: z.string().trim(),
  navItems: z.array(z.object({
    label: z.string().trim().min(1),
    section: z.string().trim().refine((value) => (sectionKeys as readonly string[]).includes(value), 'Unknown section'),
    visible: z.boolean(),
  })).max(8, 'Use at most eight navigation items'),
  cta: z.object({ label: z.string().trim().max(60), url: optionalSafeUrl }),
  sectionVisibility: z.record(z.enum(sectionKeys), z.boolean()),
  sectionHeadings: z.record(z.enum(sectionKeys), z.union([
    z.string().max(120),
    z.object({
      heading: z.string().max(120).optional(),
      title: z.string().max(120).optional(),
      kicker: z.string().max(120).optional(),
      label: z.string().max(120).optional(),
    }),
  ])).optional(),
  appearance: z.object({
    accent: z.enum(['caramel', 'bronze', 'warm', 'text']),
    grain: z.boolean(),
    loader: z.boolean(),
    terminal: z.boolean(),
    emberDensity: z.enum(['low', 'medium', 'high']),
  }),
  updatedAt: z.string().optional(),
}).strict();

export const aboutSchema = z.object({
  id: z.string().optional(),
  headline: z.string().trim().min(1, 'Required').max(120),
  subheadline: z.string().trim().min(1, 'Required').max(180),
  bio: z.string().trim().min(1, 'Required').max(4000),
  intro: z.string().trim().max(400),
  availability: z.string().trim().max(180),
  location: z.string().trim().max(120),
  careerDirection: z.string().trim().max(140),
  profileImage: z.string().trim(),
  interests: z.array(z.string().trim().min(1)).max(20),
  currentlyLearning: z.array(z.string().trim().min(1)).max(20),
  updatedAt: z.string().optional(),
}).strict();

export function validateSingleton(key: 'settings' | 'about', raw: Record<string, unknown>): ValidationResult {
  const result = key === 'settings' ? siteSettingsSchema.safeParse(raw) : aboutSchema.safeParse(raw);
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      if (!errors[field]) errors[field] = issue.message;
    }
    return { success: false, errors };
  }
  return { success: true, data: result.data as Record<string, unknown>, errors: {} };
}
