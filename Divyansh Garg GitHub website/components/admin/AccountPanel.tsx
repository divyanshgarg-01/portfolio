'use client';

import { useState, type FormEvent } from 'react';
import type { SessionUser } from '@/lib/types';

export function AccountPanel({ user, localMode }: { user: SessionUser; localMode: boolean }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [nonce, setNonce] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    const response = await fetch('/api/admin/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, nonce }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    setStatus(response.ok ? 'Password updated' : result.error ?? 'Could not update password');
    if (response.ok) { setCurrentPassword(''); setNewPassword(''); setNonce(''); }
  };

  const sendCode = async () => {
    setSendingCode(true);
    setStatus('');
    const response = await fetch('/api/admin/account/password/reauthenticate', { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    setSendingCode(false);
    setStatus(response.ok ? result.message ?? 'Verification code sent.' : result.error ?? 'Could not send verification code');
  };

  return (
    <>
      <div className="panel">
        <h2>Signed-in account</h2>
        <div className="email-row"><div className="mono">NAME</div><strong>{user.name}</strong></div>
        <div className="email-row"><div className="mono">EMAIL</div><strong>{user.email}</strong></div>
        <div className="email-row"><div className="mono">ROLE</div><strong>{user.role}</strong></div>
        <div className="email-row"><div className="mono">ASSURANCE</div><strong>{localMode ? 'Local session' : (user.aal ?? 'aal1')}</strong></div>
      </div>

      <form className="panel" onSubmit={submit}>
        <h2>Change password</h2>
        <div className="form-grid">
          <div className="field field--wide">
            <label htmlFor="current">Current password</label>
            <input id="current" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          <div className="field field--wide">
            <label htmlFor="new">New password</label>
            <input id="new" type="password" required minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <span className="field__help">At least 12 characters.</span>
          </div>
          {!localMode && (
            <div className="field field--wide">
              <label htmlFor="nonce">Verification code (if requested)</label>
              <input id="nonce" inputMode="numeric" autoComplete="one-time-code" value={nonce} onChange={(event) => setNonce(event.target.value)} />
              <span className="field__help">
                Your hosted project may require a confirmation code before changing a password.{' '}
                <button className="link-button" type="button" onClick={() => void sendCode()} disabled={sendingCode}>
                  {sendingCode ? 'Sending…' : 'Send verification code'}
                </button>
              </span>
            </div>
          )}
          {status && <div className="notice field--wide">{status}</div>}
          <div className="field--wide"><button className="btn btn--primary btn--small" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></div>
        </div>
      </form>

      {!localMode && (
        <div className="panel">
          <h2>Multi-factor authentication</h2>
          <p className="muted">
            {user.mfaRequired
              ? 'MFA is required for owner access. Complete the check shown when you open the CMS.'
              : 'MFA is active. Owner operations are verified on the server before they run.'}
          </p>
          <p className="muted">If you lose your authenticator device, ask the site owner to reset MFA in Supabase Auth.</p>
        </div>
      )}
    </>
  );
}
