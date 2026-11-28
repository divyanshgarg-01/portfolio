import { expect, test } from '@playwright/test';

test('static portfolio matches the master structure and assets', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(5500);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  await expect(page.locator('h1')).toHaveText(/DIVYANSH\s+GARG/);
  expect(await page.locator('main > section').count()).toBe(12);
  expect(await page.locator('.certificate-card').count()).toBe(8);
  expect(await page.locator('a').filter({ hasText: 'View Certificate' }).count()).toBe(8);
  expect(await page.locator('a').filter({ hasText: 'Verify Credential' }).count()).toBe(7);

  const computed = await page.evaluate(() => ({
    bodyColor: getComputedStyle(document.body).color,
    heroFontSize: getComputedStyle(document.querySelector('h1')!).fontSize,
    certDisplay: getComputedStyle(document.querySelector('[data-certificate-rail]')!).display,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(computed.bodyColor).toBe('rgb(229, 229, 231)');
  expect(computed.heroFontSize).toBe('204.48px');
  expect(computed.certDisplay).toBe('flex');
  expect(computed.overflow).toBe(0);

  const cv = await page.request.get('/portfolio/uploads/resume/Divyansh_Garg_CV.pdf');
  expect(cv.status()).toBe(200);
  expect(cv.headers()['content-type']).toContain('application/pdf');
});
