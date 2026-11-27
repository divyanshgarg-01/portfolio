'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ManagedUser } from '@/lib/db/interface';

export function UserManager({
  users,
  currentUserId,
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    router.refresh();
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, role, ...(password ? { password } : {}) }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? 'Could not create the account');
      return;
    }
    setEmail('');
    setName('');
    setPassword('');
    reload();
  };

  const update = async (user: ManagedUser, patch: Record<string, unknown>) => {
    setError('');
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? 'Could not update the account');
      return;
    }
    reload();
  };

  const revoke = async (user: ManagedUser) => {
    setError('');
    const response = await fetch(`/api/admin/users/${user.id}/revoke`, { method: 'POST' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? 'Could not revoke sessions');
      return;
    }
    reload();
  };

  const remove = async (user: ManagedUser) => {
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    setError('');
    const response = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? 'Could not delete the account');
      return;
    }
    reload();
  };

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Users</h1>
          <p>Owner-only account management. Owners cannot be created here; transfer ownership in Supabase first.</p>
        </div>
      </div>

      <div className="panel">
        <h2>Create account</h2>
        <form className="form-grid" onSubmit={create}>
          <div className="field"><label htmlFor="user-email">Email</label><input id="user-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="field"><label htmlFor="user-name">Name</label><input id="user-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="field">
            <label htmlFor="user-role">Role</label>
            <select id="user-role" value={role} onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </div>
          <div className="field field--wide">
            <label htmlFor="user-password">Temporary password</label>
            <input id="user-password" type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
            <span className="field__help">At least 12 characters. Share it with the user out of band.</span>
          </div>
          {error && <div className="notice notice--error field--wide" role="alert">{error}</div>}
          <div className="field--wide"><button className="btn btn--primary btn--small" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div>
        </form>
      </div>

      <div className="panel">
        <h2>Accounts</h2>
        <table className="data-table">
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>MFA</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}{user.id === currentUserId ? ' (you)' : ''}</td>
                <td>
                  {user.id === currentUserId ? user.role : (
                    <select
                      value={user.role}
                      aria-label={`Role for ${user.email}`}
                      onChange={(event) => update(user, { role: event.target.value })}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="owner" disabled>Owner</option>
                    </select>
                  )}
                </td>
                <td>
                  {user.id === currentUserId ? (user.active ? 'Active' : 'Inactive') : (
                    <button className="btn btn--ghost btn--small" type="button" onClick={() => update(user, { active: !user.active })}>
                      {user.active ? 'Active' : 'Inactive'}
                    </button>
                  )}
                </td>
                <td>{user.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}</td>
                <td>
                  {user.id !== currentUserId && (
                    <>
                      <button className="btn btn--ghost btn--small" type="button" onClick={() => revoke(user)}>Revoke & deactivate</button>{' '}
                      <button className="btn btn--ghost btn--small" type="button" onClick={() => remove(user)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
