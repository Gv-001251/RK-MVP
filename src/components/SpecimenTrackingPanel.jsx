"use client";

import React, { useState, useEffect, useCallback } from 'react';
import StatusTimeline from './StatusTimeline';

// Canonical specimen journey. Each stage lists the event to_status values that satisfy it.
const STAGES = [
  { key: 'Ordered', aliases: ['Ordered'] },
  { key: 'Barcode Printed', aliases: ['Barcode Printed'] },
  { key: 'Collected', aliases: ['Collected'] },
  { key: 'Received', aliases: ['Received', 'Sample Registered'] },
  { key: 'Assigned to Analyzer', aliases: ['Assigned to Analyzer'] },
  { key: 'Running', aliases: ['Running', 'Analyzer Running'] },
  { key: 'Analyzer Completed', aliases: ['Analyzer Completed'] },
  { key: 'Pending Verification', aliases: ['Pending Verification'] },
  { key: 'Verified', aliases: ['Verified'] },
  { key: 'Released', aliases: ['Released', 'Report Delivered'] },
];

function fmt(v) { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
function statusBadge(s) {
  return ({
    Ordered: 'badge-amber', Collected: 'badge-sky', Received: 'badge-teal', 'Analyzer Running': 'badge-indigo',
    'Pending Verification': 'badge-cyan', Verified: 'badge-emerald', 'Report Delivered': 'badge-teal',
    Released: 'badge-teal', Rejected: 'badge-rose', Cancelled: 'badge-rose',
  })[s] || 'badge-secondary';
}

/** Visual vertical stepper of the canonical specimen journey. */
function SpecimenJourney({ timeline }) {
  const rejected = timeline.find(e => e.to_status === 'Rejected');
  const matched = STAGES.map(stage => {
    const evs = timeline.filter(e => stage.aliases.includes(e.to_status));
    return { ...stage, event: evs.length ? evs[evs.length - 1] : null };
  });

  return (
    <div>
      {rejected && (
        <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600, fontSize: '13px' }}>
          Specimen rejected{rejected.note ? ` — ${rejected.note}` : ''} ({fmt(rejected.created_at)})
        </div>
      )}
      {matched.map((stage, i) => {
        const done = !!stage.event;
        const isLast = i === matched.length - 1;
        return (
          <div key={stage.key} style={{ display: 'flex', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                background: done ? 'var(--emerald)' : 'var(--bg-surface)',
                border: done ? '2px solid var(--emerald)' : '2px solid var(--border-strong)',
                boxShadow: done ? '0 0 0 3px rgba(5,150,105,0.15)' : 'none',
              }} />
              {!isLast && <div style={{ width: '2px', flex: 1, minHeight: '26px', background: done ? 'var(--emerald)' : 'var(--border-color)' }} />}
            </div>
            <div style={{ paddingBottom: '18px', flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: done ? 700 : 500, color: done ? 'var(--text-primary)' : 'var(--text-muted)' }}>{stage.key}</div>
              {done ? (
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span>{fmt(stage.event.created_at)}</span>
                  {stage.event.actor && <span>· {stage.event.actor}</span>}
                  {stage.event.machine && <span>· {stage.event.machine}</span>}
                </div>
              ) : (
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>Pending</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SpecimenTrackingPanel() {
  const [view, setView] = useState('list');
  const [specimens, setSpecimens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [trackCode, setTrackCode] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const res = await fetch(`/api/lab/specimens?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSpecimens(data.specimens || []);
      setError('');
    } catch {
      setError('Could not load specimens. Make sure you are signed in with a lab role.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const openDetail = useCallback(async (code) => {
    if (!code) return;
    setView('detail'); setDetail(null); setDetailLoading(true); setNote('');
    try {
      const res = await fetch(`/api/lab/specimens/${encodeURIComponent(code)}`);
      const data = await res.json();
      setDetail(res.ok ? data : { error: data.error || 'Not found' });
    } catch {
      setDetail({ error: 'Network error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const addNote = async () => {
    if (!note.trim() || !detail?.specimen) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/lab/specimens/${encodeURIComponent(detail.specimen.labOrderId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (res.ok) { setNote(''); openDetail(detail.specimen.labOrderId); }
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Specimen Tracking</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Follow each specimen through its full journey — with timestamp, user, machine, action and notes.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setView('list'); loadList(); }} className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}>All Specimens</button>
        </div>
      </div>

      {/* ── LIST ── */}
      {view === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <input className="form-control" style={{ flex: '1 1 240px' }} placeholder="Search order / accession / patient…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadList()} />
            <button className="btn btn-primary" onClick={loadList}>Search</button>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input className="form-control" style={{ width: '200px' }} placeholder="Scan / enter barcode…" value={trackCode} onChange={e => setTrackCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && openDetail(trackCode.trim())} />
              <button className="btn btn-secondary" onClick={() => openDetail(trackCode.trim())}>Track</button>
            </div>
          </div>

          {error ? <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
            : loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : specimens.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No specimens found.</div>
            : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Accession</th><th>Patient</th><th>Priority</th><th>Current Status</th><th>Events</th><th>Last Update</th></tr></thead>
                  <tbody>
                    {specimens.map(sp => (
                      <tr key={sp.lab_order_id} onClick={() => openDetail(sp.lab_order_id)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{sp.accession_number || sp.lab_order_id}</td>
                        <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{sp.patient_name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sp.patient_id}</div></td>
                        <td><span className={`badge ${sp.priority === 'STAT' ? 'badge-rose' : sp.priority === 'Urgent' ? 'badge-amber' : 'badge-sky'}`}>{sp.priority}</span></td>
                        <td><span className={`badge ${statusBadge(sp.status)}`}>{sp.status}</span></td>
                        <td>{sp.event_count}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(sp.last_event_at || sp.ordered_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ── DETAIL ── */}
      {view === 'detail' && (
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => setView('list')} style={{ marginBottom: '14px' }}>← Back</button>
          {detailLoading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : !detail ? null
            : detail.error ? <div style={{ color: 'var(--rose-hover)' }}>{detail.error}</div>
            : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, margin: 0, fontSize: '18px' }}>{detail.specimen.accessionNumber || detail.specimen.labOrderId}</h3>
                  <span className={`badge ${statusBadge(detail.specimen.status)}`}>{detail.specimen.status}</span>
                  <span className="badge badge-secondary" style={{ fontFamily: 'monospace' }}>{detail.specimen.barcode}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{detail.patient?.name}</strong> · {detail.patient?.id}
                  {detail.patient?.age ? ` · ${detail.patient.age}y` : ''} · {(detail.tests || []).length} test(s)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1.2fr)', gap: '28px' }}>
                  {/* Visual journey */}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>Specimen Journey</div>
                    <SpecimenJourney timeline={detail.timeline || []} />
                  </div>

                  {/* Detailed event log */}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>Event Log</div>
                    <StatusTimeline events={[...(detail.timeline || [])].reverse()} />
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <label className="form-label">Add a tracking note</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. sample re-labelled" onKeyDown={e => e.key === 'Enter' && addNote()} />
                        <button className="btn btn-secondary" disabled={savingNote || !note.trim()} onClick={addNote}>{savingNote ? '…' : 'Add'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
        </div>
      )}
    </div>
  );
}
