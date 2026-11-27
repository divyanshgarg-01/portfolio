const { chromium } = require('@playwright/test');
const { mkdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const BASE = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:3000';
const OUT = resolve('screenshots');
mkdirSync(OUT, { recursive: true });

function credentials() {
  const contents = readFileSync(resolve('.env.local'), 'utf8');
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = /^(ADMIN_EMAIL|ADMIN_PASSWORD)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2].trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    values[match[1] === 'ADMIN_EMAIL' ? 'email' : 'password'] = value;
  }
  return values;
}

async function overflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = '[aria-hidden="true"], [data-work-track], [data-certificate-rail], .rail, #mobile-menu, .loader, .skip-link';
    const selector = 'main > section, footer.footer, h1, h2, h3, p, a, button, strong, li';
    const offenders = [];
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest(clipped)) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right > width + 1 || rect.left < -1) offenders.push(`${el.tagName}: ${(el.textContent || '').trim().slice(0, 60)}`);
    }
    return { width, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 5) };
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const errors = [];

  for (const width of [1440, 1280, 1024, 900, 768, 600, 390, 320]) {
    console.log(`capturing ${width}px`);
    const page = await browser.newPage({ viewport: { width, height: 900 }, extraHTTPHeaders: { Origin: BASE } });
    page.on('pageerror', (error) => errors.push(`${width}px: ${error.message}`));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('html[data-motion]').waitFor();
    await page.waitForTimeout(1200);
    const metrics = await overflow(page);
    await page.screenshot({ path: resolve(OUT, `public-${width}.png`), fullPage: true });
    results.push({ width, ...metrics });
    await page.close();
  }

  console.log('capturing terminal interaction');
  const interactions = await browser.newPage({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { Origin: BASE } });
  await interactions.goto(BASE, { waitUntil: 'domcontentloaded' });
  await interactions.keyboard.press('Backquote');
  await interactions.getByRole('dialog', { name: 'Portfolio terminal' }).waitFor();
  await interactions.screenshot({ path: resolve(OUT, 'terminal-1440.png') });
  await interactions.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { Origin: BASE } });
  await mobile.goto(BASE, { waitUntil: 'domcontentloaded' });
  await mobile.locator('html[data-motion]').waitFor();
  await mobile.getByRole('button', { name: 'Open menu' }).click();
  await mobile.locator('#mobile-menu.is-open').waitFor();
  await mobile.screenshot({ path: resolve(OUT, 'mobile-menu-390.png') });
  await mobile.close();

  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', extraHTTPHeaders: { Origin: BASE } });
  await reduced.goto(BASE, { waitUntil: 'domcontentloaded' });
  await reduced.locator('html[data-motion="off"]').waitFor();
  await reduced.screenshot({ path: resolve(OUT, 'reduced-motion-1440.png'), fullPage: true });
  await reduced.close();

  const admin = await browser.newPage({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { Origin: BASE } });
  await admin.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await admin.locator('form[data-ready="true"]').waitFor();
  await admin.screenshot({ path: resolve(OUT, 'admin-login-390.png') });
  const { email, password } = credentials();
  await admin.locator('#email').fill(email);
  await admin.locator('#password').fill(password);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.waitForURL(/\/admin$/);
  await admin.screenshot({ path: resolve(OUT, 'admin-dashboard-390.png'), fullPage: true });
  await admin.goto(`${BASE}/admin/activity`, { waitUntil: 'domcontentloaded' });
  await admin.getByRole('heading', { name: 'Activity log' }).waitFor();
  await admin.screenshot({ path: resolve(OUT, 'admin-activity-390.png'), fullPage: true });
  await admin.close();

  console.log(JSON.stringify({ results, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
