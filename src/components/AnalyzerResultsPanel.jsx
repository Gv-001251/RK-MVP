"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Live analyzer dashboard for the doctor.
 *  - Machine Status: every configured analyzer with a live Active/Online/Offline
 *    indicator (updates in real time via SSE, no polling lag).
 *  - Results inbox: results as they arrive from the machines.
 *  - Click a patient → one consolidated page of their results across ALL machines.
 */

const STATUS_META = {
  active:  { label: 'Active',  color: 'var(--emerald)', dot: '#059669' },
  online:  { label: 'Online',  color: 'var(--primary)', dot: '#4f46e5' },
  offline: { label: 'Offline', color: '#94a3b8',        dot: '#94a3b8' },
  manual:  { label: 'Manual',  color: 'var(--amber)',   dot: '#d97706' },
};

function relTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString();
}
function fmt(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export default function AnalyzerResultsPanel() {
  const [inbox, setInbox] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [rRes, mRes] = await Promise.all([
        fetch('/api/lab/results'),
        fetch('/api/lab/analyzers'),
      ]);
      if (mRes.ok) {
        const m = await mRes.json();
        setMachines(Array.isArray(m.analyzers) ? m.analyzers : []);
      }
      if (!rRes.ok) throw new Error(String(rRes.status));
      const data = await rRes.json();
      setInbox(Array.isArray(data.tasks) ? data.tasks : []);
      setError('');
    } catch {
      setError('Could not load data. Make sure the server is running and you are signed in.');
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadData, 400);
  }, [loadData]);

  // Initial load + a slow fallback poll (catches machines that go stale/offline
  // without a clean event). Real-time updates come from SSE below.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    const id = setInterval(loadData, 20000);
    return () => clearInterval(id);
  }, [loadData]);

  // Real-time push: refresh instantly when a machine changes state or a result
  // arrives — no lag.
  useEffect(() => {
    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onopen = () => setLive(true);
      es.onerror = () => setLive(false);
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          if (['MACHINE_STATUS', 'RESULTS_RECEIVED', 'RESULTS_UNMATCHED'].includes(evt.type)) {
            debouncedLoad();
          }
        } catch { /* ignore keep-alive/handshake frames */ }
      };
    } catch { /* SSE unsupported */ }
    return () => { if (es) es.close(); };
  }, [debouncedLoad]);

  const openPatient = async (patientId) => {
    if (!patientId) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/lab/results?patientId=${encodeURIComponent(patientId)}`);
      setSelected(await res.json());
    } catch {
      setSelected({ error: true });
    } finally {
      setDetailLoading(false);
    }
  };

  const taskBadge = (status) => {
    const map = {
      'Pending Verification': 'badge-cyan', 'QC Verification': 'badge-cyan',
      'Verified': 'badge-emerald', 'Report Generated': 'badge-emerald',
      'Report Delivered': 'badge-teal', 'Analyzer Running': 'badge-indigo',
      'Sample Collected': 'badge-sky', 'Sample Registered': 'badge-sky', 'Ordered': 'badge-amber',
    };
    return map[status] || 'badge-secondary';
  };
  const machinesFor = (task) => Array.from(new Set((task.tests || []).map(t => t.machine).filter(Boolean)));
  const resultCount = (task) => (task.tests || []).filter(t => t.value).length;

  // ── Consolidated single-patient page ──
  if (selected && !selected.error) {
    const rows = selected.consolidated || [];
    const p = selected.patient || {};
    const byMachine = {};
    rows.forEach(r => { (byMachine[r.machine || 'Manual / Other'] ||= []).push(r); });
    const groups = Object.keys(byMachine).sort();

    return (
      <div className="panel-card col-12" style={{ padding: '26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: '12px' }}>← Back</button>
            <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>
              {p.name || 'Patient'} <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px' }}>{p.id || ''}</span>
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Consolidated results across all analyzers{p.age ? ` · ${p.age}y` : ''}{p.gender ? ` · ${p.gender}` : ''}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => window.print()}>Print / PDF</button>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No results recorded yet for this patient.</div>
        ) : (
          groups.map((mName) => (
            <div key={mName} style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="badge badge-indigo">{mName}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{byMachine[mName].length} parameter(s)</span>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr><th>Test / Parameter</th><th>Result</th><th>Specimen</th><th>Status</th><th>Completed</th></tr>
                  </thead>
                  <tbody>
                    {byMachine[mName].map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.test}</td>
                        <td style={{ fontWeight: 700 }}>{r.value}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.specimenId || '—'}</td>
                        <td><span className={`badge ${taskBadge(r.status)}`}>{r.status}</span></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{fmt(r.completedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ── Machine status summary counts ──
  const counts = machines.reduce((a, m) => { a[m.status] = (a[m.status] || 0) + 1; return a; }, {});

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Analyzer Results
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: live ? 'var(--emerald)' : 'var(--text-muted)', background: live ? 'var(--emerald-light)' : 'var(--bg-subtle)', padding: '3px 9px', borderRadius: 'var(--radius-pill)' }}>
              <span className={`lis-status-dot ${live ? 'is-active' : ''}`} style={{ width: '7px', height: '7px', background: live ? '#059669' : '#94a3b8' }} />
              {live ? 'Live' : 'Reconnecting'}
            </span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Live machine status and results. Click a patient to see all results on one page.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData}>↻ Refresh</button>
      </div>

      {/* Machine status dashboard */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Machine Status</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['active', 'online', 'offline', 'manual'].map((s) => counts[s] ? (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <span className="lis-status-dot" style={{ width: '8px', height: '8px', background: STATUS_META[s].dot }} />
                {counts[s]} {STATUS_META[s].label}
              </span>
            ) : null)}
          </div>
        </div>

        {machines.length === 0 ? (
          <div style={{ padding: '18px', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
            No machines registered yet. Start the LIS Bridge to populate machine status.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
            {machines.map((m) => {
              const meta = STATUS_META[m.status] || STATUS_META.offline;
              return (
                <div key={m.id} className="lis-machine-card" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: '14px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{m.department || '—'}</div>
                    </div>
                    <span className={`lis-status-dot ${m.status === 'active' ? 'is-active' : ''}`} style={{ background: meta.dot, marginTop: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      {m.status === 'manual' ? (m.protocol || '') : (m.status === 'offline' ? (m.protocol || '') : relTime(m.lastSeen))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Results inbox */}
      <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '10px' }}>Incoming Results</div>
      {detailLoading && <p style={{ color: 'var(--text-muted)' }}>Loading patient results…</p>}
      {error ? (
        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
      ) : loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : inbox.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No analyzer results yet. When a machine transmits a result, it appears here automatically.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Patient</th><th>Specimen (barcode)</th><th>Results</th><th>Analyzer(s)</th><th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {inbox.map((task) => {
                const ms = machinesFor(task);
                return (
                  <tr key={task.taskId} onClick={() => openPatient(task.patientId)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{task.patientName || 'Unknown'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{task.patientId || ''}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{task.specimenId || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{resultCount(task)}</td>
                    <td style={{ fontSize: '12px' }}>{ms.length ? ms.join(', ') : (task.machineAssigned || '—')}</td>
                    <td><span className={`badge ${taskBadge(task.status)}`}>{task.status}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{relTime(task.orderedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
