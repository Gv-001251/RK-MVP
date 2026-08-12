"use client";

import React from 'react';

/**
 * Reusable vertical status timeline. Renders a list of transition events using
 * the shared .timeline-* styles. Each event: { to_status, actor, note,
 * created_at, action }.
 */
const STATUS_DOT = {
  Ordered: '#d97706',
  Collected: '#4f46e5',
  Received: '#0d9488',
  Processing: '#6366f1',
  Completed: '#059669',
  Rejected: '#e11d48',
};

function fmt(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export default function StatusTimeline({ events = [], emptyText = 'No history yet.' }) {
  if (!events.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{emptyText}</p>;
  }
  return (
    <div className="timeline-feed">
      {events.map((e, i) => (
        <div key={i} className="timeline-note-item">
          <div className="timeline-note-dot" style={{ backgroundColor: STATUS_DOT[e.to_status] || 'var(--border-color)' }} />
          <div className="timeline-note-header">
            <span className="timeline-note-author">{e.to_status}</span>
            <span>{fmt(e.created_at)}</span>
          </div>
          {e.note && <div className="timeline-note-content">{e.note}</div>}
          <div style={{ marginTop: '3px', display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-muted)' }}>
            {e.actor && <span>User: <strong style={{ color: 'var(--text-secondary)' }}>{e.actor}</strong></span>}
            {e.machine && <span>Machine: <strong style={{ color: 'var(--text-secondary)' }}>{e.machine}</strong></span>}
            {e.action && <span>Action: {e.action}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
