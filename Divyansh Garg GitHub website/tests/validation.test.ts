// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectionMap, type FieldConfig, type FieldType } from '../lib/admin-config';
import {
  isValidPath,
  loginSchema,
  normaliseFields,
  parseFieldValue,
  previewTokenSchema,
  validateFields,
} from '../lib/validation';

const field = (key: string, type: FieldType, required = false): FieldConfig => ({
  key,
  label: key,
  type,
  required,
});

describe('parseFieldValue', () => {
  describe('tags and media-list', () => {
    it.each(['tags', 'media-list'] as const)('splits a %s string on commas and newlines', (type) => {
      expect(parseFieldValue(field('items', type), ' react, next.js\ntypescript , ')).toEqual([
        'react',
        'next.js',
        'typescript',
      ]);
    });

    it.each(['tags', 'media-list'] as const)('keeps an existing %s array unchanged', (type) => {
      const input = ['alpha', ' beta ', 'gamma'];
      expect(parseFieldValue(field('items', type), input)).toEqual(input);
    });

    it('returns an empty array for empty tag input', () => {
      expect(parseFieldValue(field('tags', 'tags'), '')).toEqual([]);
      expect(parseFieldValue(field('tags', 'tags'), null)).toEqual([]);
    });
  });

  describe('boolean', () => {
    it.each([true, 'true', 'on', '1'])('treats %j as true', (raw) => {
      expect(parseFieldValue(field('featured', 'boolean'), raw)).toBe(true);
    });

    it.each([false, 'false', 'off', '', undefined, null, 1, 'yes'])('treats %j as false', (raw) => {
      expect(parseFieldValue(field('featured', 'boolean'), raw)).toBe(false);
    });
  });

  describe('number', () => {
    it('parses numeric strings and numbers', () => {
      expect(parseFieldValue(field('order', 'number'), '42')).toBe(42);
      expect(parseFieldValue(field('order', 'number'), '3.5')).toBe(3.5);
      expect(parseFieldValue(field('order', 'number'), 7)).toBe(7);
    });

    it('falls back to 0 for empty or non-finite input', () => {
      expect(parseFieldValue(field('order', 'number'), '')).toBe(0);
      expect(parseFieldValue(field('order', 'number'), undefined)).toBe(0);
      expect(parseFieldValue(field('order', 'number'), null)).toBe(0);
      expect(parseFieldValue(field('order', 'number'), 'not-a-number')).toBe(0);
      expect(parseFieldValue(field('order', 'number'), Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('does not enforce non-negativity while parsing', () => {
      expect(parseFieldValue(field('order', 'number'), -3)).toBe(-3);
    });
  });

  describe('text', () => {
    it('trims surrounding whitespace', () => {
      expect(parseFieldValue(field('title', 'text'), '  Hello world  ')).toBe('Hello world');
    });

    it('converts nullish values to an empty string and other primitives to strings', () => {
      expect(parseFieldValue(field('title', 'text'), null)).toBe('');
      expect(parseFieldValue(field('title', 'text'), undefined)).toBe('');
      expect(parseFieldValue(field('title', 'text'), 42)).toBe('42');
      expect(parseFieldValue(field('title', 'text'), false)).toBe('false');
    });
  });
});

describe('normaliseFields', () => {
  it('parses each configured field and ignores unconfigured keys', () => {
    const fields = [
      field('title', 'text', true),
      field('tags', 'tags'),
      field('featured', 'boolean'),
      field('order', 'number'),
    ];

    const result = normaliseFields(fields, {
      title: '  Hello  ',
      tags: 'a,b',
      featured: 'on',
      order: '2',
      ignored: 'not included',
    });

    expect(result).toEqual({
      title: 'Hello',
      tags: ['a', 'b'],
      featured: true,
      order: 2,
    });
    expect(result).not.toHaveProperty('ignored');
  });
});

describe('validateFields', () => {
  describe('required fields', () => {
    it('reports missing required text and tag values', () => {
      const result = validateFields([field('title', 'text', true), field('tags', 'tags', true)], {
        title: '   ',
        tags: '',
      });

      expect(result.success).toBe(false);
      expect(result.errors.title).toBe('Required');
      expect(result.errors.tags).toBe('Add at least one item');
    });

    it('returns normalised data for valid input', () => {
      const result = validateFields([field('title', 'text', true)], { title: '  Valid  ' });
      expect(result).toEqual({ success: true, data: { title: 'Valid' }, errors: {} });
    });

    it('rejects negative numbers configured as number fields', () => {
      const result = validateFields([field('order', 'number')], { order: -1 });
      expect(result.success).toBe(false);
      expect(result.errors.order).toBeDefined();
    });
  });

  describe('URL fields', () => {
    const fields = [field('website', 'url'), field('requiredUrl', 'url', true)];

    it('allows empty optional URLs and http(s) or mailto URLs', () => {
      const result = validateFields(fields, {
        website: 'https://example.com/path',
        requiredUrl: 'mailto:hello@example.com',
      });
      expect(result.success).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('rejects unsupported schemes and a missing required URL', () => {
      const result = validateFields(fields, { website: 'ftp://example.com', requiredUrl: '' });
      expect(result.success).toBe(false);
      expect(result.errors.website).toBe('Use a full http(s) or mailto URL');
      expect(result.errors.requiredUrl).toBe('Required');
    });
  });

  describe('projects', () => {
    const projectFields = [
      field('title', 'text', true),
      field('slug', 'text', true),
      field('githubUrl', 'url'),
      field('liveUrl', 'url'),
    ];

    it('rejects slugs containing uppercase letters, spaces or underscores', () => {
      const result = validateFields(
        projectFields,
        { title: 'Demo', slug: 'My_Project', githubUrl: 'https://github.com/example' },
        'projects',
      );

      expect(result.success).toBe(false);
      expect(result.errors.slug).toBe('Use lowercase letters, numbers and hyphens only');
    });

    it('accepts a lower-case hyphenated slug', () => {
      const result = validateFields(
        projectFields,
        { title: 'Demo', slug: 'my-project-2', githubUrl: 'https://github.com/example' },
        'projects',
      );
      expect(result.success).toBe(true);
    });

    it('requires at least one GitHub or live URL', () => {
      const result = validateFields(projectFields, { title: 'Demo', slug: 'my-project' }, 'projects');
      expect(result.success).toBe(false);
      expect(result.errors.githubUrl).toBe('Add a GitHub or live URL');
    });

    it('accepts a live URL when no GitHub URL is given', () => {
      const result = validateFields(
        projectFields,
        { title: 'Demo', slug: 'my-project', liveUrl: 'https://example.com' },
        'projects',
      );
      expect(result.success).toBe(true);
    });

    it('allows an incomplete draft without a cover image or URL', () => {
      const result = validateFields(
        [...projectFields, field('coverImage', 'media')],
        { title: 'Draft', slug: 'draft-only', visibility: 'draft' },
        'projects',
      );
      expect(result.success).toBe(true);
    });

    it('still requires a URL when publishing, but accepts line-art when no cover image is uploaded', () => {
      const result = validateFields(
        [...projectFields, field('coverImage', 'media')],
        { title: 'Live', slug: 'ready-to-publish', visibility: 'published' },
        'projects',
      );
      expect(result.success).toBe(false);
      expect(result.errors.githubUrl).toBe('Add a GitHub or live URL');
      expect(result.errors.coverImage).toBeUndefined();
    });
  });

  describe('experience', () => {
    const experienceFields = [
      field('role', 'text', true),
      field('endDate', 'date'),
      field('isCurrent', 'boolean'),
    ];

    it('rejects an end date on a current role', () => {
      const result = validateFields(
        experienceFields,
        { role: 'Engineer', isCurrent: 'true', endDate: '2026-01-01' },
        'experience',
      );

      expect(result.success).toBe(false);
      expect(result.errors.endDate).toBe('Clear the end date for an ongoing role');
    });

    it('allows an end date for a role that is not current', () => {
      const result = validateFields(
        experienceFields,
        { role: 'Engineer', isCurrent: 'off', endDate: '2026-01-01' },
        'experience',
      );
      expect(result.success).toBe(true);
    });

    it('allows a current role with no end date', () => {
      const result = validateFields(
        experienceFields,
        { role: 'Engineer', isCurrent: 'on', endDate: '' },
        'experience',
      );
      expect(result.success).toBe(true);
    });
  });

  describe('achievements', () => {
    const achievementFields = [field('title', 'text', true), field('verificationUrl', 'url')];

    it('rejects a verification URL that is not http(s)', () => {
      const result = validateFields(
        achievementFields,
        { title: 'Award', verificationUrl: 'mailto:issuer@example.com' },
        'achievements',
      );

      expect(result.success).toBe(false);
      expect(result.errors.verificationUrl).toBe('Use a full http(s) URL');
    });

    it('accepts an http(s) verification URL', () => {
      const result = validateFields(
        achievementFields,
        { title: 'Award', verificationUrl: 'https://example.com/verify/123' },
        'achievements',
      );
      expect(result.success).toBe(true);
    });

    it('allows an achievement with no verification URL', () => {
      const result = validateFields(achievementFields, { title: 'Award' }, 'achievements');
      expect(result.success).toBe(true);
    });

    it('validates a complete certificate against the real CMS field config', () => {
      const result = validateFields(
        collectionMap.achievements.fields,
        {
          type: 'certificate',
          title: 'Data Science Foundations',
          issuer: 'IIT Madras',
          issueDate: '2024-01-15',
          expiryDate: '',
          credentialId: 'CERT-123',
          verificationUrl: 'https://example.com/verify/123',
        },
        'achievements',
      );
      expect(result.success).toBe(true);
      expect(result.data?.expiryDate).toBe('');
    });

    it('rejects an invalid certificate type', () => {
      const result = validateFields(
        collectionMap.achievements.fields,
        { type: 'badge', title: 'Unknown' },
        'achievements',
      );
      expect(result.success).toBe(false);
      expect(result.errors.type).toBe('Choose a valid option');
    });

    it('rejects a malformed expiry date', () => {
      const result = validateFields(
        collectionMap.achievements.fields,
        { type: 'certificate', title: 'Timed credential', expiryDate: 'next year' },
        'achievements',
      );
      expect(result.success).toBe(false);
      expect(result.errors.expiryDate).toBe('Use a valid date');
    });
  });
});

describe('loginSchema', () => {
  it('trims and lowercases the email while keeping the password', () => {
    expect(
      loginSchema.parse({ email: '  User@Example.COM  ', password: 'unit-test-password' }),
    ).toEqual({ email: 'user@example.com', password: 'unit-test-password' });
  });

  it('rejects an invalid email and a short password', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    }
  });
});

describe('previewTokenSchema', () => {
  it('accepts a non-empty collection and id', () => {
    expect(previewTokenSchema.safeParse({ collection: 'projects', id: 'project-1' }).success).toBe(true);
  });

  it.each([
    { collection: '', id: 'project-1' },
    { collection: 'projects', id: '' },
  ])('rejects empty values in %o', (input) => {
    expect(previewTokenSchema.safeParse(input).success).toBe(false);
  });
});

describe('isValidPath', () => {
  it('accepts paths inside /uploads/', () => {
    expect(isValidPath('/uploads/photo.png')).toBe(true);
    expect(isValidPath('/uploads/nested/photo.png')).toBe(true);
  });

  it.each([
    '/images/photo.png',
    'uploads/photo.png',
    '/uploads/../secret.png',
    '/uploads/nested/../secret.png',
    '/uploads/a..b.png',
    '/uploads/nested\\secret.png',
    '\\uploads\\photo.png',
  ])('rejects unsafe or out-of-scope path %s', (value) => {
    expect(isValidPath(value)).toBe(false);
  });
});
