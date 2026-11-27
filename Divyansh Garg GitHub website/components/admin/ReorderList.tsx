'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Item {
  id: string;
  title: string;
  visibility: string;
}

export function ReorderList({ collection, items }: { collection: string; items: Item[] }) {
  const [order, setOrder] = useState(items);
  const [dragging, setDragging] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const save = async (next: Item[], previous: Item[]) => {
    setStatus('Saving order…');
    const response = await fetch('/api/admin/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, ids: next.map((item) => item.id) }),
    });
    if (response.ok) {
      setStatus('Order saved');
      return;
    }
    const result = await response.json().catch(() => ({}));
    setOrder(previous);
    setStatus(result.error ?? 'Could not save order — previous order restored');
  };

  const drop = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const from = order.findIndex((item) => item.id === dragging);
    const to = order.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const previous = order;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    setDragging(null);
    void save(next, previous);
  };

  return (
    <>
      <div className="status-text" style={{ marginBottom: 12 }}>{status || 'Drag to reorder, then changes save automatically.'}</div>
      <div className="reorder-list">
        {order.map((item) => (
          <div
            className={`reorder-item${dragging === item.id ? ' is-dragging' : ''}`}
            key={item.id}
            draggable
            onDragStart={() => setDragging(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => drop(item.id)}
            onDragEnd={() => setDragging(null)}
          >
            <span className="reorder-item__handle" aria-hidden="true">⠿</span>
            <span className={`pill pill--${item.visibility}`}>{item.visibility}</span>
            <span>{item.title}</span>
            <Link className="btn btn--ghost btn--small" style={{ marginLeft: 'auto' }} href={`/admin/${collection}/${item.id}`}>Edit</Link>
          </div>
        ))}
      </div>
    </>
  );
}
