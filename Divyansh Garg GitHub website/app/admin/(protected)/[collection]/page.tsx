import Link from 'next/link';
import { notFound } from 'next/navigation';
import { collectionMap } from '@/lib/admin-config';
import { CollectionManager } from '@/components/admin/CollectionManager';
import { getSessionUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import type { CollectionKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection: key } = await params;
  if (!(key in collectionMap)) notFound();
  const collection = key as CollectionKey;
  const config = collectionMap[collection];
  const [user, items] = await Promise.all([
    getSessionUser(),
    getAdminDb().then((db) => db.listEntities<Record<string, unknown>>(collection, true)),
  ]);
  if (!user) notFound();
  const rows = items.map((item) => ({
    id: String(item.id),
    title: String(item[config.titleField] ?? 'Untitled'),
    visibility: String(item.visibility ?? 'draft'),
    featured: Boolean(item.featured),
    order: Number(item.order ?? 0),
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  }));

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>{config.label}</h1>
          <p>{rows.length} record{rows.length === 1 ? '' : 's'} · drafts stay hidden from the public site.</p>
        </div>
        <Link className="btn btn--primary btn--small" href={`/admin/${collection}/new`}>New {config.singular.toLowerCase()}</Link>
      </div>
      <CollectionManager config={config} items={rows} role={user.role} />
    </>
  );
}
