import { notFound } from 'next/navigation';
import { EntityEditor } from '@/components/admin/EntityEditor';
import { collectionMap } from '@/lib/admin-config';
import { getSessionUser } from '@/lib/auth';
import type { CollectionKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewEntityPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection: key } = await params;
  if (!(key in collectionMap)) notFound();
  const user = await getSessionUser();
  if (!user) notFound();
  return <EntityEditor config={collectionMap[key as CollectionKey]} initial={{}} isNew user={user} />;
}
