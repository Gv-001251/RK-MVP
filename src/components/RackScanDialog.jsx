"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sample-holder loading for an analyzer that has no scan control of its own.
 *
 * The bench workflow this mirrors, in order:
 *   1. press Scan (opening this dialog)      → a holder session is armed
 *   2. scan the holder key from the supplier → the session is bound to a rack
 *   3. scan each tube as it goes in a slot   → the LIS records who is where
 *   4. put the holder in the instrument      → it reads the tubes optically and
 *                                              asks the LIS what is ordered
 *
 * Everything is driven by a barcode scanner, which behaves like a keyboard that
 * types a code and presses Enter. So exactly one input holds focus at any time
 * and it is re-focused after every scan — the operator never needs the mouse.
 */

const STEP_HINT = {
  awaiting_key: 'Scan the holder key printed on the sample holder.',
  loading: 'Scan each tube as you place it in the holder.',
  loaded: 'The holder is in the analyzer. It now reads each tube and asks the LIS what is ordered.',
};

function StatusPill({ status, label }) {
  const cls = status === 'loaded' ? 'badge-emerald'
    : status === 'loading' ? 'badge-sky'
    : status === 'awaiting_key' ? 'badge-amber'
    : 'badge-secondary';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function RackScanDialog({ analyzer, onClose }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [duplicate, setDuplicate] = useState(null); // { barcode, position }

  const inputRef = useRef(null);
  const mounted = useRef(true);

  const status = session?.status || null;
  const positions = session?.positions || [];

  /** Keep the scanner target focused after every state change. */
  const refocus = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const applySession = useCallback((next) => {
    setSession(next);
    setEntry('');
    setDuplicate(null);
    refocus();
  }, [refocus]);

  /** Open (or resume) the holder session for this analyzer. */
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const res = await fetch('/api/lab/rack-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analyzerId: analyzer.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted.current) return;
        if (!res.ok) {
          setError(data.error || 'Could not start a holder session.');
        } else {
          setSession(data.session);
          if (data.reused) setNotice('Resumed the holder already in progress.');
          refocus();
        }
      } catch {
        if (mounted.current) setError('Could not reach the server.');
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => { mounted.current = false; };
  }, [analyzer.id, refocus]);

  /** Esc closes, matching the other modals in the app. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (action, extra = {}) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(`/api/lab/rack-sessions/${encodeURIComponent(session.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `Could not ${action} the holder.`); refocus(); return false; }
      applySession(data.session);
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitKey = async () => {
    const rackKey = entry.trim();
    if (!rackKey) return;
    const ok = await act('key', { rackKey });
    if (ok) setNotice(`Holder ${rackKey} ready. Scan tubes now.`);
  };

  const scanTube = async (barcode, confirmDuplicate = false) => {
    const code = String(barcode || '').trim();
    if (!code) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(`/api/lab/rack-sessions/${encodeURIComponent(session.id)}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: code, confirmDuplicate }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.reason === 'duplicate') {
        setDuplicate({ barcode: code, position: data.duplicateOf });
        setError(data.error);
        return;
      }
      if (!res.ok) { setError(data.error || 'That tube could not be added.'); setEntry(''); refocus(); return; }

      applySession(data.session);
      const p = data.position;
      setNotice(`Position ${p.position}: ${p.patientName || 'patient'} — ${p.tests.map((t) => t.code).join(', ') || 'no tests listed'}`);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
      refocus();
    }
  };

  const removeTube = async (position) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(
        `/api/lab/rack-sessions/${encodeURIComponent(session.id)}/positions?position=${position}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not clear that position.'); return; }
      applySession(data.session);
      setNotice(`Position ${position} cleared.`);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
      refocus();
    }
  };

  const onEntryKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (busy) return;
    if (status === 'awaiting_key') submitKey();
    else if (status === 'loading') scanTube(entry);
  };

  const matchedCount = positions.filter((p) => p.matched).length;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rack-scan-title"
        style={{ background: 'var(--bg-primary, #fff)', borderRadius: 'var(--radius-lg, 14px)', width: 'min(760px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <h3 id="rack-scan-title" style={{ margin: 0, fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '16px' }}>
              Load Sample Holder
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {analyzer.name}
              {session?.rackKey ? <> · holder <strong>{session.rackKey}</strong></> : null}
              {session?.capacity ? ` · ${positions.length}/${session.capacity} positions` : null}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {session ? <StatusPill status={session.status} label={session.statusLabel} /> : null}
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '18px 20px' }}>
          {loading ? <p style={{ color: 'var(--text-muted)', margin: 0 }}>Arming the holder scan…</p> : null}

          {!loading && !session ? (
            <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>
              {error || 'No holder session.'}
            </div>
          ) : null}

          {session ? (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 14px' }}>
                {STEP_HINT[status] || ''}
              </p>

              {/* Scanner input — the only focusable target during scanning */}
              {(status === 'awaiting_key' || status === 'loading') && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input
                    ref={inputRef}
                    className="form-control"
                    style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: '15px' }}
                    autoFocus
                    disabled={busy}
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    onKeyDown={onEntryKeyDown}
                    aria-label={status === 'awaiting_key' ? 'Holder key barcode' : 'Tube barcode'}
                    placeholder={status === 'awaiting_key' ? 'Scan holder key…' : 'Scan tube barcode…'}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={busy || !entry.trim()}
                    onClick={() => (status === 'awaiting_key' ? submitKey() : scanTube(entry))}
                  >
                    {status === 'awaiting_key' ? 'Accept key' : 'Add tube'}
                  </button>
                </div>
              )}

              {/* Feedback. aria-live so a scan is announced without stealing focus. */}
              <div aria-live="polite" style={{ minHeight: '22px', marginBottom: '10px' }}>
                {error ? (
                  <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600, fontSize: '13px' }}>
                    {error}
                    {duplicate ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ marginLeft: '10px' }}
                        disabled={busy}
                        onClick={() => scanTube(duplicate.barcode, true)}
                      >
                        Yes, it is a second tube
                      </button>
                    ) : null}
                  </div>
                ) : notice ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>{notice}</div>
                ) : null}
              </div>

              {/* Loaded positions */}
              {positions.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  No tubes scanned yet.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '54px' }}>Slot</th>
                        <th>Barcode</th>
                        <th>Patient</th>
                        <th>Tests</th>
                        {status === 'loading' ? <th style={{ width: '48px' }}></th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 800 }}>{p.position}</td>
                          <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>{p.barcode}</td>
                          <td style={{ fontSize: '12.5px' }}>{p.patientName || '—'}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.tests.join(', ') || '—'}</td>
                          {status === 'loading' ? (
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                aria-label={`Clear position ${p.position}`}
                                onClick={() => removeTube(p.position)}
                              >
                                ×
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer actions */}
        {session ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {matchedCount} tube(s) identified
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {status !== 'loaded' ? (
                <button className="btn btn-rose btn-sm" disabled={busy} onClick={() => act('cancel')}>
                  Cancel holder
                </button>
              ) : null}
              {status === 'loading' ? (
                <button
                  className="btn btn-emerald"
                  disabled={busy || positions.length === 0}
                  onClick={() => act('load')}
                >
                  Holder is in the analyzer
                </button>
              ) : null}
              {status === 'loaded' ? (
                <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await act('close')) onClose(); }}>
                  Holder removed — close
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
