'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { FieldConfig } from '@/lib/admin-config';
import { MediaPicker } from './MediaPicker';

interface Props {
  singleton: 'about' | 'settings';
  fields: FieldConfig[];
  initial: Record<string, unknown>;
  jsonFields?: Array<{ key: string; label: string; help?: string }>;
  canEdit: boolean;
  canReset?: boolean;
}

export function SingletonEditor({ singleton, fields, initial, jsonFields = [], canEdit, canReset = false }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [saved, setSaved] = useState<Record<string, unknown>>(initial);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  useEffect(() => {
    document.body.dataset.dirty = dirty ? 'true' : 'false';
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      delete document.body.dataset.dirty;
    };
  }, [dirty]);

  const update = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError('');
    setStatus('Saving…');
    const payload: Record<string, unknown> = { ...values };
    for (const field of jsonFields) {
      try {
        const raw = values[field.key] ?? {};
        payload[field.key] = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        setError(`${field.label} must be valid JSON`);
        setBusy(false);
        return;
      }
    }
    const response = await fetch(`/api/admin/singletons/${singleton}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error ?? 'Save failed');
      setStatus('Save failed');
    } else {
      setValues(result.item);
      setSaved(result.item);
      setStatus('Saved');
      router.refresh();
    }
    setBusy(false);
  };

  const preview = async () => {
    if (!canEdit) return;
    await save();
    window.open('/', '_blank', 'noopener,noreferrer');
  };

  const reset = async () => {
    if (!window.confirm(`Reset all ${singleton} fields to documented defaults? Current values will be replaced.`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/singletons/${singleton}/reset`, { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      setValues(result.item);
      setSaved(result.item);
      setStatus('Reset to defaults');
      router.refresh();
    } else {
      setError(result.error ?? 'Could not reset defaults');
    }
    setBusy(false);
  };

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>{singleton === 'about' ? 'About' : 'Site settings'}</h1>
          <p>These values are used across the public site and terminal.</p>
        </div>
      </div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form className="panel" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }}>
        <div className="form-grid">
          {fields.map((field) => {
            if (field.type === 'media') {
              return <div className="field field--wide" key={field.key}><MediaPicker label={field.label} value={String(values[field.key] ?? '')} onChange={(next) => update(field.key, next)} folder={singleton} /></div>;
            }
            const wide = field.type === 'textarea' || field.type === 'tags';
            return (
              <div className={`field${wide ? ' field--wide' : ''}`} key={field.key}>
                <label htmlFor={field.key}>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea id={field.key} disabled={!canEdit} value={String(values[field.key] ?? '')} onChange={(event) => update(field.key, event.target.value)} />
                ) : (
                  <input id={field.key} disabled={!canEdit} value={Array.isArray(values[field.key]) ? (values[field.key] as string[]).join(', ') : String(values[field.key] ?? '')} onChange={(event) => update(field.key, field.type === 'tags' ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean) : event.target.value)} />
                )}
              </div>
            );
          })}
          {jsonFields.map((field) => (
            <div className="field field--wide" key={field.key}>
              <label htmlFor={field.key}>{field.label}</label>
              <textarea id={field.key} disabled={!canEdit} value={typeof values[field.key] === 'string' ? String(values[field.key]) : JSON.stringify(values[field.key] ?? {}, null, 2)} onChange={(event) => update(field.key, event.target.value)} />
              {field.help && <span className="field__help">{field.help}</span>}
            </div>
          ))}
        </div>
        <div className="form-actions">
          <span className={`status-text${dirty ? ' is-dirty' : ''}`}>{dirty ? 'Unsaved changes' : status || 'All changes saved'}</span>
          <span style={{ flex: 1 }} />
          {canEdit && (
            <>
              <button className="btn btn--ghost btn--small" type="button" onClick={() => void preview()} disabled={busy}>Preview site</button>
              {canReset && <button className="btn btn--danger btn--small" type="button" onClick={() => void reset()} disabled={busy}>Reset defaults</button>}
              <button className="btn btn--primary btn--small" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </>
          )}
        </div>
      </form>
    </>
  );
}
