import { MediaManager } from '@/components/admin/MediaManager';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return <MediaManager user={user} />;
}
