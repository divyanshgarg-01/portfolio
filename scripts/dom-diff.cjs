const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MASTER_URL = process.env.MASTER_URL || 'http://127.0.0.1:3107/';
const STATIC_URL = process.env.STATIC_URL || 'http://127.0.0.1:4173/portfolio/';
const OUT_DIR = path.resolve(__dirname, '..', 'comparison');
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, reducedMotion: 'no-preference' },
  { name: 'tablet', width: 834, height: 1112, dpr: 2, reducedMotion: 'no-preference' },
  { name: 'mobile', width: 390, height: 844, dpr: 3, reducedMotion: 'no-preference' },
  { name: 'desktop-reduced-motion', width: 1440, height: 900, dpr: 1, reducedMotion: 'reduce' },
];

const SELECTORS = [
  'html', 'body', '#top', '.marquee', '#about', '#education', '#experience', '#approach',
  '#projects', '#certifications', '#skills', '#achievements', '#community', '#contact', '.footer',
  'h1', '.hero__sub .lede', '.site-nav', '[data-certificate-rail]', '.certificate-card',
  '[data-hero-lede]', '[data-chars]', '.profile-image', 'img', 'canvas',
];

async function collect(page, normalizePrefix) {
  return page.evaluate((prefix) => {
    const normalized = (value) => {
      if (typeof value !== 'string') return value;
      if (!prefix) return value;
      return value.split(`${prefix}/`).join('/');
    };
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100, width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 };
    };
    const style = (el, props) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = {};
      for (const prop of props) out[prop] = cs.getPropertyValue(prop);
      return out;
    };
    const selectors = ['html','body','#top','.marquee','#about','#education','#experience','#approach','#projects','#certifications','#skills','#achievements','#community','#contact','.footer','h1','.hero__sub .lede','.site-nav','[data-certificate-rail]','.certificate-card','[data-hero-lede]','[data-chars]','.profile-image'];
    const elements = {};
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      elements[selector] = {
        exists: Boolean(el),
        rect: rect(el),
        text: el ? el.textContent : null,
        style: style(el, ['display', 'font-family', 'font-size', 'line-height', 'letter-spacing', 'color', 'background-color', 'border-color', 'opacity', 'transform', 'overflow', 'gap', 'padding', 'margin']),
      };
    }
    return {
      htmlClass: document.documentElement.className,
      htmlAttrs: Array.from(document.documentElement.attributes).map((a) => [a.name, normalized(a.value)]),
      title: document.title,
      counts: {
        sections: document.querySelectorAll('main > section').length,
        certificateCards: document.querySelectorAll('.certificate-card').length,
        viewCertificateLinks: Array.from(document.querySelectorAll('a')).filter((a) => a.textContent.includes('View Certificate')).length,
        verifyCredentialLinks: Array.from(document.querySelectorAll('a')).filter((a) => a.textContent.includes('Verify Credential')).length,
        images: document.querySelectorAll('img').length,
        canvases: document.querySelectorAll('canvas').length,
        spans: document.querySelectorAll('span').length,
      },
      elements,
      images: Array.from(document.querySelectorAll('img')).map((img) => ({
        src: normalized(img.getAttribute('src') || ''),
        currentSrc: normalized(img.currentSrc || ''),
        alt: img.alt,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        rect: rect(img),
      })),
      canvases: Array.from(document.querySelectorAll('canvas')).map((canvas) => ({ width: canvas.width, height: canvas.height, rect: rect(canvas), className: canvas.className })),
      links: Array.from(document.querySelectorAll('a')).map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: normalized(a.getAttribute('href') || '') })),
      scroll: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight },
    };
  }, normalizePrefix);
}

function diffJson(a, b, pathName = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) diffJson(a[key], b[key], pathName ? `${pathName}.${key}` : key, out);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) diffJson(a[i], b[i], `${pathName}[${i}]`, out);
    return out;
  }
  out.push({ path: pathName, master: a, static: b });
  return out;
}

async function openCollect(url, config, browser, normalizePrefix) {
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.dpr,
    reducedMotion: config.reducedMotion,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 30000 });
  await page.waitForTimeout(5500);
  const data = await collect(page, normalizePrefix);
  await context.close();
  return data;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = { capturedAt: new Date().toISOString(), masterUrl: MASTER_URL, staticUrl: STATIC_URL, viewports: [] };
  for (const config of VIEWPORTS) {
    const master = await openCollect(MASTER_URL, config, browser, '');
    const staticData = await openCollect(STATIC_URL, config, browser, '/portfolio');
    const differences = diffJson(master, staticData);
    report.viewports.push({ name: config.name, differences });
    console.log(`\n${config.name}: ${differences.length} differences`);
    for (const d of differences.slice(0, 60)) {
      console.log(`  ${d.path}\n    master=${JSON.stringify(d.master)}\n    static=${JSON.stringify(d.static)}`);
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'dom-diff.json'), JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error('DOM_DIFF_FAILED', error);
  process.exit(1);
});
