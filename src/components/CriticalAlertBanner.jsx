"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';

const ACK_ROLES = ['technician', 'senior_technician', 'pathologist', 'admin'];

/**
 * Global red banner for unacknowledged critical results.
 * - Polls /api/lab/critical-alerts?status=Active (fallback) and refetches live
 *   on CRITICAL_ALERT / CRITICAL_ALERT_ACK SSE events.
 * - Technicians (and above) can confirm inline; confirmation clears the alert.
 * Renders nothing when there are no active alerts.
 */
export default function CriticalAlertBanner() {
  const [alerts, setAlerts] = useState([]);
  const [canConfirm, setCanConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const debounceRef = useRef(null);

  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/critical-alerts?status=Active&limit=50');
      if (!res.ok) { setAlerts([]); return; }
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      // leave current list untouched on transient network errors
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchActive();
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      const role = d?.profile?.role || d?.user?.role || '';
      setCanConfirm(ACK_ROLES.includes(role));
    }).catch(() => {});

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchActive, 400);
    };

    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (['CRITICAL_ALERT', 'CRITICAL_ALERT_ACK', 'RESULTS_RECEIVED'].includes(parsed.type)) {
            scheduleRefetch();
          }
        } catch { /* ignore keep-alives */ }
      };
      es.onerror = () => { /* EventSource auto-reconnects */ };
    } catch { /* SSE unavailable — rely on polling */ }

    const poll = setInterval(fetchActive, 25000);
    return () => {
      if (es) es.close();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(poll);
    };
  }, [fetchActive]);

  const confirm = async (id) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/lab/critical-alerts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: '' }),
      });
      if (res.ok) setAlerts(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
    finally { setBusyId(null); }
  };

  if (alerts.length === 0) return null;

  const shown = expanded ? alerts : alerts.slice(0, 1);

  return (
    <div className="critical-banner" role="alert" aria-live="assertive">
      <div className="critical-banner-head">
        <span className="critical-banner-dot" aria-hidden="true" />
        <strong style={{ fontSize: '13.5px' }}>
          {alerts.length} Critical Result{alerts.length > 1 ? 's' : ''} — immediate attention required
        </strong>
        {alerts.length > 1 && (
          <button className="critical-banner-toggle" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Collapse' : `Show all ${alerts.length}`}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: expanded ? '260px' : 'none', overflowY: expanded ? 'auto' : 'visible' }}>
        {shown.map(a => (
          <div key={a.id} className="critical-banner-row">
            <div style={{ minWidth: 0 }}>
              <span className="critical-banner-sev">{a.severity || 'Critical'}</span>
              <strong style={{ marginRight: '8px' }}>{a.patient_name || 'Unknown patient'}</strong>
              <span style={{ fontWeight: 700 }}>{a.test_name}: {a.result_value}</span>
              <span style={{ opacity: 0.85, marginLeft: '8px' }}>(critical {a.threshold_text})</span>
              {a.message ? <span style={{ display: 'block', fontSize: '11.5px', opacity: 0.9 }}>{a.message}</span> : null}
            </div>
            <div style={{ flexShrink: 0 }}>
              {canConfirm ? (
                <button className="critical-banner-confirm" disabled={busyId === a.id} onClick={() => confirm(a.id)}>
                  {busyId === a.id ? 'Confirming…' : 'Confirm'}
                </button>
              ) : (
                <span style={{ fontSize: '11px', opacity: 0.9 }}>Awaiting technician</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
