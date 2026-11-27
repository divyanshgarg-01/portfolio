import type { Metadata } from 'next';
import { PublicSite } from '@/components/public/PublicSite';
import { buildTokenScopedPreview } from '@/lib/preview';

export const metadata: Metadata = {
  title: 'Draft preview — Divyansh Garg',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await buildTokenScopedPreview(token);
  if (!data) {
    return (
      <main className="container section">
        <h1 className="h2">Preview unavailable</h1>
        <p className="muted">This preview link is invalid, expired or already used. Ask the site owner for a new link.</p>
      </main>
    );
  }

  return (
    <>
      <div className="notice" style={{ margin: 0, borderRadius: 0, textAlign: 'center' }}>
        Draft preview — not public. This page is not indexed.
      </div>
      <PublicSite data={data} />
    </>
  );
}
