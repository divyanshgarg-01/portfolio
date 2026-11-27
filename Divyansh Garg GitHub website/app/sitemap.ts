import type { MetadataRoute } from 'next';

/** No localhost fallback: emit nothing until a valid public site URL is configured. */
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

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteOrigin();
  if (!base) return [];
  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
