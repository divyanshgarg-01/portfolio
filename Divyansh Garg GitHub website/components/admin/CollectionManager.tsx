'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ReorderList } from './ReorderList';
import type { CollectionConfig } from '@/lib/admin-config';
import type { UserRole } from '@/lib/types';

interface Item {
  id: string;
  title: string;
  visibility: string;
  featured: boolean;
  order: number;
  updatedAt?: string;
}

interface Props {
  config: CollectionConfig;
  items: Item[];
  role: UserRole;
}

export function CollectionManager({ config, items, role }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [statusText, setStatusText] = useState('');
  const [busyId, setBusyId] = useState('');
  const canPublish = role === 'owner';

  const filtered = useMemo(() => items.filter((item) => {
    const matchesQuery = item.title.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === 'all' || item.visibility === status;
    return matchesQuery && matchesStatus;
  }), [items, query, status]);

  const mutate = async (item: Item, patch: Record<string, unknown>) => {
    setBusyId(item.id);
    setStatusText('Saving…');
    const response = await fetch(`/api/admin/${config.key}/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      setStatusText('Saved');
      router.refresh();
    } else {
      setStatusText(result.errors?.featured ?? result.error ?? 'Could not save change');
    }
    setBusyId('');
  };

  return (
    <>
      <div className="panel">
        <div className="collection-toolbar">
          <input aria-label={`Search ${config.label}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.label.toLowerCase()}…`} />
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All states</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="unpublished">Unpublished</option>
          </select>
          <span className="status-text">{statusText || `${filtered.length} of ${items.length} shown`}</span>
        </div>
        {items.length > 0 && role !== 'viewer' && (
          <details className="reorder-disclosure">
            <summary>Reorder records</summary>
            <ReorderList
              collection={config.key}
              items={(role === 'owner' ? items : items.filter((item) => item.visibility === 'draft'))
                .map(({ id, title, visibility }) => ({ id, title, visibility }))}
            />
          </details>
        )}
      </div>

      <div className="panel">
        {filtered.length === 0 ? (
          <p className="muted">{items.length === 0 ? 'Nothing here yet. Create the first record.' : 'No records match this filter.'}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>State</th>
                  {config.hasFeatured && <th>Featured</th>}
                  <th>Order</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td><Link className="link-arrow" href={`/admin/${config.key}/${item.id}`}>{item.title}</Link></td>
                    <td><span className={`pill pill--${item.visibility}`}>{item.visibility}</span></td>
                    {config.hasFeatured && (
                      <td>
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          disabled={busyId === item.id || role !== 'owner'}
                          title={role === 'owner' ? 'Toggle featured' : 'Owner only'}
                          onClick={() => void mutate(item, { featured: !item.featured })}
                        >
                          {item.featured ? '★ Featured' : '☆ Feature'}
                        </button>
                      </td>
                    )}
                    <td>{item.order}</td>
                    <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn--ghost btn--small" href={`/admin/${config.key}/${item.id}`}>Edit</Link>
                        {canPublish && item.visibility !== 'published' && (
                          <button className="btn btn--primary btn--small" type="button" disabled={busyId === item.id} onClick={() => void mutate(item, { visibility: 'published' })}>Publish</button>
                        )}
                        {canPublish && item.visibility === 'published' && (
                          <button className="btn btn--ghost btn--small" type="button" disabled={busyId === item.id} onClick={() => void mutate(item, { visibility: 'unpublished' })}>Unpublish</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
