const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MASTER_URL = process.env.MASTER_URL || 'http://127.0.0.1:3107/';
const STATIC_URL = process.env.STATIC_URL || 'http://127.0.0.1:4173/portfolio/';
const OUT_DIR = path.resolve(__dirname, '..', 'comparison');
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, reducedMotion: 'no-preference' },
];

async function settle(page, ms = 650) {
  await page.waitForTimeout(ms);
}

async function scrollToSelector(page, selector) {
  const found = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'instant', block: 'start' });
    return true;
  }, selector);
  await settle(page, 700);
  return found;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const visible = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
    };
    return {
      scrollX: Math.round(scrollX * 100) / 100,
      scrollY: Math.round(scrollY * 100) / 100,
      introPending: document.documentElement.hasAttribute('data-intro'),
      motionReady: document.documentElement.classList.contains('motion-ready'),
      heroIntent: document.documentElement.getAttribute('data-hero-intent'),
      dialogOpen: document.querySelector('dialog')?.open ?? false,
      dialogTitle: text('[data-lightbox-title]'),
      dialogSrc: document.querySelector('[data-lightbox-image]')?.getAttribute('src') || '',
      copyLabel: text('[data-copy-label]'),
      searchValue: document.querySelector('input')?.value || '',
      approach: Array.from(document.querySelectorAll('[role="tab"]')).map((el) => ({ text: el.textContent.trim(), selected: el.getAttribute('aria-selected'), classes: el.className })),
      filters: Array.from(document.querySelectorAll('.archive__filter')).map((el) => ({ text: el.textContent.replace(/\s+/g, ' ').trim(), classes: el.className })),
      projectsShown: text('.archive__count'),
      mobileMenu: {
        open: document.querySelector('[data-menu]')?.getAttribute('data-open') || '',
        visible: visible('[data-menu]'),
      },
      sections: Array.from(document.querySelectorAll('main > section')).map((s) => ({ id: s.id || s.className, top: Math.round(s.getBoundingClientRect().top * 100) / 100 })),
      currently: text('[data-currently]'),
    };
  });
}

async function run(url, config, browser) {
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.dpr,
    reducedMotion: config.reducedMotion,
  });
  const page = await context.newPage();
  const states = {};
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 30000 });
  await page.waitForTimeout(5500);
  states.final = await snapshot(page);

  const step = async (name, fn) => {
    try {
      await fn();
      states[name] = await snapshot(page);
    } catch (error) {
      errors.push(`${name}: ${error}`);
    }
  };

  await step('navHover', async () => { await scrollToSelector(page, '#top'); await page.locator('[data-nav-link]').first().hover(); await settle(page, 350); });
  await step('heroCtaHover', async () => { await scrollToSelector(page, '#top'); await page.locator('.hero__actions a').first().hover(); await settle(page, 350); });
  if (config.name !== 'desktop' && config.name !== 'desktop-reduced-motion') {
    await step('mobileMenuOpen', async () => { await page.locator('[data-menu-btn]').click(); await settle(page, 500); });
    await step('mobileMenuClosed', async () => { await page.keyboard.press('Escape'); await settle(page, 400); });
  }
  await step('experienceAccordion', async () => { await scrollToSelector(page, '#experience'); await page.locator('[data-accordion]').first().click(); await settle(page, 650); });
  await step('approachTab', async () => { await scrollToSelector(page, '#approach'); await page.locator('[role="tab"]').nth(1).click(); await settle(page, 500); });
  await step('projectFilter', async () => { await scrollToSelector(page, '#projects'); await page.locator('.archive__filter').filter({ hasText: 'Research' }).first().click(); await settle(page, 600); });
  await step('projectSearch', async () => { await scrollToSelector(page, '#projects'); await page.locator('input').first().fill('PyBe'); await settle(page, 600); });
  await step('certRailScrolled', async () => { await scrollToSelector(page, '#certifications'); await page.evaluate(() => { const rail = document.querySelector('[data-certificate-rail]'); if (rail) rail.scrollLeft = Math.min(500, rail.scrollWidth - rail.clientWidth); }); await settle(page, 500); });
  await step('certificateLinkHover', async () => { await scrollToSelector(page, '#certifications'); await page.locator('a').filter({ hasText: 'View Certificate' }).first().hover(); await settle(page, 350); });
  await step('skillsSecondGroup', async () => { await scrollToSelector(page, '#skills'); await page.locator('[data-skill-nav]').nth(1).click(); await settle(page, 650); });
  await step('achievementLightbox', async () => { await scrollToSelector(page, '#achievements'); const openers = page.locator('[data-lightbox-open]'); if (await openers.count()) { await openers.first().click(); await settle(page, 600); } });
  await step('achievementLightboxClosed', async () => { await page.keyboard.press('Escape'); await settle(page, 400); });
  await step('terminalOpen', async () => { await scrollToSelector(page, '#top'); await page.keyboard.press('Backquote'); await settle(page, 500); });
  await step('terminalClosed', async () => { await page.keyboard.press('Escape'); await settle(page, 400); });
  await step('copyEmail', async () => { await scrollToSelector(page, '#contact'); await page.locator('[data-copy-email]').click(); await settle(page, 150); });
  await step('floatingCta', async () => { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await settle(page, 900); });

  await context.close();
  return { states, errors };
}

function diff(a, b, prefix = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], prefix ? `${prefix}.${key}` : key, out);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${prefix}[${i}]`, out);
    return out;
  }
  out.push({ path: prefix, master: a, static: b });
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = { masterUrl: MASTER_URL, staticUrl: STATIC_URL, viewports: [] };
  for (const config of VIEWPORTS) {
    const master = await run(MASTER_URL, config, browser);
    const staticData = await run(STATIC_URL, config, browser);
    const differences = [];
    for (const name of new Set([...Object.keys(master.states), ...Object.keys(staticData.states)])) {
      diff(master.states[name] || {}, staticData.states[name] || {}, name, differences);
    }
    report.viewports.push({ name: config.name, differences, masterStates: master.states, staticStates: staticData.states, masterErrors: master.errors, staticErrors: staticData.errors });
    console.log(`\n${config.name}: ${differences.length} state differences`);
    for (const d of differences.slice(0, 100)) console.log(`  ${d.path}\n    master=${JSON.stringify(d.master)}\n    static=${JSON.stringify(d.static)}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'interaction-diff.json'), JSON.stringify(report, null, 2));
})().catch((error) => { console.error('INTERACTION_DIFF_FAILED', error); process.exit(1); });
