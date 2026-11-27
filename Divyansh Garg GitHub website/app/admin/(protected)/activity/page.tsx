import { redirect } from 'next/navigation';
import { ActivityTable } from '@/components/admin/ActivityTable';
import { getSessionUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!user) redirect('/admin/login');
  if (user.role !== 'owner') redirect('/admin');
  const activity = await (await getAdminDb()).listActivity(200);
  return (
    <>
      <div className="admin-page-head">
        <div><h1>Activity log</h1><p>Every content mutation is recorded with its actor and time. Search, filter or export the latest 200 entries.</p></div>
      </div>
      <div className="panel">
        <ActivityTable entries={activity} />
      </div>
    </>
  );
}
