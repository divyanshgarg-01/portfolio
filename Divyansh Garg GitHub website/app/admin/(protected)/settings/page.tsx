import { SingletonEditor } from '@/components/admin/SingletonEditor';
import { settingsFields } from '@/lib/admin-config';
import { getSessionUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [user, settings] = await Promise.all([
    getSessionUser(),
    getAdminDb().then((db) => db.getSingleton<Record<string, unknown>>('settings')),
  ]);
  return (
    <SingletonEditor
      singleton="settings"
      fields={settingsFields}
      initial={settings}
      canEdit={user?.role === 'owner'}
      canReset={user?.role === 'owner'}
      jsonFields={[
        { key: 'navItems', label: 'Navigation items (JSON)', help: 'Array of { label, section, visible }. Maximum 8 items.' },
        { key: 'sectionVisibility', label: 'Section visibility (JSON)', help: 'Map of section keys to true/false.' },
        { key: 'sectionHeadings', label: 'Section headings (JSON)', help: 'about, education, experience, projects, skills, achievements, community, contact.' },
        { key: 'appearance', label: 'Appearance (JSON)', help: 'accent, grain, loader, terminal, emberDensity.' },
        { key: 'cta', label: 'Floating call to action (JSON)', help: '{ label, url }.' },
      ]}
    />
  );
}
