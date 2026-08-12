"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Manual Result Entry — for analyzers with no data link (Qualcyte 10) or any
 * machine not yet decoded. The operator scans the specimen barcode (which
 * preserves identity), the LIS shows what was ordered for that accession, and
 * the operator types the values from the machine's screen/printout.
 *
 * Entry goes through the SAME ingestion path as automatic results, so it lands
 * as 'Pending Verification' and still requires human sign-off before release.
 */

const MANUAL_ID = 'manual-entry';

export default function ManualEntryPanel() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState(MANUAL_ID);

  const [barcode, setBarcode] = useState('');
  const [order, setOrder] = useState(null);        // { specimenId, order, tests }
  const [values, setValues] = useState([]);         // aligned to order.tests
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);     // { kind: 'ok'|'err'|'info', text }

  const barcodeRef = useRef(null);

  const loadMachines = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/analyzers');
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.analyzers) ? data.analyzers : [];
      setMachines(list);
      // Default to a manual-only machine (e.g. Qualcyte 10) if one exists.
      const manual = list.find((m) => m.status === 'manual');
      if (manual) setMachineId(manual.id);
    } catch { /* non-fatal — the manual option still works */ }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMachines();
  }, [loadMachines]);

  const resetSample = () => {
    setOrder(null);
    setValues([]);
    setBarcode('');
    setLookupError('');
    setTimeout(() => barcodeRef.current?.focus(), 0);
  };

  const lookup = async () => {
    const specimen = barcode.trim();
    setMessage(null);
    setLookupError('');
    setOrder(null);
    setValues([]);
    if (!specimen) { setLookupError('Scan or type a specimen barcode first.'); return; }

    setLookupLoading(true);
    try {
      const res = await fetch(`/api/lab/host-query?specimen=${encodeURIComponent(specimen)}`);
      const data = await res.json();
      if (!res.ok) { setLookupError(data.error || 'Lookup failed.'); return; }
      if (!data.found) {
        setLookupError(`No open order matches "${specimen}". Check the barcode, or make sure the order was created.`);
        return;
      }
      setOrder(data);
      setValues((data.tests || []).map(() => ({ value: '', unit: '', flag: '' })));
    } catch {
      setLookupError('Network error during lookup.');
    } finally {
      setLookupLoading(false);
    }
  };

  const updateValue = (idx, field, v) => {
    setValues((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: v } : row)));
  };

  const submit = async () => {
    if (!order) return;
    const tests = (order.tests || [])
      .map((t, i) => ({ name: t.name, ...values[i] }))
      .filter((x) => x.value && x.value.trim())
      .map((x) => ({
        // Match the ordered test by NAME so the existing result row is updated
        // (ingestion keys on test_name), not duplicated.
        code: x.name,
        value: x.value.trim(),
        unit: (x.unit || '').trim() || undefined,
        flag: (x.flag || '').trim() || undefined,
      }));

    if (!tests.length) { setMessage({ kind: 'err', text: 'Enter at least one result value.' }); return; }

    const machineName = machines.find((m) => m.id === machineId)?.name || 'Manual entry';
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/lab/analyzer/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analyzerId: machineId || MANUAL_ID,
          specimenId: order.specimenId,
          tests,
          raw: `Manual entry via ${machineName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ kind: 'err', text: data.error || `Could not record results (${res.status}).` }); return; }
      if (data.status === 'duplicate') {
        setMessage({ kind: 'info', text: 'These results were already recorded for this specimen.' });
        return;
      }
      setMessage({
        kind: 'ok',
        text: `Recorded ${tests.length} result(s) for ${order.order?.patientName || order.specimenId} — sent for verification.`,
      });
      resetSample();
    } catch {
      setMessage({ kind: 'err', text: 'Network error while recording results.' });
    } finally {
      setSubmitting(false);
    }
  };

  const msgStyle = {
    ok: { background: 'var(--emerald-light)', color: 'var(--emerald-hover, #047857)' },
    err: { background: 'var(--rose-light)', color: 'var(--rose-hover)' },
    info: { background: 'var(--bg-subtle, #f1f5f9)', color: 'var(--text-secondary)' },
  };

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      {/* Header */}
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>
          Manual Result Entry
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', maxWidth: '700px' }}>
          For machines with no data link (e.g. Qualcyte 10) or any analyzer not yet integrated. Scan the specimen barcode, then type the values from the machine&apos;s screen or printout. The barcode keeps identity exact — results still go to verification before release.
        </p>
      </div>

      {message && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '13px', ...(msgStyle[message.kind] || msgStyle.info) }}>
          {message.text}
        </div>
      )}

      {/* Scan / lookup controls */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label htmlFor="me-machine" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Instrument / source</label>
          <select id="me-machine" className="form-control" style={{ minWidth: '200px' }} value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value={MANUAL_ID}>Manual entry (unlisted)</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 260px' }}>
          <label htmlFor="me-barcode" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Specimen barcode / accession</label>
          <input
            id="me-barcode"
            ref={barcodeRef}
            className="form-control"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
            placeholder="Scan or type, then press Enter…"
            autoFocus
          />
        </div>
        <button className="btn btn-primary" onClick={lookup} disabled={lookupLoading}>
          {lookupLoading ? 'Looking up…' : 'Look up'}
        </button>
      </div>

      {lookupError && (
        <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--amber-light, #fef3c7)', color: 'var(--amber-hover, #b45309)', fontWeight: 600, fontSize: '13px' }}>
          {lookupError}
        </div>
      )}

      {/* Ordered tests → value entry */}
      {order && order.found && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '14px 16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', marginBottom: '16px' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>{order.order?.patientName || 'Unknown patient'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {order.order?.patientId || ''}{order.order?.sex ? ` · ${order.order.sex}` : ''}{order.order?.age != null ? ` · ${order.order.age}y` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{order.specimenId}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Order {order.order?.id}{order.order?.priority ? ` · ${order.order.priority}` : ''}
              </div>
            </div>
          </div>

          {(order.tests || []).length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              This order has no tests listed. Nothing to enter.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr><th>Test</th><th style={{ width: '160px' }}>Result value</th><th style={{ width: '120px' }}>Unit</th><th style={{ width: '110px' }}>Flag</th></tr>
                  </thead>
                  <tbody>
                    {order.tests.map((t, i) => (
                      <tr key={`${t.code || t.name}-${i}`}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
                          {t.department && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.department}</div>}
                        </td>
                        <td>
                          <input
                            className="form-control"
                            value={values[i]?.value || ''}
                            onChange={(e) => updateValue(i, 'value', e.target.value)}
                            placeholder="e.g. 7.2"
                          />
                        </td>
                        <td>
                          <input
                            className="form-control"
                            value={values[i]?.unit || ''}
                            onChange={(e) => updateValue(i, 'unit', e.target.value)}
                            placeholder="e.g. mmol/L"
                          />
                        </td>
                        <td>
                          <input
                            className="form-control"
                            value={values[i]?.flag || ''}
                            onChange={(e) => updateValue(i, 'flag', e.target.value)}
                            placeholder="H / L / —"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                  {submitting ? 'Recording…' : 'Record results'}
                </button>
                <button className="btn btn-secondary" onClick={resetSample} disabled={submitting}>Clear</button>
                <span style={{ alignSelf: 'center', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Only tests with a value entered are recorded. Blank rows are left untouched.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
