import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const SITE_URL = 'https://divyanshgarg-01.github.io/portfolio/';

function readJson<T = Record<string, unknown>>(relativePath: string, fallback: T): T {
  const absolute = resolve(process.cwd(), relativePath);
  if (!existsSync(absolute)) return fallback;
  return JSON.parse(readFileSync(absolute, 'utf8')) as T;
}

function readFolder(relativeDir: string): Array<Record<string, unknown>> {
  const absolute = resolve(process.cwd(), relativeDir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(resolve(absolute, name), 'utf8')) as Record<string, unknown>);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function masterMetadata(): Plugin {
  return {
    name: 'master-portfolio-metadata',
    transformIndexHtml(html) {
      const settings = readJson<Record<string, any>>('src/content/settings.json', {});
      const about = readJson<Record<string, any>>('src/content/about.json', {});
      const education = readFolder('src/content/education');
      const socials = readFolder('src/content/socials').filter((item) => item.visible !== false);

      const title = String(settings.siteTitle || 'Divyansh Garg — Data, Business & Technology');
      const description = String(settings.siteDescription || title);
      const ogImageRaw = String(settings.ogImage || '').trim();
      const ogImage = /^https?:\/\//i.test(ogImageRaw)
        ? ogImageRaw
        : ogImageRaw.startsWith('/')
          ? `https://divyanshgarg-01.github.io${ogImageRaw}`
          : '';
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: title.split('—')[0].trim(),
        jobTitle: about.careerDirection || '',
        email: settings.contactEmail || '',
        alumniOf: education.map((item) => ({ '@type': 'CollegeOrUniversity', name: item.institution })),
        sameAs: socials.map((item) => item.url),
      };
      const jsonLd = JSON.stringify(schema).replace(/</g, '\\u003c');

      const metadata = [
        `<title>${escapeHtml(title)}</title>`,
        `<meta name="description" content="${escapeHtml(description)}" />`,
        '<meta name="robots" content="index, follow" />',
        `<link rel="canonical" href="${SITE_URL}" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        '<meta property="og:type" content="website" />',
        `<meta property="og:url" content="${SITE_URL}" />`,
        ...(ogImage ? [`<meta property="og:image" content="${escapeHtml(ogImage)}" />`] : []),
        '<meta name="twitter:card" content="summary_large_image" />',
        `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
        `<script type="application/ld+json">${jsonLd}</script>`,
      ].join('\n    ');

      return html.replace('<!--MASTER_METADATA-->', metadata);
    },
  };
}

export default defineConfig({
  base: '/portfolio/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/original', import.meta.url)),
    },
  },
  plugins: [react(), masterMetadata()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
