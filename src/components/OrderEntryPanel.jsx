"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BarcodeLabel from './BarcodeLabel';

const PRIORITIES = ['Routine', 'Urgent', 'STAT'];

function priorityBadge(p) {
  return p === 'STAT' ? 'badge-rose' : p === 'Urgent' ? 'badge-amber' : 'badge-sky';
}
function statusBadge(s) {
  const map = {
    Ordered: 'badge-amber', 'Sample Registered': 'badge-sky', 'Sample Collected': 'badge-sky',
    'Analyzer Running': 'badge-indigo', 'Pending Verification': 'badge-cyan', Verified: 'badge-emerald',
    'Report Delivered': 'badge-teal', Cancelled: 'badge-rose',
  };
  return map[s] || 'badge-secondary';
}
function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }

export default function OrderEntryPanel() {
  const [view, setView] = useState('new');            // 'new' | 'search' | 'details'
  const [catalog, setCatalog] = useState({ tests: [], profiles: [] });
  const [patients, setPatients] = useState([]);
  const [refError, setRefError] = useState('');

  // New order form
  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState('');
  const [selTests, setSelTests] = useState(() => new Set());
  const [selProfiles, setSelProfiles] = useState(() => new Set());
  const [priority, setPriority] = useState('Routine');
  const [department, setDepartment] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [testFilter, setTestFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState(null);        // { type, text }
  const [created, setCreated] = useState(null);

  // Search
  const [sq, setSq] = useState('');
  const [sStatus, setSStatus] = useState('');
  const [sPriority, setSPriority] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Details
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadRef = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([fetch('/api/lab/test-catalog'), fetch('/api/patients')]);
      if (cRes.ok) {
        const c = await cRes.json();
        setCatalog({ tests: c.tests || [], profiles: c.profiles || [] });
      } else {
        setRefError('Could not load the test catalog (are you signed in with an ordering role?).');
      }
      if (pRes.ok) {
        const p = await pRes.json();
        setPatients(p.patients || p.data || (Array.isArray(p) ? p : []));
      }
    } catch {
      setRefError('Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRef();
  }, [loadRef]);

  const testByCode = useMemo(() => {
    const m = new Map();
    catalog.tests.forEach(t => m.set(t.test_code, t));
    return m;
  }, [catalog.tests]);

  const profileByCode = useMemo(() => {
    const m = new Map();
    catalog.profiles.forEach(p => m.set(p.profile_code, p));
    return m;
  }, [catalog.profiles]);

  // Effective set of individual test codes (selected tests + profile expansions).
  const effectiveTestCodes = useMemo(() => {
    const s = new Set(selTests);
    selProfiles.forEach(pc => (profileByCode.get(pc)?.tests || []).forEach(tc => s.add(tc)));
    return s;
  }, [selTests, selProfiles, profileByCode]);

  const filteredPatients = useMemo(() => {
    const q = patientQuery.toLowerCase().trim();
    if (!q) return patients.slice(0, 8);
    return patients.filter(p =>
      String(p.id).toLowerCase().includes(q) ||
      String(p.name).toLowerCase().includes(q) ||
      String(p.phone || '').includes(q)
    ).slice(0, 8);
  }, [patients, patientQuery]);

  const selectedPatient = patients.find(p => p.id === patientId);

  const testsByDept = useMemo(() => {
    const q = testFilter.toLowerCase().trim();
    const grouped = {};
    catalog.tests
      .filter(t => !q || t.name.toLowerCase().includes(q) || t.test_code.toLowerCase().includes(q))
      .forEach(t => { (grouped[t.department] ||= []).push(t); });
    return grouped;
  }, [catalog.tests, testFilter]);

  const toggle = (set, setter, key) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const resetForm = () => {
    setPatientId(''); setPatientQuery(''); setSelTests(new Set()); setSelProfiles(new Set());
    setPriority('Routine'); setDepartment(''); setDoctorName(''); setClinicalNotes(''); setTestFilter('');
    setFormMsg(null); setCreated(null);
  };

  const submitOrder = async () => {
    setFormMsg(null);
    if (!patientId) { setFormMsg({ type: 'error', text: 'Select a patient first.' }); return; }
    if (effectiveTestCodes.size === 0) { setFormMsg({ type: 'error', text: 'Select at least one test or profile.' }); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/lab/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          tests: Array.from(selTests),
          profiles: Array.from(selProfiles),
          priority, department: department || undefined,
          doctorName: doctorName || undefined,
          clinicalNotes,
        }),
      });
      const data = await res.json();
      if (res.status === 201) {
        setCreated(data);
        setFormMsg(null);
      } else if (res.status === 409) {
        setFormMsg({ type: 'warn', text: `${data.error} (existing order ${data.existingOrderId || ''})` });
      } else {
        setFormMsg({ type: 'error', text: data.error || 'Could not create the order.' });
      }
    } catch {
      setFormMsg({ type: 'error', text: 'Network error creating the order.' });
    } finally {
      setSubmitting(false);
    }
  };

  const runSearch = useCallback(async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (sq) params.set('q', sq);
      if (sStatus) params.set('status', sStatus);
      if (sPriority) params.set('priority', sPriority);
      const res = await fetch(`/api/lab/orders?${params.toString()}`);
      const data = await res.json();
      setResults(res.ok ? (data.labOrders || []) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [sq, sStatus, sPriority]);

  const openDetails = async (id) => {
    setView('details'); setDetail(null); setDetailLoading(true);
    try {
      const res = await fetch(`/api/lab/orders/${encodeURIComponent(id)}`);
      const data = await res.json();
      setDetail(res.ok ? data.order : { error: data.error || 'Not found' });
    } catch {
      setDetail({ error: 'Network error' });
    } finally {
      setDetailLoading(false);
    }
  };

  const cancelOrder = async (id) => {
    const reason = window.prompt('Reason for cancelling this order?');
    if (!reason) return;
    const res = await fetch(`/api/lab/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', reason }),
    });
    if (res.ok) openDetails(id); else { const d = await res.json(); window.alert(d.error || 'Could not cancel.'); }
  };

  const tabBtn = (id, label) => (
    <button
      onClick={() => setView(id)}
      className={`btn btn-sm ${view === id ? 'btn-primary' : 'btn-secondary'}`}
      style={{ minWidth: '110px' }}
    >{label}</button>
  );

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Laboratory Order Entry</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Create, search and manage lab orders with auto-generated accession & specimen barcode.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tabBtn('new', '+ New Order')}
          {tabBtn('search', 'Search Orders')}
        </div>
      </div>

      {refError && <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--amber-light)', color: 'var(--amber-hover)', fontSize: '13px', marginBottom: '16px' }}>{refError}</div>}

      {/* ── NEW ORDER ── */}
      {view === 'new' && (created ? (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--emerald-hover)', fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>
            <span className="lis-status-dot" style={{ background: '#059669' }} /> Order created successfully
          </div>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap', margin: '16px 0' }}>
            {[['Order ID', created.orderId], ['Accession No.', created.accessionNumber], ['Sample ID', created.sampleId]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
            <BarcodeLabel
              value={created.barcode}
              title={created.order?.patient_name}
              lines={[`${created.accessionNumber}`, `${(created.tests || []).length} test(s) · ${created.order?.priority || ''}`]}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
            <button className="btn btn-primary" onClick={resetForm}>+ New Order</button>
            <button className="btn btn-secondary" onClick={() => openDetails(created.orderId)}>View Order</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.4fr)', gap: '22px' }}>
          {/* Left: patient + meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Patient</label>
              {selectedPatient ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedPatient.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{selectedPatient.id} · {selectedPatient.age || '—'}y · {selectedPatient.gender || '—'}</div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setPatientId(''); setPatientQuery(''); }}>Change</button>
                </div>
              ) : (
                <>
                  <input className="form-control" placeholder="Search patient by name / ID / phone" value={patientQuery} onChange={e => setPatientQuery(e.target.value)} />
                  <div style={{ marginTop: '6px', maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {filteredPatients.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>No patients{patients.length === 0 ? ' loaded.' : ' match.'}</div>
                    ) : filteredPatients.map(p => (
                      <button key={p.id} onClick={() => { setPatientId(p.id); }} className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
                        {p.name} · <span style={{ color: 'var(--text-muted)' }}>{p.id}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="form-label">Priority</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {PRIORITIES.map(p => (
                  <button key={p} onClick={() => setPriority(p)} className={`btn btn-sm ${priority === p ? 'btn-primary' : 'btn-secondary'}`}>{p}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label">Ordering Doctor</label>
              <input className="form-control" placeholder="Dr. name (defaults to you)" value={doctorName} onChange={e => setDoctorName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Department (optional)</label>
              <input className="form-control" placeholder="Auto from tests" value={department} onChange={e => setDepartment(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Clinical Notes</label>
              <textarea className="form-control" rows={3} placeholder="Relevant history / instructions" value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)} />
            </div>
          </div>

          {/* Right: test selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Profiles / Panels</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {catalog.profiles.map(p => (
                  <button key={p.profile_code} onClick={() => toggle(selProfiles, setSelProfiles, p.profile_code)}
                    className={`btn btn-sm ${selProfiles.has(p.profile_code) ? 'btn-primary' : 'btn-secondary'}`}>
                    {p.name}
                  </button>
                ))}
                {catalog.profiles.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No profiles.</span>}
              </div>
            </div>

            <div>
              <label className="form-label">Individual Tests</label>
              <input className="form-control" placeholder="Filter tests…" value={testFilter} onChange={e => setTestFilter(e.target.value)} style={{ marginBottom: '8px' }} />
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '8px' }}>
                {Object.keys(testsByDept).sort().map(dept => (
                  <div key={dept} style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: '4px 0' }}>{dept}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {testsByDept[dept].map(t => {
                        const viaProfile = !selTests.has(t.test_code) && effectiveTestCodes.has(t.test_code);
                        const on = selTests.has(t.test_code) || viaProfile;
                        return (
                          <button key={t.test_code} onClick={() => toggle(selTests, setSelTests, t.test_code)}
                            title={viaProfile ? 'Included via a selected profile' : t.name}
                            className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ opacity: viaProfile ? 0.7 : 1 }}>
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {Object.keys(testsByDept).length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>No tests match.</div>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{effectiveTestCodes.size}</strong> test(s) selected
              </span>
              <button className="btn btn-primary" onClick={submitOrder} disabled={submitting}>{submitting ? 'Creating…' : 'Create Order'}</button>
            </div>

            {formMsg && (
              <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: '13px',
                background: formMsg.type === 'error' ? 'var(--rose-light)' : 'var(--amber-light)',
                color: formMsg.type === 'error' ? 'var(--rose-hover)' : 'var(--amber-hover)' }}>{formMsg.text}</div>
            )}
          </div>
        </div>
      ))}

      {/* ── SEARCH ── */}
      {view === 'search' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <input className="form-control" style={{ flex: '1 1 220px' }} placeholder="Order ID, accession, patient…" value={sq} onChange={e => setSq(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
            <select className="form-control" style={{ maxWidth: '180px' }} value={sStatus} onChange={e => setSStatus(e.target.value)}>
              <option value="">Any status</option>
              {['Ordered', 'Sample Collected', 'Pending Verification', 'Verified', 'Report Delivered', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: '150px' }} value={sPriority} onChange={e => setSPriority(e.target.value)}>
              <option value="">Any priority</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn btn-primary" onClick={runSearch}>{searching ? 'Searching…' : 'Search'}</button>
          </div>

          {results.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No orders. Run a search to see results.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead><tr><th>Order ID</th><th>Patient</th><th>Accession</th><th>Dept</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {results.map(o => (
                    <tr key={o.id} onClick={() => openDetails(o.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.id}</td>
                      <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{o.patient_name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{o.patient_id}</div></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{o.accession_number || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{o.department || '—'}</td>
                      <td><span className={`badge ${priorityBadge(o.priority)}`}>{o.priority}</span></td>
                      <td><span className={`badge ${statusBadge(o.status)}`}>{o.status}</span></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{fmt(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── DETAILS ── */}
      {view === 'details' && (
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => setView('search')} style={{ marginBottom: '14px' }}>← Back</button>
          {detailLoading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            : !detail ? null
            : detail.error ? <div style={{ color: 'var(--rose-hover)' }}>{detail.error}</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.6fr) minmax(240px, 1fr)', gap: '22px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, margin: 0, fontSize: '18px' }}>{detail.id}</h3>
                    <span className={`badge ${statusBadge(detail.status)}`}>{detail.status}</span>
                    <span className={`badge ${priorityBadge(detail.priority)}`}>{detail.priority}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{detail.patient_name}</strong> · {detail.patient_id}
                    {detail.patient ? ` · ${detail.patient.age || '—'}y · ${detail.patient.gender || '—'}` : ''}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Ordering Dr: {detail.doctor_name || '—'} · Dept: {detail.department || '—'}</div>
                  {detail.notes && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>Notes: {detail.notes}</div>}
                  {detail.status === 'Cancelled' && detail.cancel_reason && (
                    <div style={{ fontSize: '12.5px', color: 'var(--rose-hover)', marginTop: '6px' }}>Cancelled: {detail.cancel_reason}</div>
                  )}

                  <div className="table-responsive" style={{ marginTop: '14px' }}>
                    <table className="data-table">
                      <thead><tr><th>Test</th><th>Code</th><th>Department</th><th>Profile</th></tr></thead>
                      <tbody>
                        {(detail.lab_order_tests || []).map(t => (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.test_name}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{t.test_code || '—'}</td>
                            <td style={{ fontSize: '12px' }}>{t.department || '—'}</td>
                            <td style={{ fontSize: '12px' }}>{t.profile_code || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {detail.status !== 'Cancelled' && detail.status !== 'Report Delivered' && (
                    <button className="btn btn-rose btn-sm" style={{ marginTop: '14px' }} onClick={() => cancelOrder(detail.id)}>Cancel Order</button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Specimen Barcode</div>
                  {detail.barcode_value
                    ? <BarcodeLabel value={detail.barcode_value} title={detail.patient_name} lines={[detail.accession_number || '', `Sample ${detail.sample_id || ''}`]} />
                    : <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No barcode on this order.</div>}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
