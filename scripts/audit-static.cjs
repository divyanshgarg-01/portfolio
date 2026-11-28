const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const STATIC_URL = process.env.STATIC_URL || 'http://127.0.0.1:4173/portfolio/';
const OUT_FILE = path.resolve(__dirname, '..', 'comparison', 'static-audit.json');
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, reducedMotion: 'no-preference' },
  { name: 'tablet', width: 834, height: 1112, dpr: 2, reducedMotion: 'no-preference' },
  { name: 'mobile', width: 390, height: 844, dpr: 3, reducedMotion: 'no-preference' },
  { name: 'desktop-reduced-motion', width: 1440, height: 900, dpr: 1, reducedMotion: 'reduce' },
];

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
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      body: pick('body', ['background-color', 'color', 'font-family', 'font-size', 'overflow-x']),
      h1: pick('h1', ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color']),
      heroSub: pick('.hero__sub .lede', ['font-family', 'font-size', 'line-height', 'color']),
      nav: pick('.site-nav', ['background-color', 'border-bottom-color', 'padding-top', 'padding-bottom']),
      certRail: pick('[data-certificate-rail]', ['display', 'flex-wrap', 'overflow-x', 'gap']),
      certCard: pick('.certificate-card', ['width', 'min-width', 'padding', 'border-color', 'background-color']),
      tagline: text('.hero__sub .lede'),
      h1Text: text('h1'),
      sectionOrder: Array.from(document.querySelectorAll('main > section')).map((s) => s.id || s.className),
      certificateCount: document.querySelectorAll('.certificate-card').length,
      viewCertificateLinks: anchors.filter((a) => a.textContent.includes('View Certificate')).length,
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
      sectionText: {
        about: text('#about'),
        education: text('#education'),
        experience: text('#experience'),
        approach: text('#approach'),
        projects: text('#projects'),
        certifications: text('#certifications'),
        skills: text('#skills'),
        achievements: text('#achievements'),
        community: text('#community'),
        contact: text('#contact'),
      },
      certificateTitles: Array.from(document.querySelectorAll('.certificate-card h3, .certificate-card h4, .certificate-card strong')).map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
      certificateHrefs: anchors.filter((a) => a.textContent.includes('View Certificate')).map((a) => a.getAttribute('href')),
    };
  });
}

async function checkAssets(page) {
  const paths = ['/portfolio/uploads/resume/Divyansh_Garg_CV.pdf'];
  const certHref = await page.locator('a').filter({ hasText: 'View Certificate' }).first().getAttribute('href').catch(() => null);
  if (certHref) paths.push(certHref);
  const portrait = '/portfolio/uploads/profile/divyansh-portrait-reveal.webp';
  paths.push(portrait);
  const results = [];
  for (const assetPath of paths) {
    try {
      const response = await page.request.get(new URL(assetPath, STATIC_URL).href);
      results.push({ path: assetPath, status: response.status(), contentType: response.headers()['content-type'] || '', ok: response.ok() });
    } catch (error) {
      results.push({ path: assetPath, error: String(error) });
    }
  }
  return results;
}

(async () => {
  const report = { auditedAt: new Date().toISOString(), staticUrl: STATIC_URL, viewports: [] };
  const browser = await chromium.launch({ headless: true });
  for (const config of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: config.dpr,
      reducedMotion: config.reducedMotion,
    });
    const page = await context.newPage();
    const record = { name: config.name, consoleErrors: [], pageErrors: [], httpErrors: [], requestFailures: [] };
    page.on('console', (msg) => { if (msg.type() === 'error') record.consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => record.pageErrors.push(String(err)));
    page.on('response', (res) => { if (res.status() >= 400) record.httpErrors.push({ url: res.url(), status: res.status() }); });
    page.on('requestfailed', (req) => record.requestFailures.push({ url: req.url(), failure: req.failure()?.errorText || '' }));
    await page.goto(STATIC_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 30000 });
    await page.waitForTimeout(5500);
    record.computed = await collectComputed(page);
    record.assets = await checkAssets(page);
    report.viewports.push(record);
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`AUDIT_DONE viewports=${report.viewports.length}`);
})().catch((error) => {
  console.error('AUDIT_FAILED', error);
  process.exit(1);
});
