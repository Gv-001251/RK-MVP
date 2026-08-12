"use client";

import React, { useState, useEffect, useCallback } from 'react';

const DELTA_TYPES = [
  { value: 'either', label: 'Absolute or Percent' },
  { value: 'absolute', label: 'Absolute change' },
  { value: 'percent', label: 'Percent change' },
];
const DIRECTIONS = [
  { value: 'either', label: 'Either direction' },
  { value: 'increase', label: 'Increase only' },
  { value: 'decrease', label: 'Decrease only' },
];

const EMPTY = {
  testCode: '', testName: '', aliases: '', deltaType: 'either', absThreshold: '', pctThreshold: '',
  direction: 'either', maxHours: '', unit: '', severity: 'Warning', message: '',
  requiresVerification: true, enabled: true,
};

function ruleThreshold(r) {
  const type = r.delta_type || 'either';
  const parts = [];
  if ((type === 'absolute' || type === 'either') && r.abs_threshold != null) parts.push(`Δ ≥ ${parseFloat(r.abs_threshold)}${r.unit ? ` ${r.unit}` : ''}`);
  if ((type === 'percent' || type === 'either') && r.pct_threshold != null) parts.push(`Δ ≥ ${parseFloat(r.pct_threshold)}%`);
  return parts.join(' or ') || '—';
}

export default function DeltaCheckSettings() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/delta-rules');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRules(data.rules || []);
      setError('');
    } catch {
      setError('Could not load delta-check rules. Admin access required.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setMsg(''); setShowForm(true); };
  const startEdit = (r) => {
    setEditingId(r.id);
    setForm({
      testCode: r.test_code || '', testName: r.test_name || '', aliases: r.aliases || '',
      deltaType: r.delta_type || 'either',
      absThreshold: r.abs_threshold != null ? String(parseFloat(r.abs_threshold)) : '',
      pctThreshold: r.pct_threshold != null ? String(parseFloat(r.pct_threshold)) : '',
      direction: r.direction || 'either', maxHours: r.max_hours != null ? String(r.max_hours) : '',
      unit: r.unit || '', severity: r.severity || 'Warning', message: r.message || '',
      requiresVerification: !!r.requires_verification, enabled: !!r.enabled,
    });
    setMsg(''); setShowForm(true);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.testCode.trim() || !form.testName.trim()) { setMsg('Test code and name are required.'); return; }
    const needAbs = form.deltaType === 'absolute';
    const needPct = form.deltaType === 'percent';
    const hasAbs = form.absThreshold !== '' && !Number.isNaN(Number(form.absThreshold));
    const hasPct = form.pctThreshold !== '' && !Number.isNaN(Number(form.pctThreshold));
    if (needAbs && !hasAbs) { setMsg('An absolute threshold is required.'); return; }
    if (needPct && !hasPct) { setMsg('A percent threshold is required.'); return; }
    if (form.deltaType === 'either' && !hasAbs && !hasPct) { setMsg('Provide an absolute and/or percent threshold.'); return; }

    setBusy(true); setMsg('');
    try {
      const url = editingId ? `/api/lab/delta-rules/${editingId}` : '/api/lab/delta-rules';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) { setShowForm(false); setEditingId(null); load(); }
      else setMsg(data.error || 'Save failed.');
    } catch {
      setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (r) => {
    try {
      await fetch(`/api/lab/delta-rules/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !r.enabled }) });
      load();
    } catch { /* ignore */ }
  };

  const remove = async (r) => {
    if (!confirm(`Delete the delta rule for ${r.test_name}? Existing flags are kept.`)) return;
    try {
      await fetch(`/api/lab/delta-rules/${r.id}`, { method: 'DELETE' });
      load();
    } catch { /* ignore */ }
  };

  const showAbs = form.deltaType === 'absolute' || form.deltaType === 'either';
  const showPct = form.deltaType === 'percent' || form.deltaType === 'either';

  return (
    <div className="panel-card col-12" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>Delta Check Thresholds</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Each new result is compared with the patient&apos;s previous result for the same test. A change beyond these thresholds flags the result for manual verification.
          </p>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>+ Add Rule</button>
      </div>

      {error ? (
        <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', color: 'var(--rose-hover)', fontWeight: 600 }}>{error}</div>
      ) : loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          {showForm && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '18px', marginBottom: '18px', background: 'var(--bg-subtle, #fafafa)' }}>
              <div style={{ fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>{editingId ? 'Edit Delta Rule' : 'New Delta Rule'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="form-label">Test code *</label>
                  <input className="form-control" value={form.testCode} onChange={e => set('testCode', e.target.value)} placeholder="POTASSIUM" />
                </div>
                <div>
                  <label className="form-label">Display name *</label>
                  <input className="form-control" value={form.testName} onChange={e => set('testName', e.target.value)} placeholder="Potassium" />
                </div>
                <div>
                  <label className="form-label">Match aliases</label>
                  <input className="form-control" value={form.aliases} onChange={e => set('aliases', e.target.value)} placeholder="K, K+, Serum Potassium" />
                </div>
                <div>
                  <label className="form-label">Delta type *</label>
                  <select className="form-control" value={form.deltaType} onChange={e => set('deltaType', e.target.value)}>
                    {DELTA_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {showAbs && (
                  <div>
                    <label className="form-label">Absolute Δ{form.deltaType === 'either' ? '' : ' *'}</label>
                    <input className="form-control" type="number" step="any" value={form.absThreshold} onChange={e => set('absThreshold', e.target.value)} placeholder="1.5" />
                  </div>
                )}
                {showPct && (
                  <div>
                    <label className="form-label">Percent Δ (%){form.deltaType === 'either' ? '' : ' *'}</label>
                    <input className="form-control" type="number" step="any" value={form.pctThreshold} onChange={e => set('pctThreshold', e.target.value)} placeholder="50" />
                  </div>
                )}
                <div>
                  <label className="form-label">Direction</label>
                  <select className="form-control" value={form.direction} onChange={e => set('direction', e.target.value)}>
                    {DIRECTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Time window (hours)</label>
                  <input className="form-control" type="number" value={form.maxHours} onChange={e => set('maxHours', e.target.value)} placeholder="168 (blank = any)" />
                </div>
                <div>
                  <label className="form-label">Unit</label>
                  <input className="form-control" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="mmol/L" />
                </div>
                <div>
                  <label className="form-label">Severity</label>
                  <select className="form-control" value={form.severity} onChange={e => set('severity', e.target.value)}>
                    <option value="Warning">Warning</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label className="form-label">Message</label>
                <input className="form-control" value={form.message} onChange={e => set('message', e.target.value)} placeholder="Large potassium shift since previous result." />
              </div>
              <div style={{ display: 'flex', gap: '18px', marginTop: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.requiresVerification} onChange={e => set('requiresVerification', e.target.checked)} />
                  Require manual verification
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
                  Enabled
                </label>
              </div>
              {msg && <div style={{ marginTop: '10px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : editingId ? 'Save Changes' : 'Create Rule'}</button>
                <button className="btn btn-secondary" disabled={busy} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Test</th><th>Delta threshold</th><th>Direction</th><th>Window</th><th>Severity</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No delta rules configured yet.</td></tr>
                ) : rules.map(r => (
                  <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.test_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.test_code}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--amber-hover, #b45309)' }}>{ruleThreshold(r)}</td>
                    <td style={{ textTransform: 'capitalize', fontSize: '12px' }}>{r.direction}</td>
                    <td style={{ fontSize: '12px' }}>{r.max_hours != null ? `${r.max_hours}h` : 'Any'}</td>
                    <td><span className={`badge ${r.severity === 'Critical' ? 'badge-rose' : 'badge-amber'}`}>{r.severity}</span></td>
                    <td>
                      <button className={`badge ${r.enabled ? 'badge-emerald' : 'badge-secondary'}`} onClick={() => toggleEnabled(r)} style={{ border: 'none', cursor: 'pointer' }} title="Toggle enabled">
                        {r.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEdit(r)} style={{ marginRight: '6px' }}>Edit</button>
                      <button className="btn btn-rose btn-sm" onClick={() => remove(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
