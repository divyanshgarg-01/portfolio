import { expect, test, type APIRequestContext, type Cookie } from '@playwright/test';
import {
  apiFor,
  createPreview,
  createProject,
  deleteProject,
  getAbout,
  getPublicHtml,
  listProjects,
  loginWithApi,
  patchAbout,
  patchProject,
  projectTitlesFromHtml,
  reorderProjects,
  type JsonRecord,
} from './helpers/api';
import { DRAFT_ONLY_MARKER, testProjectTitle, uniqueRunId } from './helpers/fixtures';

test.describe('CMS workflow (local SQLite)', () => {
  test.describe.configure({ mode: 'serial' });

  const runId = uniqueRunId();
  const title = testProjectTitle(runId);
  let api: APIRequestContext;
  let sessionCookies: Cookie[] | undefined;
  let projectId = '';
  let originalProjectIds: string[] = [];
  let originalIntro: string | undefined;

  test.beforeEach(async ({ page }) => {
    api = apiFor(page);
    if (!sessionCookies) {
      await loginWithApi(api);
      sessionCookies = await page.context().cookies();
    } else {
      // A fresh browser context is created per test; restore the authenticated session.
      await page.context().addCookies(sessionCookies);
    }
  });

  test.afterAll(async ({ playwright }) => {
    const context = await playwright.request.newContext({
      baseURL: 'http://127.0.0.1:3100',
      storageState: { cookies: sessionCookies ?? [], origins: [] },
    });
    try {
      if (!sessionCookies) await loginWithApi(context);

      if (projectId) await deleteProject(context, projectId, true);
      if (originalIntro !== undefined) await patchAbout(context, { intro: originalIntro });
      if (originalProjectIds.length > 0) await reorderProjects(context, originalProjectIds);
    } finally {
      await context.dispose();
    }
  });

  const draftPayload = (): JsonRecord => ({
    title,
    slug: `e2e-draft-${runId}`,
    summary: `${DRAFT_ONLY_MARKER} synthetic summary for an end-to-end test.`,
    description: `${DRAFT_ONLY_MARKER} synthetic description for an end-to-end test.`,
    category: 'Automated test',
    status: 'Test fixture',
    coverImage: '',
    gallery: [],
    technologies: ['Playwright'],
    githubUrl: 'https://example.com/e2e-project',
    liveUrl: '',
    featured: false,
    visibility: 'draft',
    order: 999,
  });

  test('creates a uniquely titled draft that never appears in public HTML', async () => {
    const created = await createProject(api, draftPayload());
    projectId = String(created.id);
    expect(projectId).toBeTruthy();

    const html = await getPublicHtml(api);
    expect(html).not.toContain(title);
    expect(html).not.toContain(DRAFT_ONLY_MARKER);
  });

  test('opens a draft preview and shows the draft title', async ({ page }) => {
    const url = await createPreview(api, 'projects', projectId);
    expect(url).toMatch(/^\/preview\//);

    await page.goto(url);
    await expect(page.getByText(/Draft preview — not public/)).toBeVisible();
    await expect(page.locator('#projects .project-card h3', { hasText: title })).toBeVisible();
    await expect(page.locator('#projects .project-card', { hasText: title })).toContainText(DRAFT_ONLY_MARKER);
  });

  test('publishes the draft and finds it on the public site', async ({ page }) => {
    const updated = await patchProject(api, projectId, { visibility: 'published' });
    expect(updated.visibility).toBe('published');

    await expect.poll(() => getPublicHtml(api).then(projectTitlesFromHtml), { timeout: 30000 }).toContain(title);
    await page.goto('/');
    await expect(page.locator('#projects .project-card h3', { hasText: title })).toBeVisible();
  });

  test('activity log searches, filters and exports recorded mutations', async ({ page }) => {
    await page.goto('/admin/activity');
    await expect(page.getByRole('heading', { name: 'Activity log' })).toBeVisible();
    await expect(page.locator('.data-table tbody tr').first()).toBeVisible();

    await page.getByLabel('Search activity').fill('projects.update');
    await expect(page.locator('.data-table tbody tr')).not.toHaveCount(0);
    await expect(page.locator('.data-table tbody tr').first()).toContainText('projects.update');

    await page.getByLabel('Filter by action').selectOption('projects.update');
    await expect(page.locator('.data-table tbody tr')).not.toHaveCount(0);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export CSV/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^activity-log-\d{4}-\d{2}-\d{2}\.csv$/);
    await page.getByLabel('Search activity').fill('no-such-activity-marker');
    await expect(page.getByText('No activity matches these filters.')).toBeVisible();
  });

  test('reorders projects via API and verifies the public DOM order', async ({ page }) => {
    const items = await listProjects(api);
    const published = items.filter((item) => item.visibility === 'published' && !item.deletedAt);
    const publishedIds = published.map((item) => String(item.id));
    originalProjectIds = [...publishedIds];

    const titlesById = new Map(published.map((item) => [String(item.id), String(item.title)]));
    const reversedIds = [...publishedIds].reverse();
    const expectedTitles = reversedIds.map((id) => titlesById.get(id) ?? '');

    await reorderProjects(api, reversedIds);

    await expect.poll(() => getPublicHtml(api).then(projectTitlesFromHtml), { timeout: 30000 }).toEqual(expectedTitles);
    await page.goto('/');
    await expect(page.locator('#projects .project-card h3')).toHaveText(expectedTitles, { timeout: 30000 });
  });

  test('edits About via /admin/about, verifies public text and restores it', async ({ page }) => {
    const original = await getAbout(api);
    originalIntro = String(original.intro ?? '');
    const marker = `E2E about verification ${runId}`;

    await page.goto('/admin/about');
    await page.locator('#intro').fill(marker);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.status-text')).toContainText('Saved');

    await expect.poll(() => getPublicHtml(api), { timeout: 30000 }).toContain(marker);
    await page.goto('/');
    await expect(page.locator('#about .lede[data-fill]')).toContainText(marker);

    await patchAbout(api, { intro: originalIntro });
    if (originalIntro) {
      await expect.poll(() => getPublicHtml(api), { timeout: 30000 }).toContain(originalIntro);
    }
  });

  test('unpublishes and deletes the created test project', async () => {
    await patchProject(api, projectId, { visibility: 'unpublished' });
    await expect
      .poll(() => getPublicHtml(api).then(projectTitlesFromHtml), { timeout: 30000 })
      .not.toContain(title);

    await deleteProject(api, projectId);
    projectId = '';
    await expect
      .poll(() => getPublicHtml(api).then(projectTitlesFromHtml), { timeout: 30000 })
      .not.toContain(title);
  });
});
