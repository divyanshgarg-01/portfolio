import type { Metadata } from 'next';
import { LoginForm } from '@/components/admin/LoginForm';

export const metadata: Metadata = {
  title: 'Admin sign in — Divyansh Garg',
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="kicker">Private access</div>
        <h1>Content console</h1>
        <p className="muted">Sign in to manage the portfolio. Authorised editors and owners only.</p>
        <LoginForm next={next} />
        <p className="mono" style={{ marginTop: 26, textTransform: 'none', letterSpacing: 0 }}>
          Credentials are configured by the site owner. Never share them.
        </p>
      </div>
    </main>
  );
}
