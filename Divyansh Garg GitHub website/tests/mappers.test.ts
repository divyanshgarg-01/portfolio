// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { entityToRow, rowToEntity, tableFor } from '../lib/db/mappers';
import type { CollectionKey } from '../lib/types';

describe('tableFor', () => {
  const cases: Array<[CollectionKey, string]> = [
    ['projects', 'projects'],
    ['experience', 'experience'],
    ['education', 'education'],
    ['skill_categories', 'skill_categories'],
    ['skills', 'skills'],
    ['achievements', 'achievements'],
    ['social_links', 'social_links'],
  ];

  it.each(cases)('maps the %s collection to the %s table', (collection, table) => {
    expect(tableFor(collection)).toBe(table);
  });
});

describe('rowToEntity', () => {
  it('maps order_index to order and generic snake_case keys to camelCase', () => {
    const entity = rowToEntity<Record<string, unknown>>({
      id: 'project-1',
      order_index: 3,
      github_url: 'https://github.com/example',
      created_at: '2026-01-01T00:00:00Z',
      some_generic_key: 'value',
    });

    expect(entity).toEqual({
      id: 'project-1',
      order: 3,
      githubUrl: 'https://github.com/example',
      createdAt: '2026-01-01T00:00:00Z',
      someGenericKey: 'value',
    });
  });

  it('maps media and activity special cases', () => {
    const entity = rowToEntity<Record<string, unknown>>({
      alt_text: 'A photo',
      mime_type: 'image/png',
      size_bytes: 2048,
      uploaded_by: 'editor-1',
      actor_id: 'user-1',
      entity_type: 'project',
      entity_id: 'project-1',
      updated_at: '2026-01-02T00:00:00Z',
    });

    expect(entity).toEqual({
      altText: 'A photo',
      mimeType: 'image/png',
      size: 2048,
      uploadedBy: 'editor-1',
      actor: 'user-1',
      entityType: 'project',
      entityId: 'project-1',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });

  it('preserves values such as nulls and booleans without coercion', () => {
    const entity = rowToEntity<Record<string, unknown>>({
      published_at: null,
      is_current: true,
      title: '  unchanged  ',
    });

    expect(entity).toEqual({ publishedAt: null, isCurrent: true, title: '  unchanged  ' });
  });
});

describe('entityToRow', () => {
  it('maps special camelCase keys back to their column names', () => {
    const row = entityToRow({
      order: 2,
      availability: 'open to work',
      altText: 'Cover image',
      mimeType: 'image/png',
      size: 4096,
      uploadedBy: 'editor-1',
      actor: 'user-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      publishedAt: null,
      deletedAt: null,
    });

    expect(row).toEqual({
      order_index: 2,
      availability_status: 'open to work',
      alt_text: 'Cover image',
      mime_type: 'image/png',
      size_bytes: 4096,
      uploaded_by: 'editor-1',
      actor_id: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      published_at: null,
      deleted_at: null,
    });
  });

  it('converts ordinary camelCase keys to snake_case', () => {
    expect(
      entityToRow({
        githubUrl: 'https://github.com/example',
        siteTitle: 'Portfolio',
        isCurrent: true,
        credentialId: 'credential-1',
        expiryDate: '2027-01-15',
      }),
    ).toEqual({
      github_url: 'https://github.com/example',
      site_title: 'Portfolio',
      is_current: true,
      credential_id: 'credential-1',
      expiry_date: '2027-01-15',
    });
  });
});

describe('mapper round-trip', () => {
  it('restores the original entity after entityToRow and rowToEntity', () => {
    const entity = {
      id: 'asset-1',
      order: 5,
      featured: true,
      visibility: 'published',
      githubUrl: 'https://github.com/example',
      liveUrl: 'https://example.com',
      altText: 'A photo',
      mimeType: 'image/png',
      size: 2048,
      uploadedBy: 'editor-1',
      actor: 'user-1',
      entityType: 'project',
      entityId: 'project-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      publishedAt: null,
      deletedAt: null,
      someCamelKey: 'value',
    };

    const row = entityToRow(entity);
    expect(rowToEntity<Record<string, unknown>>(row)).toEqual(entity);
  });
});

describe('mapper normalisation', () => {
  it('writes emberDensity inside appearance as the ember_density column', () => {
    const row = entityToRow({
      appearance: {
        accent: 'bronze',
        grain: true,
        loader: false,
        terminal: true,
        emberDensity: 'high',
      },
    });

    expect(row.appearance).toEqual({
      accent: 'bronze',
      grain: true,
      loader: false,
      terminal: true,
      ember_density: 'high',
    });
    expect(rowToEntity<{ appearance: Record<string, unknown> }>(row).appearance.emberDensity).toBe('high');
  });

  it('normalises empty UUID/date values to null and unknown platforms to other', () => {
    expect(entityToRow({ coverImage: '', categoryId: '', startDate: '', platform: 'Unknown' })).toEqual({
      cover_image: null,
      category_id: null,
      start_date: null,
      platform: 'other',
    });
    expect(entityToRow({ platform: 'GitHub' })).toEqual({ platform: 'github' });
  });

  it('round-trips CMS-editable section headings', () => {
    const row = entityToRow({ sectionHeadings: { about: 'Who I am', contact: { heading: 'Say hello' } } });
    expect(row.section_headings).toEqual({ about: 'Who I am', contact: { heading: 'Say hello' } });
    expect(rowToEntity<Record<string, unknown>>(row).sectionHeadings).toEqual({
      about: 'Who I am',
      contact: { heading: 'Say hello' },
    });
  });
});
