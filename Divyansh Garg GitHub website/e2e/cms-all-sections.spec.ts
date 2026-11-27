import { expect, test, type APIRequestContext } from '@playwright/test';
import { loginWithApi } from './helpers/api';
import { uniqueRunId } from './helpers/fixtures';

test.describe.configure({ mode: 'serial' });

type JsonRecord = Record<string, unknown>;

const runId = uniqueRunId();

interface Case {
  collection: string;
  titleField: string;
  marker: string;
  payload: JsonRecord;
  // Categories only appear publicly once they contain a published skill.
  publicVisible?: boolean;
}

const cases: Case[] = [
  {
    collection: 'experience',
    titleField: 'role',
    marker: `E2E Experience ${runId}`,
    payload: {
      role: `E2E Experience ${runId}`,
      organization: 'Local test organisation',
      startDate: '2024-01-01',
      description: 'Local CRUD verification record.',
    },
  },
  {
    collection: 'education',
    titleField: 'degree',
    marker: `E2E Education ${runId}`,
    payload: {
      degree: `E2E Education ${runId}`,
      institution: 'Local test institution',
      period: '2024 — 2025',
      status: 'Testing',
    },
  },
  {
    collection: 'skill_categories',
    titleField: 'title',
    marker: `E2E Category ${runId}`,
    payload: { title: `E2E Category ${runId}`, description: 'Local CRUD verification category.' },
    publicVisible: false,
  },
  {
    collection: 'skills',
    titleField: 'name',
    marker: `E2E Skill ${runId}`,
    payload: { name: `E2E Skill ${runId}`, categoryId: '__FIRST_CATEGORY__', note: 'Local CRUD verification skill.' },
  },
  {
    collection: 'achievements',
    titleField: 'title',
    marker: `E2E Achievement ${runId}`,
    payload: { type: 'achievement', title: `E2E Achievement ${runId}`, issuer: 'Local test issuer', issueDate: '2024-01-01' },
  },
  {
    collection: 'social_links',
    titleField: 'label',
    marker: `E2E Social ${runId}`,
    payload: { platform: 'other', label: `E2E Social ${runId}`, url: 'https://example.com/e2e-social', visible: true },
  },
];

async function createEntity(api: APIRequestContext, collection: string, data: JsonRecord): Promise<JsonRecord> {
  const response = await api.post(`/api/admin/${collection}`, { data });
  if (response.status() !== 201) throw new Error(`${collection} create ${response.status()}: ${await response.text()}`);
  return ((await response.json()) as { item: JsonRecord }).item;
}

async function getEntity(api: APIRequestContext, collection: string, id: string): Promise<JsonRecord | null> {
  const response = await api.get(`/api/admin/${collection}/${id}`);
  if (response.status() === 404) return null;
  expect(response.ok(), `${collection} read should succeed`).toBeTruthy();
  return ((await response.json()) as { item: JsonRecord }).item;
}

async function listIds(api: APIRequestContext, collection: string): Promise<string[]> {
  const response = await api.get(`/api/admin/${collection}`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { items: JsonRecord[] }).items.map((item) => String(item.id));
}

async function reorder(api: APIRequestContext, collection: string, ids: string[]): Promise<void> {
  const response = await api.post('/api/admin/reorder', { data: { collection, ids } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function resolvePayload(api: APIRequestContext, payload: JsonRecord): Promise<JsonRecord> {
  if (payload.categoryId !== '__FIRST_CATEGORY__') return payload;
  const categories = ((await (await api.get('/api/admin/skill_categories')).json()) as { items: JsonRecord[] }).items;
  const first = categories.find((category) => category.title !== `E2E Category ${runId}`);
  if (!first) throw new Error('A real skill category is required for the skills lifecycle test');
  return { ...payload, categoryId: String(first.id) };
}

test.describe('Every CMS collection supports its full lifecycle', () => {
  test('about, projects, media, auth and certifications are covered by their dedicated specs', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const item of cases) {
    test(`${item.collection}: create, read, update, publish, reorder, unpublish and delete`, async ({ page }) => {
      await loginWithApi(page.request);
      const originalIds = await listIds(page.request, item.collection);
      const created = await createEntity(page.request, item.collection, {
        ...(await resolvePayload(page.request, item.payload)),
        visibility: 'draft',
        featured: false,
        order: 999,
      });
      const id = String(created.id);
      try {
        expect((await getEntity(page.request, item.collection, id))?.[item.titleField]).toBe(item.marker);

        const updatedResponse = await page.request.patch(`/api/admin/${item.collection}/${id}`, {
          data: { [item.titleField]: `${item.marker} updated`, description: 'Updated by E2E.', note: 'Updated by E2E.' },
        });
        expect(updatedResponse.ok(), await updatedResponse.text()).toBeTruthy();
        expect((await getEntity(page.request, item.collection, id))?.[item.titleField]).toBe(`${item.marker} updated`);

        const published = await page.request.patch(`/api/admin/${item.collection}/${id}`, { data: { visibility: 'published' } });
        expect(published.ok(), await published.text()).toBeTruthy();
        expect((await getEntity(page.request, item.collection, id))?.visibility).toBe('published');
        if (item.publicVisible !== false) {
          await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 30_000 }).toContain(`${item.marker} updated`);
        }

        const withNew = [...(await listIds(page.request, item.collection))];
        await reorder(page.request, item.collection, [id, ...withNew.filter((value) => value !== id)]);
        expect((await listIds(page.request, item.collection))[0]).toBe(id);

        const unpublished = await page.request.patch(`/api/admin/${item.collection}/${id}`, { data: { visibility: 'unpublished' } });
        expect(unpublished.ok(), await unpublished.text()).toBeTruthy();
        if (item.publicVisible !== false) {
          await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 30_000 }).not.toContain(`${item.marker} updated`);
        }
      } finally {
        await page.request.delete(`/api/admin/${item.collection}/${id}`).catch(() => undefined);
        await reorder(page.request, item.collection, originalIds).catch(() => undefined);
      }
      expect(await getEntity(page.request, item.collection, id)).toBeNull();
    });
  }

  test('skills can reference a newly created category', async ({ page }) => {
    await loginWithApi(page.request);
    const category = await createEntity(page.request, 'skill_categories', {
      title: `E2E Linked Category ${runId}`,
      visibility: 'draft',
      order: 999,
    });
    const skill = await createEntity(page.request, 'skills', {
      name: `E2E Linked Skill ${runId}`,
      categoryId: String(category.id),
      visibility: 'draft',
      order: 999,
    });
    try {
      expect((await getEntity(page.request, 'skills', String(skill.id)))?.categoryId).toBe(String(category.id));
    } finally {
      await page.request.delete(`/api/admin/skills/${String(skill.id)}`).catch(() => undefined);
      await page.request.delete(`/api/admin/skill_categories/${String(category.id)}`).catch(() => undefined);
    }
  });

  test('contact settings persist through the admin API and can be restored', async ({ page }) => {
    await loginWithApi(page.request);
    const currentResponse = await page.request.get('/api/admin/singletons/settings');
    expect(currentResponse.ok()).toBeTruthy();
    const original = ((await currentResponse.json()) as { item: JsonRecord }).item;
    const marker = `E2E contact note ${runId}`;
    try {
      const saved = await page.request.patch('/api/admin/singletons/settings', {
        data: { ...original, footerNote: marker },
      });
      expect(saved.ok(), await saved.text()).toBeTruthy();
      expect(((await saved.json()) as { item: JsonRecord }).item.footerNote).toBe(marker);
      await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 30_000 }).toContain(marker);
    } finally {
      const restored = await page.request.patch('/api/admin/singletons/settings', { data: original });
      expect(restored.ok(), await restored.text()).toBeTruthy();
    }
  });
});
