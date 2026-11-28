const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const STATIC_URL = process.env.STATIC_URL || 'http://localhost:4173/portfolio/';
const BASELINE_DIR = path.resolve(__dirname, '..', 'baseline', 'screenshots');
const OUT_DIR = path.resolve(__dirname, '..', 'comparison');
const STATIC_DIR = path.join(OUT_DIR, 'static');
const DIFF_DIR = path.join(OUT_DIR, 'diffs');
fs.mkdirSync(STATIC_DIR, { recursive: true });
fs.mkdirSync(DIFF_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, reducedMotion: 'no-preference' },
  { name: 'tablet', width: 834, height: 1112, dpr: 2, reducedMotion: 'no-preference' },
  { name: 'mobile', width: 390, height: 844, dpr: 3, reducedMotion: 'no-preference' },
  { name: 'desktop-reduced-motion', width: 1440, height: 900, dpr: 1, reducedMotion: 'reduce' },
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

async function shot(page, name, fullPage = false) {
  const file = path.join(STATIC_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

function comparePng(referencePath, actualPath, diffPath) {
  const reference = PNG.sync.read(fs.readFileSync(referencePath));
  const actual = PNG.sync.read(fs.readFileSync(actualPath));
  if (reference.width !== actual.width || reference.height !== actual.height) {
    return { mismatched: true, reason: 'dimensions', reference: [reference.width, reference.height], actual: [actual.width, actual.height], differentPixels: null, ratio: 1 };
  }
  const diff = new PNG({ width: reference.width, height: reference.height });
  const differentPixels = pixelmatch(reference.data, actual.data, diff.data, reference.width, reference.height, {
    threshold: 0.12,
    includeAA: false,
  });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return {
    mismatched: false,
    reference: [reference.width, reference.height],
    actual: [actual.width, actual.height],
    differentPixels,
    ratio: differentPixels / (reference.width * reference.height),
  };
}

async function capture(config, browser, report) {
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.dpr,
    reducedMotion: config.reducedMotion,
  });
  const page = await context.newPage();
  const record = { name: config.name, comparisons: [], consoleErrors: [], pageErrors: [], httpErrors: [], requestFailures: [] };
  page.on('console', (msg) => { if (msg.type() === 'error') record.consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => record.pageErrors.push(String(err)));
  page.on('response', (res) => { if (res.status() >= 400) record.httpErrors.push({ url: res.url(), status: res.status() }); });
  page.on('requestfailed', (req) => record.requestFailures.push({ url: req.url(), failure: req.failure()?.errorText || '' }));

  const compareShot = async (state, fullPage = false) => {
    const name = `${config.name}--${state}`;
    const referencePath = path.join(BASELINE_DIR, `${name}.png`);
    const actualPath = await shot(page, name, fullPage);
    if (!fs.existsSync(referencePath)) {
      record.comparisons.push({ state, status: 'missing-reference' });
      return;
    }
    const result = comparePng(referencePath, actualPath, path.join(DIFF_DIR, `${name}-diff.png`));
    record.comparisons.push({ state, status: result.mismatched ? 'dimension-mismatch' : 'compared', ...result });
  };

  await page.goto(STATIC_URL, { waitUntil: 'domcontentloaded' });
  await compareShot('00-initial-load');
  await page.waitForTimeout(250);
  await compareShot('01-preloader');
  await page.waitForTimeout(750);
  await compareShot('02-hero-animating');
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 30000 });
  await page.waitForTimeout(4500);
  await compareShot('03-hero-final');
  await compareShot('04-full-page', true);

  const sections = [
    ['#top', 'hero'], ['.marquee', 'marquee'], ['#about', 'about'], ['#education', 'education'],
    ['#experience', 'experience'], ['#approach', 'approach'], ['#projects', 'projects'],
    ['#certifications', 'certifications'], ['#skills', 'skills'], ['#achievements', 'achievements'],
    ['#community', 'community'], ['#contact', 'contact'], ['.footer', 'footer'],
  ];
  for (const [selector, label] of sections) {
    if (await scrollToSelector(page, selector)) await compareShot(`section-${label}`);
  }

  const safe = async (label, fn) => {
    try {
      await fn();
      await compareShot(`state-${label}`);
    } catch (error) {
      record[`interactionError_${label}`] = String(error);
    }
  };

  await safe('nav-hover', async () => {
    await scrollToSelector(page, '#top');
    await page.locator('[data-nav-link]').first().hover();
    await settle(page, 350);
  });
  await safe('hero-cta-hover', async () => {
    await scrollToSelector(page, '#top');
    await page.locator('.hero__actions a').first().hover();
    await settle(page, 350);
  });
  if (config.name !== 'desktop' && config.name !== 'desktop-reduced-motion') {
    await safe('mobile-menu-open', async () => {
      await page.locator('[data-menu-btn]').click();
      await settle(page, 500);
    });
    await safe('mobile-menu-closed', async () => {
      await page.keyboard.press('Escape');
      await settle(page, 400);
    });
  }
  await safe('experience-accordion-open', async () => {
    await scrollToSelector(page, '#experience');
    await page.locator('[data-accordion]').first().click();
    await settle(page, 650);
  });
  await safe('approach-second-tab', async () => {
    await scrollToSelector(page, '#approach');
    await page.locator('[role="tab"]').nth(1).click();
    await settle(page, 500);
  });
  await safe('project-filter-research', async () => {
    await scrollToSelector(page, '#projects');
    await page.locator('.archive__filter').filter({ hasText: 'Research' }).first().click();
    await settle(page, 600);
  });
  await safe('project-search-pybe', async () => {
    await scrollToSelector(page, '#projects');
    await page.locator('input').first().fill('PyBe');
    await settle(page, 600);
  });
  await safe('certification-rail-scrolled', async () => {
    await scrollToSelector(page, '#certifications');
    await page.evaluate(() => {
      const rail = document.querySelector('[data-certificate-rail]');
      if (rail) rail.scrollLeft = Math.min(500, rail.scrollWidth - rail.clientWidth);
    });
    await settle(page, 500);
  });
  await safe('certificate-link-hover', async () => {
    await scrollToSelector(page, '#certifications');
    await page.locator('a[href*="uploads/achievements/"], a[href^="/api/certificates/"]').first().hover();
    await settle(page, 350);
  });
  await safe('skills-second-group', async () => {
    await scrollToSelector(page, '#skills');
    await page.locator('[data-skill-nav]').nth(1).click();
    await settle(page, 650);
  });
  await safe('achievement-lightbox', async () => {
    await scrollToSelector(page, '#achievements');
    const openers = page.locator('[data-lightbox-open]');
    if (await openers.count()) {
      await openers.first().click();
      await settle(page, 600);
    }
  });
  await safe('achievement-lightbox-closed', async () => {
    await page.keyboard.press('Escape');
    await settle(page, 400);
  });
  await safe('terminal-open', async () => {
    await scrollToSelector(page, '#top');
    await page.keyboard.press('Backquote');
    await settle(page, 500);
  });
  await safe('terminal-closed', async () => {
    await page.keyboard.press('Escape');
    await settle(page, 400);
  });
  await safe('copy-email-feedback', async () => {
    await scrollToSelector(page, '#contact');
    await page.locator('[data-copy-email]').click();
    await settle(page, 150);
  });
  await safe('floating-cta-visible', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settle(page, 900);
  });

  report.viewports.push(record);
  await context.close();
}

(async () => {
  const report = { capturedAt: new Date().toISOString(), staticUrl: STATIC_URL, viewports: [] };
  const browser = await chromium.launch({ headless: true });
  for (const config of VIEWPORTS) await capture(config, browser, report);
  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'compare-report.json'), JSON.stringify(report, null, 2));
  const comparisons = report.viewports.flatMap((v) => v.comparisons);
  const meaningful = comparisons.filter((c) => c.ratio && c.ratio > 0.005);
  console.log(`COMPARISON_DONE comparisons=${comparisons.length} meaningful_mismatches=${meaningful.length}`);
})().catch((error) => {
  console.error('COMPARISON_FAILED', error);
  process.exit(1);
});
