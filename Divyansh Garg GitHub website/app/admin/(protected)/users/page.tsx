import { UserManager } from '@/components/admin/UserManager';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await requireUser(['owner']);
  const users = await (await getAdminDb()).listUsers();
  return <UserManager users={users} currentUserId={user.id} />;
}
