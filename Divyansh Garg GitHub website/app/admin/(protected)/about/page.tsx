import { SingletonEditor } from '@/components/admin/SingletonEditor';
import { aboutFields } from '@/lib/admin-config';
import { getSessionUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  const [user, about] = await Promise.all([
    getSessionUser(),
    getAdminDb().then((db) => db.getSingleton<Record<string, unknown>>('about')),
  ]);
  return (
    <SingletonEditor
      singleton="about"
      fields={aboutFields}
      initial={about}
      canEdit={user?.role === 'owner'}
      canReset={user?.role === 'owner'}
    />
  );
}
