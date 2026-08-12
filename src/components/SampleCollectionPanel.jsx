"use client";

import React, { useState, useEffect, useCallback } from 'react';
import StatusTimeline from './StatusTimeline';

const SAMPLE_TYPES = ['Whole Blood', 'Serum', 'Plasma', 'Urine', 'Stool', 'Swab', 'CSF', 'Sputum', 'Other'];
const TUBE_TYPES = ['EDTA (Lavender)', 'Plain / Clot (Red)', 'SST (Gold)', 'Fluoride (Grey)', 'Citrate (Blue)', 'Heparin (Green)', 'Sterile Container', 'Other'];
const LOCATIONS = ['OPD', 'Ward', 'ICU', 'Emergency', 'Home Collection', 'Lab'];
const REJECT_REASONS = ['Hemolyzed', 'Lipemic', 'Clotted', 'Broken Tube', 'Insufficient Quantity', 'Wrong Patient'];
const STATUSES = ['Ordered', 'Collected', 'Received', 'Processing', 'Completed', 'Rejected'];

function statusBadge(s) {
  return ({
    Ordered: 'badge-amber', Collected: 'badge-sky', Received: 'badge-teal',
    Processing: 'badge-indigo', Completed: 'badge-emerald', Rejected: 'badge-rose',
  })[s] || 'badge-secondary';
}
function priorityBadge(p) { return p === 'STAT' ? 'badge-rose' : p === 'Urgent' ? 'badge-amber' : 'badge-sky'; }
function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }

const emptyCollect = () => ({
  collector: '', collectionDate: todayStr(), collectionTime: nowTime(),
  sampleType: 'Whole Blood', tubeType: 'EDTA (Lavender)', collectionLocation: 'OPD',
  sampleVolume: '', remarks: '',
});

export default function SampleCollectionPanel() {
  const [view, setView] = useState('worklist');
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fq, setFq] = useState('');
  const [me, setMe] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collect, setCollect] = useState(emptyCollect());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const loadWorklist = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (fStatus) params.set('status', fStatus);
      if (fPriority) params.set('priority', fPriority);
      if (fq) params.set('q', fq);
      const res = await fetch(`/api/lab/samples?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSamples(data.samples || []);
      setError('');
    } catch {
      setError('Could not load the collection worklist. Make sure you are signed in with a lab role.');
    } finally {
      setLoading(false);
    }
  }, [fStatus, fPriority, fq]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWorklist();
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      const name = d?.profile?.full_name || d?.user?.full_name || d?.user?.username || '';
      if (name) setMe(name);
    }).catch(() => {});
  }, [loadWorklist]);

  const openDetail = useCallback(async (orderId) => {
    setView('detail'); setDetail(null); setDetailLoading(true); setActionMsg(''); setRejectOpen(false);
    try {
      const res = await fetch(`/api/lab/samples/${encodeURIComponent(orderId)}`);
      const data = await res.json();
      if (res.ok) {
        setDetail(data);
        setCollect({ ...emptyCollect(), collector: me || '' });
      } else {
        setDetail({ error: data.error || 'Not found' });
      }
    } catch {
      setDetail({ error: 'Network error' });
    } finally {
      setDetailLoading(false);
    }
  }, [me]);

  const doAction = async (action, payload = {}) => {
    if (!detail?.order) return;
    setBusy(true); setActionMsg('');
    try {
      const res = await fetch(`/api/lab/samples/${encodeURIComponent(detail.order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (res.ok) {
        setRejectOpen(false);
        await openDetail(detail.order.id);
      } else {
        setActionMsg(data.error || 'Action failed.');
      }
    } catch {
      setActionMsg('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const submitCollect = () => {
    if (!collect.collector || !collect.sampleType) { setActionMsg('Collector and sample type are required.'); return; }
    doAction('collect', collect);
  };

  const tab = (id, label) => (
    <button onClick={() => { setView(id); if (id === 'worklist') loadWorklist(); }}
      className={`btn btn-sm ${view === id ? 'btn-primary' : 'btn-secondary'}`} style={{ minWidth: '110px' }}>{label}</button>
  );

  const s = detail?.sample;
  const status = s?.status || 'Ordered';
  const canCollect = ['Ordered', 'Rejected'].includes(status);
  const canReceive = status === 'Collected';
  const canProcess = status === 'Received';
  const canComplete = status === 'Processing';
  const canReject = ['Ordered', 'Collected', 'Received', 'Processing'].includes(status);

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Sample Collection</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Collect, receive, process and track specimens through the lab.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>{tab('worklist', 'Worklist')}{detail && tab('detail', 'Sample')}</div>
      </div>

      {/* ── WORKLIST ── */}
      {view === 'worklist' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <input className="form-control" style={{ flex: '1 1 220px' }} placeholder="Order ID, accession, patient…" value={fq} onChange={e => setFq(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadWorklist()} />
            <select className="form-control" style={{ maxWidth: '170px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">Any status</option>
              {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: '150px' }} value={fPriority} onChange={e => setFPriority(e.target.value)}>
              <option value="">Any priority</option>
              {['STAT', 'Urgent', 'Routine'].map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <button className="btn btn-primary" onClick={loadWorklist}>Search</button>
          </div>

          {error ? <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
            : loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : samples.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No samples match.</div>
            : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Patient</th><th>Accession</th><th>Priority</th><th>Status</th><th>Sample</th><th>Collector</th><th>Ordered</th></tr></thead>
                  <tbody>
                    {samples.map(row => (
                      <tr key={row.lab_order_id} onClick={() => openDetail(row.lab_order_id)} style={{ cursor: 'pointer' }}>
                        <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.patient_name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.patient_id}</div></td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.accession_number || '—'}</td>
                        <td><span className={`badge ${priorityBadge(row.priority)}`}>{row.priority}</span></td>
                        <td><span className={`badge ${statusBadge(row.status)}`}>{row.status}</span>{row.rejection_reason ? <div style={{ fontSize: '10px', color: 'var(--rose-hover)' }}>{row.rejection_reason}</div> : null}</td>
                        <td style={{ fontSize: '12px' }}>{row.sample_type || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{row.collector || '—'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(row.ordered_at)}</td>
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
          <button className="btn btn-secondary btn-sm" onClick={() => setView('worklist')} style={{ marginBottom: '14px' }}>← Back to worklist</button>
          {detailLoading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : !detail ? null
            : detail.error ? <div style={{ color: 'var(--rose-hover)' }}>{detail.error}</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.7fr) minmax(240px, 1fr)', gap: '24px' }}>
                {/* Left: order + actions */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, margin: 0, fontSize: '18px' }}>{detail.order.id}</h3>
                    <span className={`badge ${statusBadge(status)}`}>{status}</span>
                    <span className={`badge ${priorityBadge(detail.order.priority)}`}>{detail.order.priority}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{detail.order.patient_name}</strong> · {detail.order.patient_id}
                    {detail.patient ? ` · ${detail.patient.age || '—'}y · ${detail.patient.gender || '—'}` : ''}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Accession {detail.sample?.accession_number || detail.order.accession_number || '—'} · {(detail.tests || []).length} test(s)
                  </div>

                  {/* Collected details (read-only) once collected */}
                  {!canCollect && (
                    <div style={{ marginTop: '14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: '12.5px' }}>
                      {[['Collector', s.collector], ['Collected', fmt(s.collected_at)], ['Sample Type', s.sample_type], ['Tube', s.tube_type], ['Location', s.collection_location], ['Volume', s.sample_volume]].map(([k, v]) => (
                        <div key={k}><span style={{ color: 'var(--text-muted)' }}>{k}: </span><strong style={{ color: 'var(--text-primary)' }}>{v || '—'}</strong></div>
                      ))}
                      {s.remarks && <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text-muted)' }}>Remarks: </span>{s.remarks}</div>}
                      {s.status === 'Rejected' && <div style={{ gridColumn: 'span 2', color: 'var(--rose-hover)', fontWeight: 600 }}>Rejected: {s.rejection_reason}</div>}
                    </div>
                  )}

                  {/* Collection form */}
                  {canCollect && (
                    <div style={{ marginTop: '14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '10px', color: 'var(--text-primary)' }}>{status === 'Rejected' ? 'Re-collect Sample' : 'Collect Sample'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><label className="form-label">Collector</label><input className="form-control" value={collect.collector} onChange={e => setCollect({ ...collect, collector: e.target.value })} placeholder="Name" /></div>
                        <div><label className="form-label">Volume</label><input className="form-control" value={collect.sampleVolume} onChange={e => setCollect({ ...collect, sampleVolume: e.target.value })} placeholder="e.g. 3 mL" /></div>
                        <div><label className="form-label">Collection Date</label><input type="date" className="form-control" value={collect.collectionDate} onChange={e => setCollect({ ...collect, collectionDate: e.target.value })} /></div>
                        <div><label className="form-label">Collection Time</label><input type="time" className="form-control" value={collect.collectionTime} onChange={e => setCollect({ ...collect, collectionTime: e.target.value })} /></div>
                        <div><label className="form-label">Sample Type</label><select className="form-control" value={collect.sampleType} onChange={e => setCollect({ ...collect, sampleType: e.target.value })}>{SAMPLE_TYPES.map(x => <option key={x}>{x}</option>)}</select></div>
                        <div><label className="form-label">Tube Type</label><select className="form-control" value={collect.tubeType} onChange={e => setCollect({ ...collect, tubeType: e.target.value })}>{TUBE_TYPES.map(x => <option key={x}>{x}</option>)}</select></div>
                        <div><label className="form-label">Location</label><select className="form-control" value={collect.collectionLocation} onChange={e => setCollect({ ...collect, collectionLocation: e.target.value })}>{LOCATIONS.map(x => <option key={x}>{x}</option>)}</select></div>
                        <div style={{ gridColumn: 'span 2' }}><label className="form-label">Remarks</label><input className="form-control" value={collect.remarks} onChange={e => setCollect({ ...collect, remarks: e.target.value })} placeholder="Optional" /></div>
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: '12px' }} disabled={busy} onClick={submitCollect}>{busy ? 'Saving…' : (status === 'Rejected' ? 'Re-collect' : 'Collect Sample')}</button>
                    </div>
                  )}

                  {/* Lifecycle actions */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                    {canReceive && <button className="btn btn-teal btn-sm" disabled={busy} onClick={() => doAction('receive')}>Mark Received</button>}
                    {canProcess && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => doAction('process')}>Start Processing</button>}
                    {canComplete && <button className="btn btn-emerald btn-sm" disabled={busy} onClick={() => doAction('complete')}>Mark Completed</button>}
                    {canReject && <button className="btn btn-rose btn-sm" disabled={busy} onClick={() => setRejectOpen(!rejectOpen)}>Reject Sample</button>}
                    {status === 'Completed' && <span style={{ color: 'var(--emerald-hover)', fontWeight: 700, fontSize: '13px' }}>✓ Completed</span>}
                  </div>

                  {rejectOpen && (
                    <div style={{ marginTop: '12px', border: '1px solid rgba(225,29,72,0.3)', borderRadius: 'var(--radius-md)', padding: '14px', background: 'var(--rose-light)' }}>
                      <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--rose-hover)' }}>Reject Sample</div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 200px' }}><label className="form-label">Reason</label><select className="form-control" value={rejectReason} onChange={e => setRejectReason(e.target.value)}>{REJECT_REASONS.map(x => <option key={x}>{x}</option>)}</select></div>
                        <div style={{ flex: '2 1 220px' }}><label className="form-label">Remarks</label><input className="form-control" value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)} placeholder="Optional detail" /></div>
                        <button className="btn btn-rose" disabled={busy} onClick={() => doAction('reject', { reason: rejectReason, remarks: rejectRemarks })}>Confirm Reject</button>
                      </div>
                    </div>
                  )}

                  {actionMsg && <div style={{ marginTop: '10px', color: 'var(--rose-hover)', fontSize: '13px' }}>{actionMsg}</div>}
                </div>

                {/* Right: timeline */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '14px' }}>Timeline</div>
                  <StatusTimeline events={detail.timeline || []} />
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
