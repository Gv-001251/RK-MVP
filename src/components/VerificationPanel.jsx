"use client";

import React, { useState, useEffect, useCallback } from 'react';
import ResultHistograms from './ResultHistograms';

const STATUSES = ['Pending', 'Technician Review', 'Senior Review', 'Released', 'Amended', 'Rejected'];

function statusBadge(s) {
  return ({
    Pending: 'badge-amber', 'Technician Review': 'badge-sky', 'Senior Review': 'badge-indigo',
    Released: 'badge-emerald', Amended: 'badge-teal', Rejected: 'badge-rose',
  })[s] || 'badge-secondary';
}
function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }

// action -> input requirements + label
const ACTION_META = {
  verify:  { label: 'Verify', cls: 'btn-primary', sig: true, reason: false },
  reject:  { label: 'Reject', cls: 'btn-rose', sig: false, reason: true },
  approve: { label: 'Approve', cls: 'btn-primary', sig: true, reason: false },
  release: { label: 'Release', cls: 'btn-emerald', sig: true, reason: false },
  amend:   { label: 'Amend', cls: 'btn-teal', sig: true, reason: true },
};

export default function VerificationPanel() {
  const [view, setView] = useState('list');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [q, setQ] = useState('');

  const [myRole, setMyRole] = useState('');
  const [myName, setMyName] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState(null); // active action key
  const [signature, setSignature] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [criticals, setCriticals] = useState([]);
  const [deltas, setDeltas] = useState([]);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (fStatus) params.set('status', fStatus);
      if (q) params.set('q', q);
      const res = await fetch(`/api/lab/verifications?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(data.verifications || []);
      setError('');
    } catch {
      setError('Could not load the verification worklist. Sign in with a lab role.');
    } finally {
      setLoading(false);
    }
  }, [fStatus, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      setMyRole(d?.profile?.role || d?.user?.role || '');
      setMyName(d?.profile?.full_name || d?.user?.username || '');
    }).catch(() => {});
  }, [loadList]);

  const openDetail = useCallback(async (orderId) => {
    setView('detail'); setDetail(null); setDetailLoading(true); setPending(null); setMsg(''); setCriticals([]); setDeltas([]);
    try {
      const [dRes, cRes, xRes] = await Promise.all([
        fetch(`/api/lab/verifications/${encodeURIComponent(orderId)}`),
        fetch(`/api/lab/critical-alerts?taskId=${encodeURIComponent(orderId)}`),
        fetch(`/api/lab/delta-flags?taskId=${encodeURIComponent(orderId)}`),
      ]);
      const data = await dRes.json();
      setDetail(dRes.ok ? data : { error: data.error || 'Not found' });
      if (cRes.ok) { const cData = await cRes.json(); setCriticals(cData.alerts || []); }
      if (xRes.ok) { const xData = await xRes.json(); setDeltas(xData.flags || []); }
    } catch {
      setDetail({ error: 'Network error' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const normTest = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const criticalFor = (testName) => criticals.find(c => normTest(c.test_name) === normTest(testName));
  const deltaFor = (testName) => deltas.find(d => normTest(d.test_name) === normTest(testName));

  const canTech = ['technician', 'senior_technician', 'admin'].includes(myRole);
  const canSenior = ['senior_technician', 'pathologist', 'admin'].includes(myRole);
  const canAmend = ['pathologist', 'admin'].includes(myRole);

  const availableActions = (status) => {
    switch (status) {
      case 'Pending': return [canTech && 'verify', canTech && 'reject'].filter(Boolean);
      case 'Rejected': return [canTech && 'verify'].filter(Boolean);
      case 'Technician Review': return [canSenior && 'approve', canTech && 'reject'].filter(Boolean);
      case 'Senior Review': return [canSenior && 'release', canTech && 'reject'].filter(Boolean);
      case 'Released': return [canAmend && 'amend'].filter(Boolean);
      case 'Amended': return [canAmend && 'amend'].filter(Boolean);
      default: return [];
    }
  };

  const startAction = (action) => {
    setPending(action); setMsg('');
    setSignature(myName || ''); setNotes(''); setReason('');
  };

  const submitAction = async () => {
    if (!pending || !detail?.order) return;
    const meta = ACTION_META[pending];
    if (meta.sig && !signature.trim()) { setMsg('An electronic signature is required.'); return; }
    if (meta.reason && !reason.trim()) { setMsg('A reason is required.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/lab/verifications/${encodeURIComponent(detail.order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pending, signature: signature.trim(), notes, reason: reason.trim() }),
      });
      const data = await res.json();
      if (res.ok) { setPending(null); openDetail(detail.order.id); }
      else setMsg(data.error || 'Action failed.');
    } catch {
      setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const v = detail?.verification;
  const status = v?.status || 'Pending';

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Result Verification</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Technician → Senior review → Release, with electronic sign-off and an immutable audit trail.</p>
        </div>
        <button onClick={() => { setView('list'); loadList(); }} className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}>Worklist</button>
      </div>

      {/* ── LIST ── */}
      {view === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <input className="form-control" style={{ flex: '1 1 240px' }} placeholder="Search order / accession / patient…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadList()} />
            <select className="form-control" style={{ maxWidth: '190px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">Any status</option>
              {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <button className="btn btn-primary" onClick={loadList}>Search</button>
          </div>

          {error ? <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
            : loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : rows.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No results awaiting verification.</div>
            : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Patient</th><th>Accession</th><th>Priority</th><th>Results</th><th>Verification</th><th>Updated</th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.lab_order_id} onClick={() => openDetail(r.lab_order_id)} style={{ cursor: 'pointer' }}>
                        <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.patient_name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.patient_id}</div></td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.accession_number || r.lab_order_id}</td>
                        <td><span className={`badge ${r.priority === 'STAT' ? 'badge-rose' : r.priority === 'Urgent' ? 'badge-amber' : 'badge-sky'}`}>{r.priority}</span></td>
                        <td>{r.result_count}</td>
                        <td><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(r.updated_at)}</td>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.6fr) minmax(260px, 1fr)', gap: '26px' }}>
                {/* Left: results + actions */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, margin: 0, fontSize: '18px' }}>{detail.order.accession_number || detail.order.id}</h3>
                    <span className={`badge ${statusBadge(status)}`}>{status}</span>
                    {v?.amend_count > 0 && <span className="badge badge-teal">Amended ×{v.amend_count}</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{detail.patient?.name}</strong> · {detail.patient?.id}
                    {detail.patient?.age ? ` · ${detail.patient.age}y` : ''}
                  </div>

                  {detail.qcBlocked?.length > 0 && (
                    <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', border: '1px solid var(--rose, #e11d48)', color: 'var(--rose-hover)', fontWeight: 700, fontSize: '13px' }}>
                      🚫 QC FAILED for analyzer(s): {detail.qcBlocked.map(b => b.analyzerId).join(', ')}. Patient verification is blocked until QC passes or a supervisor overrides it (Quality Control screen).
                    </div>
                  )}

                  {criticals.length > 0 && (
                    <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', border: '1px solid var(--rose, #e11d48)', color: 'var(--rose-hover)', fontWeight: 700, fontSize: '13px' }}>
                      ⚠ {criticals.length} critical result{criticals.length > 1 ? 's' : ''} detected — {criticals.filter(c => !c.acknowledged).length} awaiting technician confirmation.
                    </div>
                  )}

                  {deltas.length > 0 && (
                    <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--amber-light, #fef3c7)', border: '1px solid var(--amber, #d97706)', color: 'var(--amber-hover, #b45309)', fontWeight: 700, fontSize: '13px' }}>
                      ⚠ Delta check: {deltas.length} result{deltas.length > 1 ? 's' : ''} changed significantly from the previous value — {deltas.filter(d => d.status === 'Flagged').length} require manual verification.
                    </div>
                  )}

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead><tr><th>Test</th><th>Result</th><th>Analyzer</th><th>Completed</th></tr></thead>
                      <tbody>
                        {(detail.results || []).length === 0
                          ? <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No results recorded.</td></tr>
                          : detail.results.map((t, i) => {
                            const crit = criticalFor(t.test_name);
                            const delta = deltaFor(t.test_name);
                            const rowBg = crit ? 'var(--rose-light)' : delta ? 'var(--amber-light, #fef3c7)' : undefined;
                            return (
                            <tr key={i} style={rowBg ? { background: rowBg } : undefined}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.test_name}</td>
                              <td style={{ fontWeight: 700, color: crit ? 'var(--rose-hover)' : undefined }}>
                                {t.result_value || '—'}
                                {crit ? <span className="badge badge-rose" style={{ marginLeft: '8px' }}>CRITICAL</span> : null}
                                {delta ? <span className="badge badge-amber" style={{ marginLeft: '8px' }} title={`Previous ${delta.previous_value} → ${delta.current_value}`}>DELTA</span> : null}
                              </td>
                              <td style={{ fontSize: '12px' }}>{t.machine_name || '—'}</td>
                              <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(t.completed_at)}</td>
                            </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Analyzer curves, when the instrument sent any. Placed
                      before sign-off so they are seen while reviewing. */}
                  <ResultHistograms
                    images={detail.images}
                    accession={detail.order.accession_number || detail.order.id}
                  />

                  {/* Actions */}
                  <div style={{ marginTop: '16px' }}>
                    {availableActions(status).length === 0 ? (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {status === 'Released' ? 'Report released.' : 'No actions available for your role at this stage.'}
                      </div>
                    ) : !pending ? (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {availableActions(status).map(a => (
                          <button key={a} className={`btn btn-sm ${ACTION_META[a].cls}`} onClick={() => startAction(a)}>{ACTION_META[a].label}</button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                        <div style={{ fontWeight: 700, marginBottom: '10px', color: 'var(--text-primary)' }}>{ACTION_META[pending].label} — sign-off</div>
                        {ACTION_META[pending].reason && (
                          <div style={{ marginBottom: '10px' }}>
                            <label className="form-label">Reason</label>
                            <input className="form-control" value={reason} onChange={e => setReason(e.target.value)} placeholder={pending === 'reject' ? 'Why is this being rejected?' : 'Reason for amendment'} />
                          </div>
                        )}
                        <div style={{ marginBottom: '10px' }}>
                          <label className="form-label">Verification notes</label>
                          <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
                        </div>
                        {ACTION_META[pending].sig && (
                          <div style={{ marginBottom: '10px' }}>
                            <label className="form-label">Electronic signature</label>
                            <input className="form-control" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Type your full name to sign" />
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>By signing you confirm this action as {myName || 'the signed-in user'} ({myRole || 'role'}).</div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className={`btn ${ACTION_META[pending].cls}`} disabled={busy} onClick={submitAction}>{busy ? 'Signing…' : `Confirm ${ACTION_META[pending].label}`}</button>
                          <button className="btn btn-secondary" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
                        </div>
                        {msg && <div style={{ marginTop: '10px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: verification history (append-only) */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>Verification History</div>
                  {(detail.history || []).length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No verification actions yet.</p>
                  ) : (
                    <div className="timeline-feed">
                      {[...detail.history].reverse().map((e, i) => (
                        <div key={i} className="timeline-note-item">
                          <div className="timeline-note-dot" style={{ backgroundColor: e.to_status === 'Rejected' ? '#e11d48' : e.to_status === 'Released' ? '#059669' : '#4f46e5' }} />
                          <div className="timeline-note-header">
                            <span className="timeline-note-author">{e.to_status}</span>
                            <span>{fmt(e.created_at)}</span>
                          </div>
                          <div className="timeline-note-content">
                            {e.actor} <span style={{ color: 'var(--text-muted)' }}>({e.role})</span>
                            {e.notes ? ` — ${e.notes}` : ''}
                          </div>
                          {e.signature && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>Signed: {e.signature}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
