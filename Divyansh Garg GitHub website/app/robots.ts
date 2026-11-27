import type { MetadataRoute } from 'next';

/** No localhost fallback: omit the sitemap directive until a valid URL is configured. */
function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

export default function robots(): MetadataRoute.Robots {
  const base = getSiteOrigin();
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/preview'] },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
