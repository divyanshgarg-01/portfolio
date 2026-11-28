const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/divya/OneDrive/Desktop/Divyansh_Garg_Portfolio/Divyansh Garg GitHub website/node_modules/playwright');

const BASE_URL = process.env.BASELINE_URL || 'http://localhost:3107/';
const OUT_DIR = __dirname;
const SHOTS = path.join(OUT_DIR, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, reducedMotion: 'no-preference' },
  { name: 'tablet', width: 834, height: 1112, dpr: 2, reducedMotion: 'no-preference' },
  { name: 'mobile', width: 390, height: 844, dpr: 3, reducedMotion: 'no-preference' },
  { name: 'desktop-reduced-motion', width: 1440, height: 900, dpr: 1, reducedMotion: 'reduce' },
];

const manifest = {
  capturedAt: new Date().toISOString(),
  sourceUrl: BASE_URL,
  gitHead: process.env.BASELINE_HEAD || '',
  buildId: process.env.BASELINE_BUILD_ID || '',
  note: 'Master baseline captured from the untouched committed Next.js app using local ignored content/media.',
  viewports: [],
};

async function settle(page, ms = 650) {
  await page.waitForTimeout(ms);
}

async function shot(page, name, fullPage = false) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
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

async function checkAssets(page) {
  const paths = ['/uploads/resume/Divyansh_Garg_CV.pdf'];
  const certHref = await page.locator('a[href^="/api/certificates/"]').first().getAttribute('href').catch(() => null);
  if (certHref) paths.push(certHref);
  const achievementHref = await page.locator('a[href^="/api/achievements/"]').first().getAttribute('href').catch(() => null);
  if (achievementHref) paths.push(achievementHref);

  const results = [];
  for (const assetPath of paths) {
    try {
      const response = await page.request.get(new URL(assetPath, BASE_URL).href);
      results.push({
        path: assetPath,
        status: response.status(),
        contentType: response.headers()['content-type'] || '',
        ok: response.ok(),
      });
    } catch (error) {
      results.push({ path: assetPath, error: String(error) });
    }
  }
  return results;
}

async function collectComputed(page) {
  return page.evaluate(() => {
    const pick = (selector, props) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const result = {};
      for (const prop of props) result[prop] = cs.getPropertyValue(prop);
      return result;
    };
    const anchors = Array.from(document.querySelectorAll('a'));
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      body: pick('body', ['background-color', 'color', 'font-family', 'font-size', 'overflow-x']),
      h1: pick('h1', ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color']),
      heroSub: pick('.hero__sub .lede', ['font-family', 'font-size', 'line-height', 'color']),
      nav: pick('.site-nav', ['background-color', 'border-bottom-color', 'padding-top', 'padding-bottom']),
      certRail: pick('[data-certificate-rail]', ['display', 'flex-wrap', 'overflow-x', 'gap']),
      certCard: pick('.certificate-card', ['width', 'min-width', 'padding', 'border-color', 'background-color']),
      tagline: document.querySelector('.hero__sub .lede')?.textContent?.trim() || '',
      h1Text: document.querySelector('h1')?.textContent?.trim() || '',
      sectionOrder: Array.from(document.querySelectorAll('main > section')).map((s) => s.id || s.className),
      certificateCount: document.querySelectorAll('.certificate-card').length,
      viewCertificateLinks: anchors.filter((a) => a.getAttribute('href')?.startsWith('/api/certificates/')).length,
      verifyCredentialLinks: anchors.filter((a) => a.textContent.includes('Verify Credential')).length,
      fonts: {
        geist: document.fonts.check('16px Geist'),
        geistMono: document.fonts.check('16px "Geist Mono"'),
        fraunces: document.fonts.check('16px Fraunces'),
        instrumentSerif: document.fonts.check('italic 16px "Instrument Serif"'),
        playfair: document.fonts.check('italic 16px "Playfair Display"'),
      },
      overflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      motionReady: document.documentElement.classList.contains('motion-ready'),
      introPending: document.documentElement.hasAttribute('data-intro'),
      heroIntent: document.documentElement.getAttribute('data-hero-intent'),
    };
  });
}

async function captureViewport(config, browser) {
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.dpr,
    reducedMotion: config.reducedMotion,
  });
  const page = await context.newPage();
  const record = {
    name: config.name,
    width: config.width,
    height: config.height,
    dpr: config.dpr,
    reducedMotion: config.reducedMotion,
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    httpErrors: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') record.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => record.pageErrors.push(String(err)));
  page.on('requestfailed', (req) => record.requestFailures.push({ url: req.url(), failure: req.failure()?.errorText || '' }));
  page.on('response', (res) => {
    if (res.status() >= 400) record.httpErrors.push({ url: res.url(), status: res.status() });
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  record.screenshots.push(await shot(page, `${config.name}--00-initial-load`));
  await page.waitForTimeout(250);
  record.screenshots.push(await shot(page, `${config.name}--01-preloader`));
  await page.waitForTimeout(750);
  record.screenshots.push(await shot(page, `${config.name}--02-hero-animating`));
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 30000 });
  await page.waitForTimeout(4500);
  record.screenshots.push(await shot(page, `${config.name}--03-hero-final`));
  record.computed = await collectComputed(page);
  record.assets = await checkAssets(page);
  record.screenshots.push(await shot(page, `${config.name}--04-full-page`, true));

  const sections = [
    ['#top', 'hero'],
    ['.marquee', 'marquee'],
    ['#about', 'about'],
    ['#education', 'education'],
    ['#experience', 'experience'],
    ['#approach', 'approach'],
    ['#projects', 'projects'],
    ['#certifications', 'certifications'],
    ['#skills', 'skills'],
    ['#achievements', 'achievements'],
    ['#community', 'community'],
    ['#contact', 'contact'],
    ['.footer', 'footer'],
  ];

  for (const [selector, label] of sections) {
    const found = await scrollToSelector(page, selector);
    if (found) record.screenshots.push(await shot(page, `${config.name}--section-${label}`));
  }

  const safe = async (label, fn) => {
    try {
      await fn();
      record.screenshots.push(await shot(page, `${config.name}--state-${label}`));
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
    await page.locator('a[href^="/api/certificates/"]').first().hover();
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

  manifest.viewports.push(record);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const config of VIEWPORTS) {
    await captureViewport(config, browser);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'baseline-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`BASELINE_CAPTURE_DONE screenshots=${manifest.viewports.reduce((n, v) => n + v.screenshots.length, 0)}`);
})().catch((error) => {
  console.error('BASELINE_CAPTURE_FAILED', error);
  process.exit(1);
});
