import { notFound } from 'next/navigation';
import { EntityEditor } from '@/components/admin/EntityEditor';
import { collectionMap } from '@/lib/admin-config';
import { getSessionUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import type { CollectionKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditEntityPage({ params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection: key, id } = await params;
  if (!(key in collectionMap)) notFound();
  const [user, item] = await Promise.all([
    getSessionUser(),
    getAdminDb().then((db) => db.getEntity<Record<string, unknown>>(key as CollectionKey, id)),
  ]);
  if (!user || !item) notFound();
  return <EntityEditor config={collectionMap[key as CollectionKey]} initial={item} isNew={false} user={user} />;
}
