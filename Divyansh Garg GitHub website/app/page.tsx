import type { Metadata } from 'next';
import { PublicSite } from '@/components/public/PublicSite';
import { getPublishedPortfolio } from '@/lib/data';
import type { MediaAsset } from '@/lib/types';

// Always render from the database so CMS changes appear immediately in every mode.
export const dynamic = 'force-dynamic';

/** Never default to localhost: URL-dependent metadata is omitted when unset/invalid. */
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

/** settings.ogImage is a media id; resolve it against the public media records. */
function resolveOgImage(asset: MediaAsset | undefined, siteOrigin: string): string | undefined {
  if (!asset || asset.bucket !== 'media-public') return undefined;
  const path = asset.path?.trim() ?? '';
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return siteOrigin ? `${siteOrigin}${path}` : undefined;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '') || '';
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl}/storage/v1/object/public/${asset.bucket}/${path.replace(/^\/+/, '')}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await getPublishedPortfolio();
  const { settings } = data;
  const title = settings.siteTitle || 'Divyansh Garg — Data, Business & Technology';
  const description = settings.siteDescription || title;
  const siteOrigin = getSiteOrigin();
  let ogImage = resolveOgImage(data.media.find((asset) => asset.id === settings.ogImage), siteOrigin);
  // Legacy settings may still hold a URL/path instead of a media id.
  if (!ogImage) {
    const legacy = settings.ogImage?.trim() ?? '';
    if (/^https?:\/\//i.test(legacy)) ogImage = legacy;
    else if (siteOrigin && legacy.startsWith('/')) ogImage = `${siteOrigin}${legacy}`;
  }

  return {
    title,
    description,
    ...(siteOrigin ? { metadataBase: new URL(siteOrigin) } : {}),
    alternates: siteOrigin ? { canonical: '/' } : undefined,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(siteOrigin ? { url: '/' } : {}),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: true, follow: true },
  };
}

export default async function HomePage() {
  const data = await getPublishedPortfolio();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: data.settings.siteTitle.split('—')[0].trim(),
    jobTitle: data.about.careerDirection,
    email: data.settings.contactEmail,
    alumniOf: data.education.map((item) => ({ '@type': 'CollegeOrUniversity', name: item.institution })),
    sameAs: data.socials.map((social) => social.url),
  };
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
      <PublicSite data={data} />
    </>
  );
}
