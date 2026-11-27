import { expect, test, type APIRequestContext } from '@playwright/test';
import { loginWithApi } from './helpers/api';
import { uniqueRunId } from './helpers/fixtures';

test.describe.configure({ mode: 'serial' });

function tinyPdf(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
    + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\n'
    + 'trailer<</Root 1 0 R>>\n%%EOF\n',
    'utf8',
  );
}

async function uploadCertificatePdf(api: APIRequestContext, name: string): Promise<Record<string, unknown>> {
  const response = await api.post('/api/admin/media', {
    multipart: {
      file: { name, mimeType: 'application/pdf', buffer: tinyPdf() },
      folder: 'achievements',
    },
  });
  expect(response.status(), 'certificate PDF upload should succeed').toBe(201);
  const body = (await response.json()) as { item: Record<string, unknown> };
  return body.item;
}

async function createCertificate(api: APIRequestContext, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await api.post('/api/admin/achievements', { data });
  if (response.status() !== 201) throw new Error(`certificate creation returned ${response.status()}: ${await response.text()}`);
  const body = (await response.json()) as { item: Record<string, unknown> };
  return body.item;
}

async function adminCertificate(api: APIRequestContext, id: string): Promise<Record<string, unknown>> {
  const response = await api.get(`/api/admin/achievements/${id}`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { item: Record<string, unknown> }).item;
}

test.describe('Certifications CMS and public file access (local SQLite)', () => {
  const runId = uniqueRunId();
  const title = `E2E Certificate ${runId}`;
  const credentialId = `E2E-CRED-${runId}`;
  let certificateId = '';
  let assetId = '';

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' } });
    await loginWithApi(context.request);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' } });
    await loginWithApi(context.request).catch(() => undefined);
    if (certificateId) {
      await context.request.delete(`/api/admin/achievements/${certificateId}`).catch(() => undefined);
    }
    if (assetId) {
      await context.request.delete(`/api/admin/media/${assetId}`).catch(() => undefined);
    }
    await context.close();
  });

  test('validates invalid certificate data before any database write', async ({ page }) => {
    await loginWithApi(page.request);
    const invalidDate = await page.request.post('/api/admin/achievements', {
      data: { type: 'certificate', title: `Invalid date ${runId}`, issueDate: 'next year', visibility: 'draft' },
    });
    expect(invalidDate.status()).toBe(400);
    expect(((await invalidDate.json()) as { errors: Record<string, string> }).errors.issueDate).toBe('Use a valid date');

    const invalidExpiry = await page.request.post('/api/admin/achievements', {
      data: { type: 'certificate', title: `Invalid expiry ${runId}`, expiryDate: 'next year', visibility: 'draft' },
    });
    expect(invalidExpiry.status()).toBe(400);
    expect(((await invalidExpiry.json()) as { errors: Record<string, string> }).errors.expiryDate).toBe('Use a valid date');

    const invalidType = await page.request.post('/api/admin/achievements', {
      data: { type: 'badge', title: `Invalid type ${runId}`, visibility: 'draft' },
    });
    expect(invalidType.status()).toBe(400);
    expect(((await invalidType.json()) as { errors: Record<string, string> }).errors.type).toBe('Choose a valid option');

    const invalidUrl = await page.request.post('/api/admin/achievements', {
      data: { type: 'certificate', title: `Invalid URL ${runId}`, verificationUrl: 'ftp://example.com', visibility: 'draft' },
    });
    expect(invalidUrl.status()).toBe(400);
    expect(((await invalidUrl.json()) as { errors: Record<string, string> }).errors.verificationUrl).toBe('Use a full http(s) URL');
  });

  test('creates, uploads, publishes, updates and reads a certificate through the API', async ({ page }) => {
    await loginWithApi(page.request);
    const asset = await uploadCertificatePdf(page.request, 'e2e-certificate.pdf');
    assetId = String(asset.id);
    expect(asset.mimeType).toBe('application/pdf');
    const directPdf = await page.request.get(String(asset.path));
    expect(directPdf.status(), 'private PDFs must not be reachable from the public uploads directory').toBe(404);

    const created = await createCertificate(page.request, {
      type: 'certificate',
      title,
      issuer: 'IIT Madras (E2E)',
      issueDate: '2024-01-15',
      expiryDate: '',
      credentialId,
      description: 'E2E certificate description',
      verificationUrl: 'https://example.com/verify/e2e',
      file: assetId,
      featured: false,
      visibility: 'draft',
      order: 999,
    });
    certificateId = String(created.id);

    const draft = await adminCertificate(page.request, certificateId);
    expect(draft.title).toBe(title);
    expect(draft.credentialId).toBe(credentialId);
    expect(draft.visibility).toBe('draft');

    const publicBefore = await page.request.get('/');
    expect(await publicBefore.text()).not.toContain(title);

    const publishedResponse = await page.request.patch(`/api/admin/achievements/${certificateId}`, {
      data: { visibility: 'published' },
    });
    expect(publishedResponse.ok()).toBeTruthy();
    expect((await adminCertificate(page.request, certificateId)).visibility).toBe('published');

    await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 30_000 }).toContain(title);
    const publicHtml = await (await page.request.get('/')).text();
    expect(publicHtml).toContain('IIT Madras (E2E)');
    expect(publicHtml).toContain(credentialId);
    expect(publicHtml).toContain('https://example.com/verify/e2e');
    expect(publicHtml).toContain(`/api/certificates/${certificateId}/file`);

    const replaceResponse = await page.request.patch(`/api/admin/media/${assetId}`, {
      multipart: {
        file: { name: 'e2e-certificate-replacement.pdf', mimeType: 'application/pdf', buffer: tinyPdf() },
      },
    });
    expect(replaceResponse.ok(), await replaceResponse.text()).toBeTruthy();
    expect(((await replaceResponse.json()) as { item: Record<string, unknown> }).item.id).toBe(assetId);

    const updatedResponse = await page.request.patch(`/api/admin/achievements/${certificateId}`, {
      data: { credentialId: `${credentialId}-updated`, expiryDate: '2027-01-15' },
    });
    expect(updatedResponse.ok(), await updatedResponse.text()).toBeTruthy();
    const updated = await adminCertificate(page.request, certificateId);
    expect(updated.credentialId).toBe(`${credentialId}-updated`);
    expect(updated.expiryDate).toBe('2027-01-15');
    await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 30_000 }).toContain(`${credentialId}-updated`);
    expect(await (await page.request.get('/')).text()).toContain('Expires 2027-01-15');
  });

  test('serves the published certificate file to anonymous visitors and hides it after unpublishing', async ({ browser }) => {
    const anonymous = await browser.newContext();
    const fileResponse = await anonymous.request.get(`/api/certificates/${certificateId}/file`);
    expect(fileResponse.status()).toBe(200);
    expect(fileResponse.headers()['content-type']).toContain('application/pdf');
    expect((await fileResponse.body()).subarray(0, 5).toString()).toBe('%PDF-');

    await loginWithApi(anonymous.request);
    const unpublish = await anonymous.request.patch(`/api/admin/achievements/${certificateId}`, {
      data: { visibility: 'unpublished' },
    });
    expect(unpublish.ok()).toBeTruthy();
    await anonymous.close();

    const publicContext = await browser.newContext();
    expect((await publicContext.request.get(`/api/certificates/${certificateId}/file`)).status()).toBe(404);
    await expect.poll(async () => (await publicContext.request.get('/')).text(), { timeout: 30_000 }).not.toContain(title);
    await publicContext.close();
  });

  test('reorders and deletes the certificate, then releases its unreferenced asset', async ({ page }) => {
    await loginWithApi(page.request);
    const certificates = ((await (await page.request.get('/api/admin/achievements')).json()) as { items: Record<string, unknown>[] }).items;
    const ids = certificates.filter((item) => item.type === 'certificate' && !item.deletedAt).map((item) => String(item.id));
    const reorder = await page.request.post('/api/admin/reorder', {
      data: { collection: 'achievements', ids },
    });
    expect(reorder.ok(), await reorder.text()).toBeTruthy();

    const removed = await page.request.delete(`/api/admin/achievements/${certificateId}`);
    expect(removed.ok()).toBeTruthy();
    expect((await page.request.get(`/api/admin/achievements/${certificateId}`)).status()).toBe(404);

    const released = await page.request.delete(`/api/admin/media/${assetId}`);
    expect(released.ok(), await released.text()).toBeTruthy();
    certificateId = '';
    assetId = '';
  });
});
