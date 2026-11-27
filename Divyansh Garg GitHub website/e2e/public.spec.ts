import { expect, test } from '@playwright/test';
import { DRAFT_ONLY_MARKER } from './helpers/fixtures';

test.describe('public site', () => {
  test('server-rendered HTML has published placeholder content, one h1 and no draft marker', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok(), 'the public home page should render').toBeTruthy();
    const html = await response.text();

    // These strings come from the published placeholder content, not from a draft.
    expect(html).toContain('DIVYANSH GARG');
    expect(html).toContain('This biography is a draft placeholder.');
    expect(html).toContain('Cynorva');

    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).not.toContain(DRAFT_ONLY_MARKER);
    expect(html).not.toContain('Draft preview — not public.');
  });

  for (const width of [1440, 1024, 768, 390, 320]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('#projects')).toBeVisible();

      const metrics = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        // The pinned project gallery and the certificate rail deliberately extend
        // past the viewport inside their own scroll containers; everything else
        // should fit. Document-level overflow is asserted separately below.
        const intentionallyClipped =
          '[aria-hidden="true"], [data-work-track], [data-certificate-rail], .rail, #mobile-menu, .loader, .skip-link';
        const selector = 'main > section, footer.footer, h1, h2, h3, p, a, button, strong, li';
        const offenders: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>(selector)) {
          if (element.closest(intentionallyClipped)) continue;
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right > viewportWidth + 1 || rect.left < -1) {
            offenders.push(`${element.tagName}: ${(element.textContent ?? '').trim().slice(0, 60)}`);
          }
        }
        const scrollWidth = document.documentElement.scrollWidth;
        window.scrollTo(9999, 0);
        return { offenders: offenders.slice(0, 10), scrollWidth, scrollX: window.scrollX };
      });
      expect(metrics.offenders).toEqual([]);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(width + 1);
      expect(metrics.scrollX).toBeLessThanOrEqual(1);
    });
  }

  test.describe('reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('all content is visible and no loader is mounted', async ({ page }) => {
      await page.goto('/');

      await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
      await expect(page.locator('.loader')).toHaveCount(0);

      for (const id of ['top', 'about', 'education', 'experience', 'projects', 'certifications', 'skills', 'achievements', 'contact']) {
        await expect(page.locator(`section#${id}`)).toBeVisible();
      }
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('#projects .project-card')).not.toHaveCount(0);
      await expect(page.locator('#about .lede[data-fill]')).toBeVisible();
    });
  });
});
