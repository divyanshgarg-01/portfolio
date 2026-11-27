import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { dataMode, getAdminDb } from '@/lib/db';
import { getPortfolioData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSessionUser();
  const db = await getAdminDb();
  const [data, activity] = await Promise.all([
    getPortfolioData(true, db),
    user?.role === 'owner' ? db.listActivity(12) : Promise.resolve([]),
  ]);
  const entities = [
    ...data.projects,
    ...data.experience,
    ...data.education,
    ...data.skillCategories,
    ...data.skills,
    ...data.achievements,
    ...data.socials,
  ];
  const count = (status: string) => entities.filter((item) => item.visibility === status).length;
  const draftProjects = data.projects.filter((item) => item.visibility === 'draft');

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Everything that is published, in draft, or waiting for review.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn btn--primary btn--small" href="/admin/projects/new">New project</Link>
          <Link className="btn btn--ghost btn--small" href="/admin/media">Upload media</Link>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Connection health</h2>
        <div className="stat-cards" style={{ marginTop: 12 }}>
          <div className="stat-card"><strong>{dataMode === 'supabase' ? 'Supabase' : 'Local SQLite'}</strong><span>Persistence</span></div>
          <div className="stat-card"><strong>{dataMode === 'supabase' ? (user?.aal ?? 'aal1') : 'Local session'}</strong><span>Assurance</span></div>
          <div className="stat-card"><strong>{count('published')}</strong><span>Published records</span></div>
          <div className="stat-card"><strong>{count('draft')}</strong><span>Drafts</span></div>
        </div>
        {dataMode === 'local' && <p className="muted">Development-only persistence. Hosted deployments require DATA_MODE=supabase.</p>}
      </div>

      <div className="stat-cards">
        <div className="stat-card"><strong>{count('published')}</strong><span>Published records</span></div>
        <div className="stat-card"><strong>{count('draft')}</strong><span>Drafts</span></div>
        <div className="stat-card"><strong>{data.projects.filter((item) => item.featured).length}</strong><span>Featured projects</span></div>
        <div className="stat-card"><strong>{data.media.length}</strong><span>Media assets</span></div>
      </div>

      <div className="panel">
        <h2>Quick actions</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Link className="btn btn--ghost btn--small" href="/admin/about">Edit biography</Link>
          <Link className="btn btn--ghost btn--small" href="/admin/settings">Site settings</Link>
          <Link className="btn btn--ghost btn--small" href="/admin/achievements">Certifications</Link>
          <a className="btn btn--ghost btn--small" href="/" target="_blank" rel="noreferrer">Open public site ↗</a>
        </div>
      </div>

      {draftProjects.length > 0 && (
        <div className="panel">
          <h2>Projects awaiting review</h2>
          <div className="reorder-list">
            {draftProjects.map((project) => (
              <Link className="reorder-item" key={project.id} href={`/admin/projects/${project.id}`}>
                <span className="pill pill--draft">Draft</span>
                <span>{project.title}</span>
                <span style={{ marginLeft: 'auto' }} className="link-arrow">Edit ↗</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Recent activity</h2>
        {activity.length === 0 ? (
          <p className="muted">No changes recorded yet, or this view is owner-only.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Action</th><th>Actor</th><th>When</th></tr></thead>
            <tbody>
              {activity.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.action}</td>
                  <td>{entry.actor}</td>
                  <td>{new Date(entry.createdAt).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
