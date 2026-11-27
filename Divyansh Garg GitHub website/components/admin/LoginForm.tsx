'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

export function LoginForm({ next = '/admin' }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { setReady(true); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || 'Sign in failed');
      setBusy(false);
      return;
    }
    if (result.mfaRequired) {
      setError(result.message ?? 'Multi-factor authentication is required.');
      router.push('/admin');
      router.refresh();
      return;
    }
    router.push(next.startsWith('/admin') ? next : '/admin');
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="form-grid" data-ready={ready ? 'true' : 'false'} style={{ marginTop: 28 }}>
      <div className="field field--wide">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
      </div>
      <div className="field field--wide">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
      </div>
      {error && <div className="notice notice--error field--wide" role="alert">{error}</div>}
      <div className="field--wide">
        <button className="btn btn--primary" type="submit" disabled={busy || !ready} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </form>
  );
}
