'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { SessionUser } from '@/lib/types';

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export function MFAGate({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState(user.factorId ?? '');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const startEnrollment = async () => {
    setBusy(true);
    setError('');
    const response = await fetch('/api/auth/mfa/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? 'Could not start MFA enrollment');
      return;
    }
    setEnrollment(result as Enrollment);
    setFactorId(String(result.factorId));
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factorId, code }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? 'Could not verify the code');
      return;
    }
    router.refresh();
  };

  return (
    <main className="container section" style={{ maxWidth: 720 }}>
      <div className="panel">
        <div className="admin-page-head">
          <div>
            <h1>Multi-factor authentication required</h1>
            <p>Owner access requires a verified second factor. This check runs on the server for every privileged operation.</p>
          </div>
        </div>

        <div className="notice">
          Signed in as {user.email} ({user.role}). Current assurance: {user.aal ?? 'aal1'}.
        </div>

        {!factorId && (
          <div style={{ marginTop: 20 }}>
            <p className="muted">No authenticator is enrolled. Scan the QR code with an authenticator app, then enter the 6-digit code below.</p>
            <button className="btn btn--primary btn--small" type="button" onClick={startEnrollment} disabled={busy}>
              {busy ? 'Preparing enrollment…' : 'Set up authenticator'}
            </button>
          </div>
        )}

        {enrollment && (
          <div style={{ marginTop: 24 }}>
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCode)}`}
              alt="Authenticator QR code"
              width={220}
              height={220}
              style={{ background: '#fff', padding: 12, borderRadius: 8 }}
            />
            <p className="muted">If you cannot scan the code, enter this secret manually:</p>
            <p><code>{enrollment.secret}</code></p>
          </div>
        )}

        {factorId && (
          <form className="form-grid" onSubmit={verify} style={{ marginTop: 24 }}>
            <div className="field field--wide">
              <label htmlFor="mfa-code">Authenticator code</label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <span className="field__help">Enter the current 6-digit code from your authenticator app.</span>
            </div>
            {error && <div className="notice notice--error field--wide" role="alert">{error}</div>}
            <div className="field--wide">
              <button className="btn btn--primary btn--small" type="submit" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify and continue'}
              </button>
            </div>
          </form>
        )}

        <p className="muted" style={{ marginTop: 24 }}>
          If you lose your authenticator device, the site owner must reset MFA for this account in Supabase Auth. Recovery guidance is
          kept in the deployment documentation; no secret or recovery code is stored in this application.
        </p>
      </div>
    </main>
  );
}
