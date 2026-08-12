"use client";

import React, { useState, useEffect, useCallback } from 'react';
import ReportViewer from './ReportViewer';
import TrendChart from './TrendChart';
import OrderEntryPanel from './OrderEntryPanel';

const MANAGE_ROLES = ['technician', 'senior_technician', 'pathologist', 'admin'];
const ORDER_ROLES = ['doctor', 'receptionist', 'admin'];

function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
function dateOnly(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(); }

export default function DoctorPortalPanel() {
  const [tab, setTab] = useState('dashboard');
  const [role, setRole] = useState('');
  const [origin, setOrigin] = useState('');
  const [openOrderId, setOpenOrderId] = useState(null);
  const [focusPatient, setFocusPatient] = useState(null);
  const [initialQuery, setInitialQuery] = useState('');

  const canManage = MANAGE_ROLES.includes(role);
  const canOrder = ORDER_ROLES.includes(role);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => setRole(d?.profile?.role || d?.user?.role || '')).catch(() => {});
  }, []);

  const goToPatient = (id) => { setFocusPatient(id); setTab('patients'); };
  const goSearch = (q) => { setInitialQuery(q); setFocusPatient(null); setTab('patients'); };

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Doctor Portal</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Search patients, review reports and trends, compare results, order tests and track critical alerts.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[['dashboard', 'Dashboard'], ['patients', 'Patients']].map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard onOpenReport={setOpenOrderId} onOpenPatient={goToPatient} onSearch={goSearch} />}
      {tab === 'patients' && <Patients origin={origin} canOrder={canOrder} initialQuery={initialQuery} focusPatient={focusPatient} onOpenReport={setOpenOrderId} />}

      {openOrderId && <ReportViewer orderId={openOrderId} canManage={canManage} verifyBaseUrl={origin} onClose={() => setOpenOrderId(null)} />}
    </div>
  );
}

/* ── Dashboard ── */
function Dashboard({ onOpenReport, onOpenPatient, onSearch }) {
  const [criticals, setCriticals] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/lab/critical-alerts?status=Active&limit=8').then(r => r.ok ? r.json() : null),
      fetch('/api/lab/reports?limit=8').then(r => r.ok ? r.json() : null),
    ]).then(([c, r]) => {
      setCriticals(c?.alerts || []); setActiveCount(c?.activeCount || 0); setReports(r?.reports || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  return (
    <div>
      {/* Quick search */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: '360px', flex: 1 }} placeholder="Search patient by name, ID or phone…" value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSearch(q)} />
        <button className="btn btn-primary btn-sm" onClick={() => onSearch(q)}>Search Patients</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        {[['Active Critical Alerts', activeCount, 'badge-rose'], ['Recent Reports', reports.length, 'badge-sky'], ['Unack. Criticals', criticals.filter(c => !c.acknowledged).length, 'badge-amber']].map(([label, val, badge]) => (
          <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>{val}</div>
            <span className={`badge ${badge}`}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>Active Critical Alerts</h3>
          {criticals.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No active critical alerts.</p>
            : criticals.map(c => (
              <div key={c.id} onClick={() => c.patient_id && onOpenPatient(c.patient_id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--rose-light)', marginBottom: '6px', cursor: c.patient_id ? 'pointer' : 'default' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.patient_name || 'Unknown'} — {c.test_name}</span>
                <span style={{ fontWeight: 800, color: 'var(--rose-hover)' }}>{c.result_value}</span>
              </div>
            ))}
        </div>
        <div>
          <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>Recent Reports</h3>
          {reports.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No reports yet.</p>
            : reports.map(r => (
              <div key={r.id} onClick={() => onOpenReport(r.lab_order_id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-subtle, #f8fafc)', marginBottom: '6px', cursor: 'pointer' }}>
                <span style={{ fontWeight: 600 }}>{r.patient_name || '—'}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.report_no}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ── Patients workspace (master-detail) ── */
function Patients({ origin, canOrder, initialQuery, focusPatient, onOpenReport }) {
  const [q, setQ] = useState(initialQuery || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // patient detail payload

  const search = useCallback(async (term) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (term) params.set('q', term);
      const d = await fetch(`/api/doctor/patients?${params.toString()}`).then(r => r.ok ? r.json() : { patients: [] });
      setResults(d.patients || []);
    } finally { setLoading(false); }
  }, []);

  const selectPatient = useCallback(async (id) => {
    setSelected({ loading: true });
    try {
      const d = await fetch(`/api/doctor/patients/${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null);
      setSelected(d || { error: true });
    } catch { setSelected({ error: true }); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    search(initialQuery || '');
    if (focusPatient) selectPatient(focusPatient);
  }, [search, selectPatient, initialQuery, focusPatient]);

  return (
    <div className="portal-split">
      {/* Master: search + results */}
      <div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input className="form-control" placeholder="Search patients…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(q)} />
          <button className="btn btn-primary btn-sm" onClick={() => search(q)}>Go</button>
        </div>
        {loading ? <p style={{ color: 'var(--text-muted)' }}>Searching…</p>
          : results.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No patients found.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '520px', overflowY: 'auto' }}>
              {results.map(p => (
                <button key={p.id} onClick={() => selectPatient(p.id)} style={{ textAlign: 'left', border: `1px solid ${selected?.patient?.id === p.id ? 'var(--primary, #4f46e5)' : 'var(--border-color)'}`, borderRadius: 'var(--radius-md)', padding: '10px 12px', background: selected?.patient?.id === p.id ? 'var(--primary-light, #eef2ff)' : '#fff', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</span>
                    {p.activeCriticals > 0 && <span className="badge badge-rose">{p.activeCriticals} crit</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.id} · {p.age ? `${p.age}y` : '—'}/{p.gender || '—'} · {p.orderCount} orders · {p.reportCount} reports</div>
                </button>
              ))}
            </div>
          )}
      </div>

      {/* Detail */}
      <div>
        {!selected ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Select a patient to view their lab history.</div>
          : selected.loading ? <p style={{ color: 'var(--text-muted)' }}>Loading patient…</p>
          : selected.error ? <p style={{ color: 'var(--rose-hover)' }}>Could not load patient.</p>
          : <PatientDetail data={selected} origin={origin} canOrder={canOrder} onOpenReport={onOpenReport} />}
      </div>
    </div>
  );
}

function PatientDetail({ data, canOrder, onOpenReport }) {
  const { patient, orders, reports, criticals, analytes } = data;
  const [inner, setInner] = useState('reports');
  const [selectedTests, setSelectedTests] = useState([]);
  const [trends, setTrends] = useState(null);
  const [compareOrders, setCompareOrders] = useState([]);
  const [compareData, setCompareData] = useState(null);

  const toggleTest = (t) => setSelectedTests(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t].slice(0, 6));
  const toggleOrder = (id) => setCompareOrders(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id].slice(0, 4));

  useEffect(() => {
    if (inner !== 'trends' || selectedTests.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrends(null);
      return;
    }
    fetch(`/api/doctor/patients/${encodeURIComponent(patient.id)}/trends?tests=${encodeURIComponent(selectedTests.join(','))}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTrends(d?.series || {}))
      .catch(() => {});
  }, [inner, selectedTests, patient.id]);

  const runCompare = async () => {
    if (compareOrders.length < 2) return;
    const d = await fetch(`/api/doctor/patients/${encodeURIComponent(patient.id)}/compare?orders=${compareOrders.join(',')}`).then(r => r.ok ? r.json() : null);
    setCompareData(d);
  };

  const tabs = [['reports', 'Reports'], ['trends', 'Trends'], ['compare', 'Compare'], ['alerts', `Critical (${criticals.length})`]];
  if (canOrder) tabs.push(['order', 'Order Tests']);

  return (
    <div>
      {/* Patient header */}
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '14px' }}>
        <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>{patient.name}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          {patient.id} · {patient.age ? `${patient.age}y` : '—'} / {patient.gender || '—'} · {patient.phone || '—'}
          {patient.blood_group ? ` · ${patient.blood_group}` : ''}{patient.allergies && patient.allergies !== 'None' ? ` · Allergies: ${patient.allergies}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {tabs.map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${inner === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setInner(id)}>{label}</button>
        ))}
      </div>

      {inner === 'reports' && (
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Accession</th><th>Department</th><th>Status</th><th>Tests</th><th>Date</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {(orders || []).length === 0 ? <tr><td colSpan={6} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No lab orders.</td></tr>
                : orders.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{o.accession_number || o.id}</td>
                    <td>{o.department || '—'}</td>
                    <td><span className="badge badge-secondary">{o.status}</span></td>
                    <td>{o.test_count}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dateOnly(o.report_generated_at || o.created_at)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-primary btn-sm" onClick={() => onOpenReport(o.id)}>View Report</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {inner === 'trends' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Select analytes to trend ({selectedTests.length}/6):</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {(analytes || []).length === 0 ? <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No analytes recorded.</span>
              : analytes.map(a => (
                <button key={a} className={`btn btn-sm ${selectedTests.includes(a) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleTest(a)}>{a}</button>
              ))}
          </div>
          {selectedTests.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Pick one or more analytes above to see trends.</p>
            : !trends ? <p style={{ color: 'var(--text-muted)' }}>Loading trends…</p>
            : Object.keys(trends).length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No numeric data for the selected analytes.</p>
            : Object.values(trends).map(s => <TrendChart key={s.testName} testName={s.testName} unit={s.unit} referenceRange={s.referenceRange} points={s.points} />)}
        </div>
      )}

      {inner === 'compare' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Select 2–4 orders to compare ({compareOrders.length}):</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {(orders || []).map(o => (
              <button key={o.id} className={`btn btn-sm ${compareOrders.includes(o.id) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleOrder(o.id)}>
                {o.accession_number || o.id} · {dateOnly(o.created_at)}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" disabled={compareOrders.length < 2} onClick={runCompare} style={{ marginBottom: '14px' }}>Compare</button>
          {compareData && (
            <div className="table-responsive">
              <table className="data-table">
                <thead><tr><th>Test</th><th>Ref Range</th>{compareData.orders.map(o => <th key={o.id}>{dateOnly(o.date)}<div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{o.accession || o.id}</div></th>)}</tr></thead>
                <tbody>
                  {compareData.rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{row.testName}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.referenceRange || '—'}{row.unit ? ` ${row.unit}` : ''}</td>
                      {compareData.orders.map(o => {
                        const cell = row.values[o.id];
                        const color = cell?.flag === 'H' ? 'var(--rose-hover)' : cell?.flag === 'L' ? 'var(--amber-hover, #b45309)' : 'var(--text-primary)';
                        return <td key={o.id} style={{ fontWeight: cell?.flag ? 800 : 500, color }}>{cell ? cell.result : '—'}{cell?.flag ? ` ${cell.flag}` : ''}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {inner === 'alerts' && (
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Detected</th><th>Test</th><th>Value</th><th>Severity</th><th>Status</th></tr></thead>
            <tbody>
              {(criticals || []).length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No critical alerts.</td></tr>
                : criticals.map(c => (
                  <tr key={c.id} style={{ background: c.status === 'Active' ? 'var(--rose-light)' : 'transparent' }}>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(c.detected_at)}</td>
                    <td style={{ fontWeight: 600 }}>{c.test_name}</td>
                    <td style={{ fontWeight: 800, color: 'var(--rose-hover)' }}>{c.result_value} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({c.threshold_text})</span></td>
                    <td><span className={`badge ${c.severity === 'Critical' ? 'badge-rose' : 'badge-amber'}`}>{c.severity}</span></td>
                    <td><span className={`badge ${c.acknowledged ? 'badge-emerald' : 'badge-rose'}`}>{c.status}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {inner === 'order' && canOrder && (
        <div style={{ marginTop: '-10px' }}><OrderEntryPanel /></div>
      )}
    </div>
  );
}
