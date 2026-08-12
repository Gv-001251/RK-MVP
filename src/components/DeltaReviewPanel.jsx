"use client";

import React, { useState, useEffect, useCallback } from 'react';

const REVIEW_ROLES = ['technician', 'senior_technician', 'pathologist', 'admin'];

function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
function sevBadge(s) { return s === 'Critical' ? 'badge-rose' : 'badge-amber'; }
function dirArrow(d) { return d === 'increase' ? '▲' : d === 'decrease' ? '▼' : ''; }
function deltaText(f) {
  const parts = [];
  if (f.abs_delta != null) parts.push(`Δ ${parseFloat(f.abs_delta)}`);
  if (f.pct_delta != null) parts.push(`${parseFloat(f.pct_delta)}%`);
  return `${dirArrow(f.direction)} ${parts.join(' · ')}`.trim();
}

export default function DeltaReviewPanel() {
  const [tab, setTab] = useState('flagged');
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [canReview, setCanReview] = useState(false);

  const [view, setView] = useState('list');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab === 'flagged') params.set('status', 'Flagged');
      if (tab === 'reviewed') params.set('status', 'Reviewed');
      if (q) params.set('q', q);
      const res = await fetch(`/api/lab/delta-flags?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setFlags(data.flags || []);
      setError('');
    } catch {
      setError('Could not load delta flags. Sign in with a lab role.');
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
      setCanReview(REVIEW_ROLES.includes(d?.profile?.role || d?.user?.role || ''));
    }).catch(() => {});
  }, []);

  const openDetail = useCallback(async (id) => {
    setView('detail'); setDetail(null); setDetailLoading(true); setNote(''); setMsg('');
    try {
      const res = await fetch(`/api/lab/delta-flags/${encodeURIComponent(id)}`);
      const data = await res.json();
      setDetail(res.ok ? data : { error: data.error || 'Not found' });
    } catch {
      setDetail({ error: 'Network error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const review = async (id, action) => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/lab/delta-flags/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (res.ok) { if (view === 'detail') openDetail(id); else load(); }
      else setMsg(data.error || 'Review failed.');
    } catch {
      setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const f = detail?.flag;

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Delta Check Review</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Results that changed beyond the configured delta from the patient&apos;s previous value. Manual verification required.</p>
        </div>
        {view === 'detail' && <button className="btn btn-secondary btn-sm" onClick={() => { setView('list'); load(); }}>← Back to list</button>}
      </div>

      {view === 'list' ? (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[['flagged', 'Flagged'], ['reviewed', 'Reviewed'], ['all', 'All']].map(([id, label]) => (
              <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>{label}</button>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <input className="form-control" style={{ maxWidth: '240px' }} placeholder="Search patient / test…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
              <button className="btn btn-primary btn-sm" onClick={load}>Search</button>
            </div>
          </div>

          {error ? <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
            : loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : flags.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>{tab === 'flagged' ? 'No results awaiting delta review.' : 'No delta flags found.'}</div>
            : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Detected</th><th>Patient</th><th>Test</th><th>Previous → Current</th><th>Delta</th><th>Severity</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                  <tbody>
                    {flags.map(fl => (
                      <tr key={fl.id} style={{ background: fl.status === 'Flagged' ? 'var(--amber-light, #fef3c7)' : 'transparent', cursor: 'pointer' }} onClick={() => openDetail(fl.id)}>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(fl.detected_at)}</td>
                        <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fl.patient_name || 'Unknown'}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fl.patient_id || fl.lab_task_id}</div></td>
                        <td style={{ fontWeight: 600 }}>{fl.test_name}</td>
                        <td style={{ fontSize: '13px' }}><span style={{ color: 'var(--text-muted)' }}>{fl.previous_value}</span> → <strong style={{ color: 'var(--amber-hover, #b45309)' }}>{fl.current_value}</strong></td>
                        <td style={{ fontWeight: 700, fontSize: '12px' }}>{deltaText(fl)}</td>
                        <td><span className={`badge ${sevBadge(fl.severity)}`}>{fl.severity}</span></td>
                        <td><span className={`badge ${fl.status === 'Flagged' ? 'badge-amber' : fl.status === 'Dismissed' ? 'badge-secondary' : 'badge-emerald'}`}>{fl.status}</span></td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          {fl.status === 'Flagged' && canReview
                            ? <button className="btn btn-primary btn-sm" onClick={() => openDetail(fl.id)}>Review</button>
                            : fl.reviewed_by ? <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fl.reviewed_by}</span> : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </>
      ) : (
        detailLoading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          : !detail ? null
          : detail.error ? <div style={{ color: 'var(--rose-hover)' }}>{detail.error}</div>
          : (
            <div style={{ maxWidth: '760px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, margin: 0, fontSize: '18px' }}>{f.test_name}</h3>
                <span className={`badge ${sevBadge(f.severity)}`}>{f.severity}</span>
                <span className={`badge ${f.status === 'Flagged' ? 'badge-amber' : f.status === 'Dismissed' ? 'badge-secondary' : 'badge-emerald'}`}>{f.status}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{f.patient_name || 'Unknown patient'}</strong> · {f.patient_id || '—'} · order {f.lab_order_id || f.lab_task_id || '—'}
              </div>

              {/* Current vs previous comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Previous</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-secondary)' }}>{f.previous_value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmt(f.previous_at)}</div>
                </div>
                <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--amber-hover, #b45309)' }}>
                  <div style={{ fontSize: '20px' }}>{dirArrow(f.direction)}</div>
                  <div style={{ fontSize: '12px' }}>{deltaText(f)}</div>
                </div>
                <div style={{ border: '2px solid var(--amber, #d97706)', borderRadius: 'var(--radius-md)', padding: '14px', textAlign: 'center', background: 'var(--amber-light, #fef3c7)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--amber-hover, #b45309)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--amber-hover, #b45309)' }}>{f.current_value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmt(f.detected_at)}</div>
                </div>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Rule: <strong>{f.threshold_text}</strong>{f.machine_name ? ` · ${f.machine_name}` : ''}
                {f.message ? <div style={{ marginTop: '4px', color: 'var(--text-primary)' }}>{f.message}</div> : null}
              </div>

              {/* Manual verification */}
              {f.status !== 'Flagged' ? (
                <div style={{ fontSize: '13px', color: 'var(--emerald-hover, #047857)' }}>
                  {f.review_action ? `${f.review_action.charAt(0).toUpperCase()}${f.review_action.slice(1)}` : 'Reviewed'} by <strong>{f.reviewed_by}</strong> ({f.reviewed_role}) at {fmt(f.reviewed_at)}.
                  {f.review_note ? <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>Note: {f.review_note}</div> : null}
                </div>
              ) : canReview ? (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>Manual verification</div>
                  <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note (repeat performed, sample OK, clinically consistent…)" style={{ marginBottom: '10px' }} />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-emerald" disabled={busy} onClick={() => review(f.id, 'accepted')}>Accept (verified)</button>
                    <button className="btn btn-rose" disabled={busy} onClick={() => review(f.id, 'rejected')}>Reject (recheck)</button>
                    <button className="btn btn-secondary" disabled={busy} onClick={() => review(f.id, 'dismissed')}>Dismiss</button>
                  </div>
                  {msg && <div style={{ marginTop: '8px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Awaiting manual verification by lab staff.</div>
              )}
            </div>
          )
      )}
    </div>
  );
}
