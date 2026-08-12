"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Exception Queue — reconciliation for analyzer results whose barcode matched
 * no open order. The ingestion route HOLDS these instead of guessing a patient;
 * here lab staff either assign a held result to the correct order (which applies
 * it and sends it to verification) or dismiss it with a reason.
 *
 * Live via SSE: new holds appear instantly, and resolved ones drop off.
 */

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

export default function ExceptionQueuePanel() {
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Reconciliation UI state (one exception at a time).
  const [assignId, setAssignId] = useState(null);
  const [orderQuery, setOrderQuery] = useState('');
  const [orderResults, setOrderResults] = useState([]);
  const [orderSearching, setOrderSearching] = useState(false);
  const [dismissId, setDismissId] = useState(null);
  const [dismissReason, setDismissReason] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');

  const debounceRef = useRef(null);
  const orderSearchRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/analyzer/exceptions');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setExceptions(Array.isArray(data.exceptions) ? data.exceptions : []);
      setError('');
    } catch {
      setError('Could not load the exception queue. Make sure the server is running and you are signed in.');
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadData, 400);
  }, [loadData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [loadData]);

  // Live: refresh when a result is held, applied, or an exception is resolved.
  useEffect(() => {
    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onopen = () => setLive(true);
      es.onerror = () => setLive(false);
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          if (['RESULTS_UNMATCHED', 'EXCEPTION_RESOLVED', 'RESULTS_RECEIVED'].includes(evt.type)) {
            debouncedLoad();
          }
        } catch { /* ignore keep-alive frames */ }
      };
    } catch { /* SSE unsupported */ }
    return () => { if (es) es.close(); };
  }, [debouncedLoad]);

  const flashToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const searchOrders = useCallback(async (q) => {
    const term = (q || '').trim();
    if (!term) { setOrderResults([]); return; }
    setOrderSearching(true);
    try {
      const res = await fetch(`/api/lab/analyzer/exceptions?orderQuery=${encodeURIComponent(term)}`);
      const data = await res.json();
      setOrderResults(Array.isArray(data.orders) ? data.orders : []);
    } catch {
      setOrderResults([]);
    } finally {
      setOrderSearching(false);
    }
  }, []);

  const onOrderQueryChange = (v) => {
    setOrderQuery(v);
    if (orderSearchRef.current) clearTimeout(orderSearchRef.current);
    orderSearchRef.current = setTimeout(() => searchOrders(v), 350);
  };

  const openAssign = (exc) => {
    setDismissId(null);
    setAssignId(exc.id);
    setExpandedId(exc.id);
    setOrderResults([]);
    // Pre-seed the search with the barcode the analyzer reported — the most
    // likely order to match.
    setOrderQuery(exc.specimenId || '');
    if (exc.specimenId) searchOrders(exc.specimenId);
  };

  const doAssign = async (exc, orderId) => {
    setBusyId(exc.id);
    try {
      const res = await fetch(`/api/lab/analyzer/exceptions/${encodeURIComponent(exc.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', orderId }),
      });
      const data = await res.json();
      if (!res.ok) { flashToast(data.error || 'Could not assign result.'); return; }
      flashToast(`Assigned to ${data.taskId} — ${data.testsApplied} result(s) sent to verification.`);
      setAssignId(null);
      setOrderQuery('');
      setOrderResults([]);
      loadData();
    } catch {
      flashToast('Network error while assigning.');
    } finally {
      setBusyId(null);
    }
  };

  const doDismiss = async (exc) => {
    const reason = dismissReason.trim();
    if (!reason) { flashToast('Enter a reason to dismiss.'); return; }
    setBusyId(exc.id);
    try {
      const res = await fetch(`/api/lab/analyzer/exceptions/${encodeURIComponent(exc.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', reason }),
      });
      const data = await res.json();
      if (!res.ok) { flashToast(data.error || 'Could not dismiss.'); return; }
      flashToast('Held result dismissed.');
      setDismissId(null);
      setDismissReason('');
      loadData();
    } catch {
      flashToast('Network error while dismissing.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Exception Queue
            {exceptions.length > 0 && (
              <span className="badge badge-amber" style={{ fontSize: '12px' }}>{exceptions.length} held</span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: live ? 'var(--emerald)' : 'var(--text-muted)', background: live ? 'var(--emerald-light)' : 'var(--bg-subtle)', padding: '3px 9px', borderRadius: 'var(--radius-pill)' }}>
              <span className={`lis-status-dot ${live ? 'is-active' : ''}`} style={{ width: '7px', height: '7px', background: live ? '#059669' : '#94a3b8' }} />
              {live ? 'Live' : 'Reconnecting'}
            </span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', maxWidth: '680px' }}>
            Results whose barcode matched no open order. Nothing here has touched a patient record — assign each one to the correct order, or dismiss it with a reason.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData}>↻ Refresh</button>
      </div>

      {toast && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--primary-light, #eef2ff)', color: 'var(--primary, #4f46e5)', fontWeight: 600, fontSize: '13px' }}>
          {toast}
        </div>
      )}

      {error ? (
        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
      ) : loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : exceptions.length === 0 ? (
        <div style={{ padding: '40px 30px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Nothing to reconcile</div>
          Every result the analyzers sent matched an open order. Held results will appear here automatically if a barcode can&apos;t be matched.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {exceptions.map((exc) => {
            const isExpanded = expandedId === exc.id;
            const isAssigning = assignId === exc.id;
            const isDismissing = dismissId === exc.id;
            const busy = busyId === exc.id;

            return (
              <div key={exc.id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sm)' }}>
                {/* Summary row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', padding: '14px 16px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span className="badge badge-indigo">{exc.analyzerId || 'analyzer'}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{exc.specimenId || '(no barcode)'}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{exc.testsCount} result(s) · {relTime(exc.createdAt)}</span>
                      {!exc.hasParsedTests && <span className="badge badge-secondary" style={{ fontSize: '11px' }}>raw only</span>}
                    </div>
                    {exc.note && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{exc.note}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setExpandedId(isExpanded ? null : exc.id)}>
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => openAssign(exc)}>
                      Assign to order
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => { setAssignId(null); setDismissId(isDismissing ? null : exc.id); setDismissReason(''); }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>

                {/* Expanded detail: parsed tests + raw message */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--border-color)' }}>
                    {exc.tests.length > 0 ? (
                      <div className="table-responsive" style={{ marginTop: '12px' }}>
                        <table className="data-table">
                          <thead>
                            <tr><th>Test / Code</th><th>Value</th><th>Unit</th><th>Flag</th></tr>
                          </thead>
                          <tbody>
                            {exc.tests.map((t, i) => (
                              <tr key={i}>
                                <td style={{ fontWeight: 600 }}>{t.code ?? t.name ?? '—'}</td>
                                <td style={{ fontWeight: 700 }}>{t.value ?? '—'}</td>
                                <td>{t.unit || '—'}</td>
                                <td>{t.flag ? <span className="badge badge-amber">{t.flag}</span> : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>
                        No parsed values stored for this held result.
                      </p>
                    )}
                    {exc.raw && (
                      <details style={{ marginTop: '12px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Raw analyzer message</summary>
                        <pre style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 'var(--radius-md)', fontSize: '11.5px', overflow: 'auto', maxHeight: '220px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{exc.raw}</pre>
                      </details>
                    )}
                  </div>
                )}

                {/* Assign form */}
                {isAssigning && (
                  <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-subtle, #f8fafc)' }}>
                    {!exc.hasParsedTests ? (
                      <div style={{ fontSize: '13px', color: 'var(--rose-hover, #be123c)', fontWeight: 600 }}>
                        This held result has no stored values to apply. Dismiss it and enter the result manually.
                      </div>
                    ) : (
                      <>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          Find the order to attach these results to
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          <input
                            className="form-control"
                            value={orderQuery}
                            onChange={(e) => onOrderQueryChange(e.target.value)}
                            placeholder="Search by accession, order ID, or patient…"
                            style={{ flex: 1, minWidth: '220px' }}
                            autoFocus
                          />
                          <button className="btn btn-secondary btn-sm" onClick={() => { setAssignId(null); setOrderResults([]); }}>Cancel</button>
                        </div>

                        {orderSearching ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Searching…</p>
                        ) : orderResults.length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{orderQuery.trim() ? 'No matching open orders.' : 'Type to search open orders.'}</p>
                        ) : (
                          <div className="table-responsive">
                            <table className="data-table">
                              <thead>
                                <tr><th>Order</th><th>Patient</th><th>Accession</th><th>Status</th><th>Tests</th><th></th></tr>
                              </thead>
                              <tbody>
                                {orderResults.map((o) => (
                                  <tr key={o.id}>
                                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{o.id}</td>
                                    <td>
                                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{o.patient_name || 'Unknown'}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{o.patient_id || ''}</div>
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{o.accession_number || '—'}</td>
                                    <td><span className="badge badge-secondary">{o.status}</span></td>
                                    <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)', maxWidth: '220px' }}>{(o.tests || []).join(', ') || '—'}</td>
                                    <td>
                                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => doAssign(exc, o.id)}>
                                        {busy ? '…' : 'Assign'}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px' }}>
                          Results are applied against the order&apos;s own accession and land as <strong>Pending Verification</strong> — a human still signs off before release.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Dismiss form */}
                {isDismissing && (
                  <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-subtle, #f8fafc)' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Reason for dismissing this held result
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        className="form-control"
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                        placeholder="e.g. QC/control run, duplicate, wrong barcode entered at analyzer…"
                        style={{ flex: 1, minWidth: '260px' }}
                        autoFocus
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => doDismiss(exc)}
                        style={{ background: 'var(--rose-light)', color: 'var(--rose-hover)', borderColor: 'var(--rose-light)' }}
                      >
                        {busy ? '…' : 'Confirm dismiss'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setDismissId(null); setDismissReason(''); }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
