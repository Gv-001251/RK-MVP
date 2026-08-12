"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import RackScanDialog from './RackScanDialog';

const MANAGE_ROLES = ['technician', 'senior_technician', 'admin'];

const STATUS_STYLE = {
  active:      { badge: 'badge-emerald', dot: '#059669', label: 'Active' },
  online:      { badge: 'badge-sky',     dot: '#0284c7', label: 'Online' },
  offline:     { badge: 'badge-rose',    dot: '#e11d48', label: 'Offline' },
  maintenance: { badge: 'badge-amber',   dot: '#d97706', label: 'Maintenance' },
  disabled:    { badge: 'badge-secondary', dot: '#94a3b8', label: 'Disabled' },
  manual:      { badge: 'badge-secondary', dot: '#94a3b8', label: 'Manual' },
};

function timeAgo(v) {
  if (!v) return 'never';
  const t = new Date(v).getTime();
  if (isNaN(t)) return String(v);
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(v).toLocaleString();
}
function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value ?? '—'}</div>
    </div>
  );
}

export default function AnalyzerManagementPanel() {
  const [analyzers, setAnalyzers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState({}); // id -> bool
  const [logsFor, setLogsFor] = useState(null); // analyzer object
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [rackFor, setRackFor] = useState(null); // analyzer being loaded by holder
  const mounted = useRef(true);

  const mergeAnalyzer = useCallback((a) => {
    if (!a || !a.id) return;
    setAnalyzers(prev => {
      const i = prev.findIndex(x => x.id === a.id);
      if (i === -1) return [...prev, a];
      const next = prev.slice();
      next[i] = { ...next[i], ...a };
      return next;
    });
  }, []);

  // ── Initial load (once) ──
  useEffect(() => {
    mounted.current = true;
    fetch('/api/lab/analyzers')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => { if (mounted.current) { setAnalyzers(d.analyzers || []); setError(''); } })
      .catch(() => { if (mounted.current) setError('Could not load analyzers. Sign in with a lab role.'); })
      .finally(() => { if (mounted.current) setLoading(false); });

    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (mounted.current) setCanManage(MANAGE_ROLES.includes(d?.profile?.role || d?.user?.role || ''));
    }).catch(() => {});

    return () => { mounted.current = false; };
  }, []);

  // ── Real-time updates via SSE (no polling) ──
  useEffect(() => {
    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onmessage = (evt) => {
        let parsed;
        try { parsed = JSON.parse(evt.data); } catch { return; }
        if (parsed.type === 'ANALYZER_UPDATED' && parsed.data) {
          mergeAnalyzer(parsed.data);
        } else if (parsed.type === 'MACHINE_STATUS' && parsed.data?.analyzerId) {
          setAnalyzers(prev => prev.map(x => x.id === parsed.data.analyzerId ? { ...x, status: parsed.data.status, reported: parsed.data.status } : x));
        }
      };
      es.onerror = () => { /* EventSource auto-reconnects */ };
    } catch { /* SSE unavailable */ }
    return () => { if (es) es.close(); };
  }, [mergeAnalyzer]);

  const act = async (id, action) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/lab/analyzers/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      if (res.ok) { const d = await res.json(); mergeAnalyzer(d.analyzer); }
    } catch { /* ignore */ }
    finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const openLogs = async (a) => {
    setLogsFor(a); setLogs([]); setLogsLoading(true);
    try {
      const res = await fetch(`/api/lab/analyzers/${encodeURIComponent(a.id)}/logs?limit=200`);
      const d = await res.json();
      setLogs(res.ok ? (d.logs || []) : []);
    } catch { setLogs([]); }
    finally { setLogsLoading(false); }
  };

  const counts = analyzers.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Analyzer Management</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Live instrument status, telemetry, and connection control. Updates in real time.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['active', 'online', 'maintenance', 'offline', 'disabled'].map(s => (
            (counts[s] ? <span key={s} className={`badge ${STATUS_STYLE[s].badge}`}>{counts[s]} {STATUS_STYLE[s].label}</span> : null)
          ))}
        </div>
      </div>

      {error ? <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
        : loading ? <p style={{ color: 'var(--text-muted)' }}>Loading analyzers…</p>
        : analyzers.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No analyzers registered.</div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {analyzers.map(a => {
              const st = STATUS_STYLE[a.status] || STATUS_STYLE.offline;
              return (
                <div key={a.id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg, 14px)', padding: '16px', background: 'var(--bg-primary, #fff)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.manufacturer || '—'}{a.department ? ` · ${a.department}` : ''}</div>
                    </div>
                    <span className={`badge ${st.badge}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                      {st.label}
                    </span>
                  </div>

                  {/* Telemetry grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginBottom: '14px' }}>
                    <Field label="Last Communication" value={timeAgo(a.lastSeen)} />
                    <Field label="Protocol" value={a.protocol ? String(a.protocol).toUpperCase() : '—'} />
                    <Field label="Tests Today" value={a.testsToday} />
                    <Field label="Queue Length" value={a.queueLength} />
                    <Field label="QC Status" value={a.qcStatus} />
                    <Field label="Temperature" value={a.temperature != null ? `${a.temperature} °C` : '—'} />
                    <Field label="Reagent Level" value={a.reagentLevel} />
                    <Field label="Connection" value={a.connectionType} />
                    <Field label="IP Address" value={a.ipAddress} />
                    <Field label="Serial Port" value={a.serialPort} />
                    <Field label="Software Version" value={a.softwareVersion} />
                    <Field label="Health" value={a.health != null ? `${a.health}%` : '—'} />
                  </div>

                  {a.lastCommand && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                      Last command: <strong>{a.lastCommand}</strong> {a.lastCommandAt ? `· ${timeAgo(a.lastCommandAt)}` : ''}
                      {a.pendingCommand ? <span className="badge badge-amber" style={{ marginLeft: '6px' }}>pending: {a.pendingCommand}</span> : null}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    {/* Instruments loaded by sample holder have no scan control
                        of their own, so the LIS provides it. */}
                    {canManage && a.rackPositions > 0 && a.status !== 'manual' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setRackFor(a)}>Scan</button>
                    )}
                    {canManage && a.status !== 'manual' && (
                      <>
                        <button className="btn btn-secondary btn-sm" disabled={busy[a.id]} onClick={() => act(a.id, 'reconnect')}>Reconnect</button>
                        <button className="btn btn-secondary btn-sm" disabled={busy[a.id]} onClick={() => act(a.id, 'restart')}>Restart</button>
                        {a.enabled
                          ? <button className="btn btn-rose btn-sm" disabled={busy[a.id]} onClick={() => act(a.id, 'disable')}>Disable</button>
                          : <button className="btn btn-emerald btn-sm" disabled={busy[a.id]} onClick={() => act(a.id, 'enable')}>Enable</button>}
                        {a.maintenanceMode
                          ? <button className="btn btn-secondary btn-sm" disabled={busy[a.id]} onClick={() => act(a.id, 'maintenance_off')}>End Maintenance</button>
                          : <button className="btn btn-secondary btn-sm" disabled={busy[a.id]} onClick={() => act(a.id, 'maintenance_on')}>Maintenance</button>}
                      </>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => openLogs(a)}>Comm Logs</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* Sample-holder loading */}
      {rackFor && (
        <RackScanDialog analyzer={rackFor} onClose={() => setRackFor(null)} />
      )}

      {/* Communication logs modal */}
      {logsFor && (
        <div onClick={() => setLogsFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-primary, #fff)', borderRadius: 'var(--radius-lg, 14px)', width: 'min(720px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '16px' }}>Communication Logs</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{logsFor.name}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setLogsFor(null)}>Close</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 0' }}>
              {logsLoading ? <p style={{ color: 'var(--text-muted)', padding: '20px' }}>Loading…</p>
                : logs.length === 0 ? <p style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>No communication logs yet.</p>
                : (
                  <div className="table-responsive">
                    <table className="data-table" style={{ margin: 0 }}>
                      <thead><tr><th>Time</th><th>Dir</th><th>Event</th><th>Detail</th></tr></thead>
                      <tbody>
                        {logs.map(l => (
                          <tr key={l.id}>
                            <td style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(l.created_at)}</td>
                            <td><span className={`badge ${l.direction === 'outbound' ? 'badge-indigo' : l.direction === 'system' ? 'badge-amber' : 'badge-sky'}`}>{l.direction}</span></td>
                            <td style={{ fontWeight: 600, fontSize: '12px' }}>{l.event}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{l.detail || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
