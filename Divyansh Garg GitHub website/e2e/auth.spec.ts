import { expect, test } from '@playwright/test';
import { loginWithApi } from './helpers/api';
import { adminCredentials } from './helpers/credentials';

test.describe('admin authentication', () => {
  test('signed-out /admin/projects redirects to /admin/login', async ({ page }) => {
    await page.goto('/admin/projects');

    await expect(page).toHaveURL(/\/admin\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get('next')).toBe('/admin/projects');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('login with .env.local credentials succeeds and logout returns to login', async ({ page }) => {
    const { email, password } = adminCredentials();

    await page.goto('/admin/login');
    await expect(page.locator('form[data-ready="true"]')).toBeVisible();
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();

    await page.getByRole('button', { name: /Sign out/ }).click();
    await expect(page).toHaveURL(/\/admin\/login/);

    // The session is actually invalidated, not just navigated away from.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('unauthenticated visitors cannot read or mutate admin APIs directly', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { Origin: 'http://127.0.0.1:3100' } });
    const api = context.request;

    expect((await api.get('/api/admin/achievements')).status()).toBe(401);
    expect((await api.get('/api/admin/media')).status()).toBe(401);
    expect((await api.get('/api/admin/singletons/settings')).status()).toBe(401);

    const created = await api.post('/api/admin/achievements', {
      data: { type: 'certificate', title: 'Unauthorised certificate' },
    });
    expect(created.status()).toBe(401);

    const uploaded = await api.post('/api/admin/media', {
      multipart: {
        file: { name: 'unauthorised.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') },
      },
    });
    expect(uploaded.status()).toBe(401);

    expect((await api.get('/api/media/not-a-real-asset/signed')).status()).toBe(401);
    await context.close();
  });

  test('password change rejects an incorrect current password', async ({ page }) => {
    await loginWithApi(page.request);
    const response = await page.request.post('/api/admin/account/password', {
      data: {
        currentPassword: 'definitely-not-the-current-password',
        newPassword: 'replacement-password-123',
      },
    });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('Current password');
  });
});
