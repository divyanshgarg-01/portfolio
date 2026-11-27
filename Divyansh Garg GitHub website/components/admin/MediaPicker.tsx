'use client';

import { useEffect, useState } from 'react';
import type { MediaAsset } from '@/lib/types';

interface Props {
  label: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  folder?: string;
  disabled?: boolean;
}

export function MediaPicker({ label, value, onChange, multiple = false, folder = 'misc', disabled = false }: Props) {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [selected, setSelected] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/admin/media')
      .then((response) => response.json())
      .then((result) => setMedia(result.items ?? []))
      .catch(() => setError('Could not load media library'));
  }, []);

  const current: string[] = Array.isArray(value) ? value : value ? [value] : [];

  const add = () => {
    if (!selected) return;
    if (multiple) {
      if (!current.includes(selected)) onChange([...current, selected]);
    } else {
      onChange(selected);
    }
    setSelected('');
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);
    const response = await fetch('/api/admin/media', { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || 'Upload failed');
    } else {
      setMedia((items) => [result.item, ...items]);
      if (multiple) onChange([...current, result.item.id]);
      else onChange(result.item.id);
    }
    setUploading(false);
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={selected} disabled={disabled} onChange={(event) => setSelected(event.target.value)} aria-label={`Select ${label}`}>
          <option value="">Choose from media library…</option>
          {media.map((asset) => <option key={asset.id} value={asset.id}>{asset.folder}/{asset.filename}</option>)}
        </select>
        <button className="btn btn--ghost btn--small" type="button" onClick={add} disabled={disabled}>Add</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {current.map((id) => {
          const asset = media.find((item) => item.id === id);
          return (
            <span className="chip" key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {asset ? asset.filename : id.slice(0, 12)}
              <button type="button" disabled={disabled} aria-label={`Remove ${asset?.filename ?? id}`} onClick={() => onChange(multiple ? current.filter((item) => item !== id) : '')} style={{ border: 0, background: 'none', color: 'inherit', padding: 0 }}>×</button>
            </span>
          );
        })}
      </div>
      {!disabled && (
        <div style={{ marginTop: 10 }}>
          <label className="btn btn--ghost btn--small" style={{ display: 'inline-flex' }}>
            {uploading ? 'Uploading…' : 'Upload new file'}
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          </label>
        </div>
      )}
      {error && <div className="field__error">{error}</div>}
    </div>
  );
}
