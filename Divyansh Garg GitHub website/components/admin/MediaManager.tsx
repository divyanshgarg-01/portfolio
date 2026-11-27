'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MediaAsset, SessionUser } from '@/lib/types';

export function MediaManager({ user }: { user: SessionUser }) {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [usage, setUsage] = useState<Record<string, string[]>>({});
  const [folder, setFolder] = useState('misc');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch('/api/admin/media', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    setItems(result.items ?? []);
    setUsage(result.usage ?? {});
  };

  useEffect(() => { void load(); }, []);

  const upload = async (file: File) => {
    setBusy(true);
    setStatus('Uploading…');
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);
    const response = await fetch('/api/admin/media', { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    setStatus(response.ok ? 'Upload complete' : result.error ?? 'Upload failed');
    if (response.ok) await load();
    setBusy(false);
  };

  const saveAlt = async (asset: MediaAsset, altText: string) => {
    const form = new FormData();
    form.append('altText', altText);
    const response = await fetch(`/api/admin/media/${asset.id}`, { method: 'PATCH', body: form });
    setStatus(response.ok ? 'Alt text saved' : 'Could not save alt text');
    if (response.ok) await load();
  };

  const replace = async (asset: MediaAsset, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/admin/media/${asset.id}`, { method: 'PATCH', body: form });
    const result = await response.json().catch(() => ({}));
    setStatus(response.ok ? 'Media replaced' : result.error ?? 'Replace failed');
    if (response.ok) await load();
  };

  const referencesFor = (asset: MediaAsset): string[] => Array.from(new Set([
    ...(usage[asset.id] ?? []),
    ...(usage[asset.path] ?? []),
  ]));

  const remove = async (asset: MediaAsset) => {
    if (referencesFor(asset).length > 0) {
      setStatus('This asset is referenced by content and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete ${asset.filename}? This cannot be undone.`)) return;
    const response = await fetch(`/api/admin/media/${asset.id}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    setStatus(response.ok ? 'Media deleted' : result.error ?? 'Delete failed');
    if (response.ok) await load();
  };

  const visibleItems = useMemo(() => items.filter((asset) => {
    const folderMatch = filter === 'all' || asset.folder === filter;
    const queryMatch = asset.filename.toLowerCase().includes(query.trim().toLowerCase()) || asset.altText.toLowerCase().includes(query.trim().toLowerCase());
    return folderMatch && queryMatch;
  }), [items, filter, query]);

  return (
    <>
      <div className="admin-page-head">
        <div><h1>Media library</h1><p>Images are converted to WebP. PDFs are stored privately.</p></div>
      </div>
      <div className="panel collection-toolbar">
        <input aria-label="Search media" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filenames or alt text…" />
        <select aria-label="Filter media by folder" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All folders</option>
          {['profile', 'projects', 'certificates', 'experience', 'og', 'misc'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span className="status-text">{visibleItems.length} of {items.length} assets</span>
      </div>
      <div className="panel">
        <div className="field" style={{ maxWidth: 240, marginBottom: 16 }}>
          <label htmlFor="folder">Folder</label>
          <select id="folder" value={folder} onChange={(event) => setFolder(event.target.value)}>
            {['profile', 'projects', 'certificates', 'experience', 'og', 'misc'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div
          className={`upload-drop${over ? ' is-over' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => { event.preventDefault(); setOver(false); const file = event.dataTransfer.files?.[0]; if (file) void upload(file); }}
        >
          <div>{busy ? 'Working…' : 'Drop a JPEG, PNG, WebP or PDF here'}</div>
          <label className="btn btn--primary btn--small" style={{ marginTop: 12, display: 'inline-flex' }}>
            Choose file
            <input type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          </label>
          <div className="status-text" style={{ marginTop: 12 }}>{status}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="panel"><p className="muted">No media uploaded yet.</p></div>
      ) : visibleItems.length === 0 ? (
        <div className="panel"><p className="muted">No assets match this filter.</p></div>
      ) : (
        <div className="media-grid">
          {visibleItems.map((asset) => {
            const refs = referencesFor(asset);
            return (
              <div className="media-tile" key={asset.id}>
                {asset.mimeType === 'application/pdf' ? <div className="portrait__monogram" style={{ aspectRatio: '4 / 3' }}>PDF</div> : <img src={asset.path} alt={asset.altText || ''} loading="lazy" />}
                <div className="media-tile__body">
                  <strong>{asset.filename}</strong>
                  <div className="mono">{asset.folder} · {(asset.size / 1024).toFixed(0)} KB</div>
                  <div className="media-tile__usage" title={refs.join('\n')}>
                    {refs.length > 0 ? `Used in ${refs.length} content record${refs.length === 1 ? '' : 's'}` : 'Unused'}
                  </div>
                  <input aria-label={`Alt text for ${asset.filename}`} defaultValue={asset.altText} placeholder="Alt text" onBlur={(event) => { if (event.target.value !== asset.altText) void saveAlt(asset, event.target.value); }} style={{ marginTop: 10 }} />
                  <div className="media-tile__actions">
                    <label className="btn btn--ghost btn--small">Replace<input type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replace(asset, file); }} /></label>
                    {user.role === 'owner' && (
                      <button
                        className="btn btn--danger btn--small"
                        type="button"
                        disabled={refs.length > 0}
                        title={refs.length > 0 ? 'Referenced assets cannot be deleted' : 'Delete asset'}
                        onClick={() => void remove(asset)}
                      >Delete</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
