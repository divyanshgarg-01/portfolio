'use client';

import { useMemo, useState } from 'react';
import type { ActivityEntry } from '@/lib/types';

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function ActivityTable({ entries }: { entries: ActivityEntry[] }) {
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('all');
  const actions = useMemo(() => Array.from(new Set(entries.map((entry) => entry.action))).sort(), [entries]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (action !== 'all' && entry.action !== action) return false;
      if (!needle) return true;
      return [entry.actor, entry.action, entry.entityType, entry.entityId, entry.metadata]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [entries, query, action]);

  const exportCsv = () => {
    const header = ['Action', 'Entity type', 'Entity ID', 'Actor', 'Metadata', 'Time'];
    const rows = filtered.map((entry) => [
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.actor,
      entry.metadata,
      entry.createdAt,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (entries.length === 0) return <p className="muted">No activity recorded yet.</p>;

  return (
    <>
      <div className="collection-toolbar">
        <label className="field">
          <span>Search activity</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Actor, action, entity or metadata"
            aria-label="Search activity"
          />
        </label>
        <label className="field">
          <span>Action</span>
          <select value={action} onChange={(event) => setAction(event.target.value)} aria-label="Filter by action">
            <option value="all">All actions</option>
            {actions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button className="btn btn--secondary" type="button" onClick={exportCsv} disabled={filtered.length === 0}>
          Export CSV ({filtered.length})
        </button>
      </div>
      {filtered.length === 0 ? <p className="muted">No activity matches these filters.</p> : (
        <table className="data-table">
          <thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>Time</th></tr></thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.action}</td>
                <td>{entry.entityType}{entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ''}</td>
                <td>{entry.actor}</td>
                <td>{new Date(entry.createdAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
