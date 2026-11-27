'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type MouseEvent, type ReactNode } from 'react';
import {
  Activity,
  Award,
  Briefcase,
  FolderKanban,
  GraduationCap,
  Home,
  Image as ImageIcon,
  Layers,
  Link2,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  UserCog,
  UserRound,
  X,
} from 'lucide-react';
import type { SessionUser } from '@/lib/types';

const contentLinks = [
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/experience', label: 'Experience', icon: Briefcase },
  { href: '/admin/education', label: 'Education', icon: GraduationCap },
  { href: '/admin/skill_categories', label: 'Skill categories', icon: Layers },
  { href: '/admin/skills', label: 'Skills', icon: Sparkles },
  { href: '/admin/achievements', label: 'Achievements', icon: Award },
  { href: '/admin/social_links', label: 'Social links', icon: Link2 },
];

export function AdminShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const guardNavigation = (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>): boolean => {
    if (document.body.dataset.dirty !== 'true') return true;
    if (window.confirm('You have unsaved changes. Leave this page and discard them?')) return true;
    event.preventDefault();
    return false;
  };

  const logout = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!guardNavigation(event)) return;
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  const systemLinks = [
    { href: '/admin/media', label: 'Media library', icon: ImageIcon },
    { href: '/admin/settings', label: 'Site settings', icon: Settings },
    ...(user.role === 'owner' ? [{ href: '/admin/activity', label: 'Activity log', icon: Activity }] : []),
    ...(user.role === 'owner' ? [{ href: '/admin/users', label: 'Users', icon: UserCog }] : []),
    { href: '/admin/account', label: 'Account', icon: UserRound },
  ];

  const navProps = (href: string) => ({
    className: pathname === href || pathname.startsWith(`${href}/`) ? 'is-active' : '',
    href,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (!guardNavigation(event)) return;
      setMenuOpen(false);
    },
  });

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${menuOpen ? ' is-open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="admin-brand">DG<span>.</span> Studio</div>
            <div className="mono">CONTENT CONSOLE</div>
          </div>
          <button className="menu-btn admin-menu-btn" type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <nav aria-label="Admin navigation">
          <Link {...navProps('/admin')}><Home size={16} /> Dashboard</Link>
          <Link {...navProps('/admin/about')}><UserRound size={16} /> About</Link>
        </nav>
        <div className="admin-sidebar__group">Content</div>
        <nav aria-label="Content collections">
          {contentLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} {...navProps(href)}><Icon size={16} /> {label}</Link>
          ))}
        </nav>
        <div className="admin-sidebar__group">System</div>
        <nav aria-label="System pages">
          {systemLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} {...navProps(href)}><Icon size={16} /> {label}</Link>
          ))}
        </nav>
        <button type="button" onClick={logout} disabled={loggingOut} style={{ marginTop: 28 }}><LogOut size={16} /> {loggingOut ? 'Signing out…' : 'Sign out'}</button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="menu-btn admin-menu-btn" type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <span className="mono">DIVYANSH GARG / CMS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <a
              className="link-arrow"
              href="/"
              target="_blank"
              rel="noreferrer"
              onClick={(event) => { guardNavigation(event); }}
            >
              View site <span className="arrow">↗</span>
            </a>
            <span className="pill pill--published">{user.role}</span>
            <span className="mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{user.email}</span>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
