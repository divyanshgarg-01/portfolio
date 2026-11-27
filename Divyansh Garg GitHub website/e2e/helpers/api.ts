import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { adminCredentials } from './credentials';

export type JsonRecord = Record<string, unknown>;

/** page.request shares the browser context cookie jar, so admin APIs reuse the UI session. */
export const apiFor = (page: Page): APIRequestContext => page.request;

export async function loginWithApi(api: APIRequestContext): Promise<void> {
  const { email, password } = adminCredentials();
  // Each API login gets an isolated trusted-proxy identity so the shared E2E
  // fixture does not trip the real login throttling limit after a few suites.
  // Production clients cannot set this header unless it comes from their proxy.
  const response = await api.post('/api/auth/login', {
    data: { email, password },
    headers: { 'x-real-ip': randomUUID() },
  });
  expect(response.status(), 'API login should succeed').toBe(200);
}

export async function createProject(api: APIRequestContext, data: JsonRecord): Promise<JsonRecord> {
  const response = await api.post('/api/admin/projects', { data });
  if (response.status() !== 201) {
    const body = await response.text();
    throw new Error(`project creation returned ${response.status()}: ${body}`);
  }
  expect(response.status(), 'project creation should return 201').toBe(201);
  const body = (await response.json()) as { item: JsonRecord };
  return body.item;
}

export async function patchProject(api: APIRequestContext, id: string, patch: JsonRecord): Promise<JsonRecord> {
  const response = await api.patch(`/api/admin/projects/${id}`, { data: patch });
  expect(response.ok(), 'project update should succeed').toBeTruthy();
  const body = (await response.json()) as { item: JsonRecord };
  return body.item;
}

export async function deleteProject(api: APIRequestContext, id: string, allowMissing = false): Promise<void> {
  const response = await api.delete(`/api/admin/projects/${id}`);
  if (allowMissing && response.status() === 404) return;
  expect(response.ok(), 'project deletion should succeed').toBeTruthy();
}

export async function listProjects(api: APIRequestContext): Promise<JsonRecord[]> {
  const response = await api.get('/api/admin/projects');
  expect(response.ok(), 'project list should be readable').toBeTruthy();
  const body = (await response.json()) as { items: JsonRecord[] };
  return body.items;
}

export async function reorderProjects(api: APIRequestContext, ids: string[]): Promise<void> {
  const response = await api.post('/api/admin/reorder', { data: { collection: 'projects', ids } });
  expect(response.ok(), 'project reorder should succeed').toBeTruthy();
}

export async function createPreview(api: APIRequestContext, collection: string, id: string): Promise<string> {
  const response = await api.post('/api/preview', { data: { collection, id } });
  expect(response.ok(), 'preview token creation should succeed').toBeTruthy();
  const body = (await response.json()) as { url: string };
  return body.url;
}

export async function getAbout(api: APIRequestContext): Promise<JsonRecord> {
  const response = await api.get('/api/admin/singletons/about');
  expect(response.ok(), 'about singleton should be readable').toBeTruthy();
  const body = (await response.json()) as { item: JsonRecord };
  return body.item;
}

export async function patchAbout(api: APIRequestContext, patch: JsonRecord): Promise<void> {
  // The singleton PATCH replaces the whole record, so merge with the current one.
  const current = await getAbout(api);
  const response = await api.patch('/api/admin/singletons/about', { data: { ...current, ...patch } });
  expect(response.ok(), 'about update should succeed').toBeTruthy();
}

export async function getPublicHtml(api: APIRequestContext): Promise<string> {
  const response = await api.get('/');
  expect(response.ok(), 'public home page should render').toBeTruthy();
  return response.text();
}

/** Extracts the ordered project headings from the server-rendered projects section. */
export function projectTitlesFromHtml(html: string): string[] {
  const start = html.indexOf('id="projects"');
  if (start < 0) return [];
  // The projects section is followed by certifications, not skills. Scope to
  // the next section marker after projects so certificate headings are not
  // counted as projects.
  const remaining = html.slice(start + 1);
  const nextSection = remaining.search(/<section[^>]+id="(?:certifications|skills|achievements)"/);
  const end = nextSection >= 0 ? start + 1 + nextSection : html.length;
  const section = html.slice(start, end);
  return Array.from(section.matchAll(/<h3 class="h3">([\s\S]*?)<\/h3>/g), (match) => match[1].trim());
}
