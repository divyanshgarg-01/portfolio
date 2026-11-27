import { AccountPanel } from '@/components/admin/AccountPanel';
import { getSessionUser } from '@/lib/auth';
import { dataMode } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return <AccountPanel user={user} localMode={dataMode === 'local'} />;
}
