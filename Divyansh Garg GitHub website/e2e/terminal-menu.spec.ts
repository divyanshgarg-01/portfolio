import { expect, test } from '@playwright/test';

test('backtick opens the terminal, help prints commands and Escape closes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.loader')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-motion', /on|off/);

  const terminal = page.getByRole('dialog', { name: 'Portfolio terminal' });
  await expect(terminal).toHaveCount(0);

  await page.keyboard.press('Backquote');
  await expect(terminal).toBeVisible();

  const command = page.getByLabel('Terminal command');
  await command.fill('help');
  await command.press('Enter');
  await expect(terminal.locator('.terminal__output')).toContainText('available commands:');

  await page.keyboard.press('Escape');
  await expect(terminal).toHaveCount(0);
});

test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('menu opens and Escape closes it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.loader')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-motion', /on|off/);
    await expect(page.locator('html')).toHaveClass(/motion-ready/);

    await page.getByRole('button', { name: 'Open menu' }).click();
    const panel = page.locator('#mobile-menu');
    await expect(panel).toHaveClass(/is-open/);
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).not.toHaveClass(/is-open/);
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
