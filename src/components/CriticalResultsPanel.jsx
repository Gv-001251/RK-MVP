"use client";

import React, { useState, useEffect, useCallback } from 'react';

const ACK_ROLES = ['technician', 'senior_technician', 'pathologist', 'admin'];

function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
function sevBadge(s) { return s === 'High' ? 'badge-amber' : 'badge-rose'; }

export default function CriticalResultsPanel() {
  const [tab, setTab] = useState('active');
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [canConfirm, setCanConfirm] = useState(false);

  const [view, setView] = useState('list');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'log') {
        const res = await fetch('/api/lab/critical-notifications?limit=200');
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setNotifications(data.notifications || []);
      } else {
        const params = new URLSearchParams();
        if (tab === 'active') params.set('status', 'Active');
        if (q) params.set('q', q);
        const res = await fetch(`/api/lab/critical-alerts?${params.toString()}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
      setError('');
    } catch {
      setError('Could not load critical results. Sign in with a lab role.');
    } finally {
      setLoading(false);
    }
  }, [tab, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      setCanConfirm(ACK_ROLES.includes(d?.profile?.role || d?.user?.role || ''));
    }).catch(() => {});
  }, []);

  const openDetail = useCallback(async (id) => {
    setView('detail'); setDetail(null); setDetailLoading(true); setNote(''); setMsg('');
    try {
      const res = await fetch(`/api/lab/critical-alerts/${encodeURIComponent(id)}`);
      const data = await res.json();
      setDetail(res.ok ? data : { error: data.error || 'Not found' });
    } catch {
      setDetail({ error: 'Network error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const confirm = async (id) => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/lab/critical-alerts/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (res.ok) { if (view === 'detail') openDetail(id); else load(); }
      else setMsg(data.error || 'Confirmation failed.');
    } catch {
      setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const a = detail?.alert;

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Critical Results</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Life-threatening values detected against configured thresholds. Requires technician confirmation.</p>
        </div>
        {view === 'detail' && <button className="btn btn-secondary btn-sm" onClick={() => { setView('list'); load(); }}>← Back to list</button>}
      </div>

      {view === 'list' ? (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[['active', 'Active'], ['history', 'History'], ['log', 'Notification Log']].map(([id, label]) => (
              <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab(id); }}>{label}</button>
            ))}
            {tab !== 'log' && (
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <input className="form-control" style={{ maxWidth: '240px' }} placeholder="Search patient / test…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
                <button className="btn btn-primary btn-sm" onClick={load}>Search</button>
              </div>
            )}
          </div>

          {error ? <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
            : loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : tab === 'log' ? (
              notifications.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No notifications logged.</div>
                : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead><tr><th>Time</th><th>Event</th><th>Patient</th><th>Test / Value</th><th>By</th><th>Detail</th></tr></thead>
                      <tbody>
                        {notifications.map(n => (
                          <tr key={n.id}>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(n.created_at)}</td>
                            <td><span className={`badge ${n.event === 'acknowledged' ? 'badge-emerald' : n.event === 'created' ? 'badge-rose' : 'badge-sky'}`}>{n.event}</span></td>
                            <td>{n.patient_name || '—'}</td>
                            <td style={{ fontWeight: 600 }}>{n.test_name ? `${n.test_name}: ${n.result_value || ''}` : '—'}</td>
                            <td style={{ fontSize: '12px' }}>{n.actor || '—'}{n.role ? ` (${n.role})` : ''}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{n.detail || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            ) : (
              alerts.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>{tab === 'active' ? 'No active critical results. All clear.' : 'No critical results found.'}</div>
                : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead><tr><th>Detected</th><th>Patient</th><th>Test</th><th>Value</th><th>Critical</th><th>Severity</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                      <tbody>
                        {alerts.map(al => (
                          <tr key={al.id} style={{ background: al.status === 'Active' ? 'var(--rose-light)' : 'transparent', cursor: 'pointer' }} onClick={() => openDetail(al.id)}>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(al.detected_at)}</td>
                            <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{al.patient_name || 'Unknown'}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{al.patient_id || al.lab_task_id}</div></td>
                            <td style={{ fontWeight: 600 }}>{al.test_name}</td>
                            <td style={{ fontWeight: 800, color: 'var(--rose-hover)' }}>{al.result_value}</td>
                            <td style={{ fontSize: '12px' }}>{al.threshold_text}</td>
                            <td><span className={`badge ${sevBadge(al.severity)}`}>{al.severity}</span></td>
                            <td><span className={`badge ${al.acknowledged ? 'badge-emerald' : 'badge-rose'}`}>{al.status}</span></td>
                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              {!al.acknowledged && canConfirm
                                ? <button className="btn btn-rose btn-sm" disabled={busy} onClick={() => confirm(al.id)}>Confirm</button>
                                : al.acknowledged ? <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{al.acknowledged_by}</span> : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}
        </>
      ) : (
        /* DETAIL */
        detailLoading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          : !detail ? null
          : detail.error ? <div style={{ color: 'var(--rose-hover)' }}>{detail.error}</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.4fr) minmax(240px, 1fr)', gap: '26px' }}>
              <div>
                <div style={{ border: `2px solid var(--rose, #e11d48)`, borderRadius: 'var(--radius-md)', padding: '18px', background: 'var(--rose-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <span className={`badge ${sevBadge(a.severity)}`}>{a.severity}</span>
                    <span className={`badge ${a.acknowledged ? 'badge-emerald' : 'badge-rose'}`}>{a.status}</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--rose-hover)' }}>{a.test_name}: {a.result_value}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Critical when {a.threshold_text}{a.machine_name ? ` · ${a.machine_name}` : ''}</div>
                  {a.message ? <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>{a.message}</div> : null}
                  <div style={{ marginTop: '10px', fontSize: '13px' }}>
                    <strong>{a.patient_name || 'Unknown patient'}</strong> · {a.patient_id || '—'} · order {a.lab_order_id || a.lab_task_id || '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Detected {fmt(a.detected_at)}</div>
                </div>

                {/* Confirmation */}
                <div style={{ marginTop: '16px' }}>
                  {a.acknowledged ? (
                    <div style={{ fontSize: '13px', color: 'var(--emerald-hover, #047857)' }}>
                      Confirmed by <strong>{a.acknowledged_by}</strong> ({a.acknowledged_role}) at {fmt(a.acknowledged_at)}.
                      {a.ack_note ? <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>Note: {a.ack_note}</div> : null}
                    </div>
                  ) : canConfirm ? (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>Technician confirmation</div>
                      <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note (action taken, doctor notified…)" style={{ marginBottom: '10px' }} />
                      <button className="btn btn-rose" disabled={busy} onClick={() => confirm(a.id)}>{busy ? 'Confirming…' : 'Confirm Critical Result'}</button>
                      {msg && <div style={{ marginTop: '8px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Awaiting technician confirmation.</div>
                  )}
                </div>
              </div>

              {/* Notification log for this alert */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>Notification History</div>
                {(detail.notifications || []).length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No log entries.</p>
                  : (
                    <div className="timeline-feed">
                      {[...detail.notifications].reverse().map((n, i) => (
                        <div key={i} className="timeline-note-item">
                          <div className="timeline-note-dot" style={{ backgroundColor: n.event === 'acknowledged' ? '#059669' : '#e11d48' }} />
                          <div className="timeline-note-header">
                            <span className="timeline-note-author">{n.event}</span>
                            <span>{fmt(n.created_at)}</span>
                          </div>
                          <div className="timeline-note-content">{n.actor || 'System'}{n.role ? ` (${n.role})` : ''}{n.detail ? ` — ${n.detail}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )
      )}
    </div>
  );
}
