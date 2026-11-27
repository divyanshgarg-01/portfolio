import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MFAGate } from '@/components/admin/MFAGate';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    const requested = (await headers()).get('x-admin-next');
    const next = requested?.startsWith('/admin') ? requested : '/admin';
    redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  }
  if (user.mfaRequired) return <MFAGate user={user} />;
  return <AdminShell user={user}>{children}</AdminShell>;
}
