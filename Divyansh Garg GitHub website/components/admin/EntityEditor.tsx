'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { CollectionConfig, FieldConfig } from '@/lib/admin-config';
import { MediaPicker } from './MediaPicker';
import type { SessionUser } from '@/lib/types';

interface Props {
  config: CollectionConfig;
  initial: Record<string, unknown>;
  isNew: boolean;
  user: SessionUser;
}

const emptyValue = (field: FieldConfig): unknown => {
  if (field.type === 'tags' || field.type === 'media-list') return [];
  if (field.type === 'boolean') return false;
  if (field.type === 'number') return 999;
  return '';
};

export function EntityEditor({ config, initial, isNew, user }: Props) {
  const router = useRouter();
  const defaults = useMemo(() => {
    const record: Record<string, unknown> = { ...initial };
    for (const field of config.fields) if (record[field.key] === undefined) record[field.key] = emptyValue(field);
    if (record.visibility === undefined) record.visibility = 'draft';
    return record;
  }, [config, initial]);
  const [values, setValues] = useState<Record<string, unknown>>(defaults);
  const [saved, setSaved] = useState<Record<string, unknown>>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const readOnly = user.role === 'viewer';
  const canPublish = user.role === 'owner';
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

  const save = async (visibility?: string): Promise<Record<string, unknown> | null> => {
    if (readOnly) return null;
    setBusy(true);
    setErrors({});
    setStatus('Saving…');
    const payload = visibility ? { ...values, visibility } : values;
    const url = isNew ? `/api/admin/${config.key}` : `/api/admin/${config.key}/${String(values.id)}`;
    const response = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setErrors(result.errors ?? { error: result.error ?? 'Save failed' });
      setStatus('Save failed');
      setBusy(false);
      return null;
    }
    const savedItem = result.item as Record<string, unknown>;
    setValues(savedItem);
    setSaved(savedItem);
    setStatus('Saved');
    setBusy(false);
    if (isNew) router.replace(`/admin/${config.key}/${String(savedItem.id)}`);
    router.refresh();
    return savedItem;
  };

  const preview = async () => {
    const savedItem = await save();
    if (!savedItem) return;
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: config.key, id: String(savedItem.id) }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) window.open(result.url, '_blank', 'noopener,noreferrer');
    else setStatus(result.error ?? 'Could not create preview');
  };

  const remove = async () => {
    const title = String(values[config.titleField] ?? '');
    if (confirmDelete !== title) return;
    setBusy(true);
    const response = await fetch(`/api/admin/${config.key}/${String(values.id)}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setStatus(result.error ?? 'Delete failed');
      setBusy(false);
      return;
    }
    router.push(`/admin/${config.key}`);
    router.refresh();
  };

  const renderField = (field: FieldConfig) => {
    const value = values[field.key];
    const error = errors[field.key];
    const disabled = readOnly;
    if (field.type === 'media') {
      return <MediaPicker key={field.key} label={field.label} value={String(value ?? '')} onChange={(next) => update(field.key, next)} folder={config.key} disabled={disabled} />;
    }
    if (field.type === 'media-list') {
      return <MediaPicker key={field.key} label={field.label} value={(value as string[]) ?? []} onChange={(next) => update(field.key, next)} multiple folder={config.key} disabled={disabled} />;
    }
    if (field.type === 'boolean') {
      return (
        <label className="admin-toggle field" key={field.key}>
          <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => update(field.key, event.target.checked)} />
          {field.label}
        </label>
      );
    }
    if (field.type === 'select') {
      return (
        <div className="field" key={field.key}>
          <label htmlFor={field.key}>{field.label}</label>
          <select
            id={field.key}
            value={String(value ?? '')}
            disabled={disabled || (field.key === 'visibility' && !canPublish)}
            onChange={(event) => update(field.key, event.target.value)}
          >
            {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {error && <span className="field__error">{error}</span>}
        </div>
      );
    }
    const wide = field.type === 'textarea' || field.type === 'tags';
    return (
      <div className={`field${wide ? ' field--wide' : ''}`} key={field.key}>
        <label htmlFor={field.key}>{field.label}</label>
        {field.type === 'textarea' || field.type === 'tags' ? (
          <textarea
            id={field.key}
            value={Array.isArray(value) ? value.join('\n') : String(value ?? '')}
            disabled={disabled}
            placeholder={field.placeholder}
            onChange={(event) => update(field.key, field.type === 'tags' ? event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) : event.target.value)}
          />
        ) : (
          <input
            id={field.key}
            type={field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
            value={String(value ?? '')}
            disabled={disabled}
            placeholder={field.placeholder}
            onChange={(event) => update(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)}
          />
        )}
        {field.help && <span className="field__help">{field.help}</span>}
        {error && <span className="field__error">{error}</span>}
      </div>
    );
  };

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>{isNew ? `New ${config.singular.toLowerCase()}` : String(values[config.titleField] ?? config.singular)}</h1>
          <p>{isNew ? 'Create a draft. It stays hidden until published.' : 'Changes save to the database and appear publicly after publishing.'}</p>
        </div>
        <Link
          className="btn btn--ghost btn--small"
          href={`/admin/${config.key}`}
          onClick={(event) => { if (dirty && !window.confirm('You have unsaved changes. Leave this page?')) event.preventDefault(); }}
        >← Back to {config.label.toLowerCase()}</Link>
      </div>

      {errors.error && <div className="notice notice--error" role="alert">{errors.error}</div>}

      <form className="panel" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }}>
        <div className="form-grid">{config.fields.map(renderField)}</div>
        <div className="form-actions">
          <span className={`status-text${dirty ? ' is-dirty' : ''}${status === 'Saved' ? ' is-saved' : ''}`}>
            {dirty ? 'Unsaved changes' : status || 'All changes saved'}
          </span>
          <span style={{ flex: 1 }} />
          {!readOnly && (
            <>
              {canPublish && <button className="btn btn--ghost btn--small" type="button" onClick={() => void preview()} disabled={busy}>Preview</button>}
              {canPublish && <button className="btn btn--ghost btn--small" type="button" onClick={() => void save('draft')} disabled={busy}>Save draft</button>}
              <button className="btn btn--primary btn--small" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              {canPublish && <button className="btn btn--primary btn--small" type="button" onClick={() => void save('published')} disabled={busy}>Publish</button>}
              {canPublish && String(values.visibility) === 'published' && (
                <button className="btn btn--ghost btn--small" type="button" onClick={() => void save('unpublished')} disabled={busy}>Unpublish</button>
              )}
            </>
          )}
        </div>
      </form>

      {!isNew && user.role === 'owner' && (
        <div className="panel">
          <h2>Danger zone</h2>
          <p className="muted">Deletion is soft by default and removes the record from the public site after revalidation.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <input aria-label="Type record title to confirm deletion" value={confirmDelete} onChange={(event) => setConfirmDelete(event.target.value)} placeholder={`Type “${String(values[config.titleField] ?? '')}” to confirm`} />
            <button className="btn btn--danger btn--small" type="button" onClick={() => void remove()} disabled={confirmDelete !== String(values[config.titleField] ?? '') || busy}>Delete record</button>
          </div>
        </div>
      )}
    </>
  );
}
