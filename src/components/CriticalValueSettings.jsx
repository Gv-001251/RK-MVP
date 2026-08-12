"use client";

import React, { useState, useEffect, useCallback } from 'react';

const OPERATORS = [
  { value: '>', label: '> greater than' },
  { value: '>=', label: '≥ at least' },
  { value: '<', label: '< less than' },
  { value: '<=', label: '≤ at most' },
  { value: '=', label: '= equal to' },
  { value: 'positive', label: 'Positive / qualitative' },
];

const EMPTY = {
  testCode: '', testName: '', aliases: '', operator: '>', thresholdValue: '',
  qualitativeMatch: 'Positive', unit: '', severity: 'Critical', message: '',
  requiresConfirmation: true, enabled: true,
};

function ruleThreshold(r) {
  if (r.operator === 'positive') return r.qualitative_match || 'Positive';
  const n = r.threshold_value != null ? parseFloat(r.threshold_value) : r.threshold_value;
  return `${r.operator} ${n}${r.unit ? ` ${r.unit}` : ''}`;
}

export default function CriticalValueSettings() {
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
      const res = await fetch('/api/lab/critical-rules');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRules(data.rules || []);
      setError('');
    } catch {
      setError('Could not load critical-value rules. Admin access required.');
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
      operator: r.operator || '>', thresholdValue: r.threshold_value != null ? String(parseFloat(r.threshold_value)) : '',
      qualitativeMatch: r.qualitative_match || 'Positive', unit: r.unit || '',
      severity: r.severity || 'Critical', message: r.message || '',
      requiresConfirmation: !!r.requires_confirmation, enabled: !!r.enabled,
    });
    setMsg(''); setShowForm(true);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.testCode.trim() || !form.testName.trim()) { setMsg('Test code and name are required.'); return; }
    if (form.operator !== 'positive' && (form.thresholdValue === '' || Number.isNaN(Number(form.thresholdValue)))) {
      setMsg('A numeric threshold is required for this operator.'); return;
    }
    setBusy(true); setMsg('');
    try {
      const url = editingId ? `/api/lab/critical-rules/${editingId}` : '/api/lab/critical-rules';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
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
      await fetch(`/api/lab/critical-rules/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !r.enabled }),
      });
      load();
    } catch { /* ignore */ }
  };

  const remove = async (r) => {
    if (!confirm(`Delete the critical rule for ${r.test_name} (${ruleThreshold(r)})? Existing alerts are kept.`)) return;
    try {
      await fetch(`/api/lab/critical-rules/${r.id}`, { method: 'DELETE' });
      load();
    } catch { /* ignore */ }
  };

  const isQual = form.operator === 'positive';

  return (
    <div className="panel-card col-12" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>Critical Value Thresholds</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Rules evaluated automatically when results arrive. A breach raises a red alert requiring technician confirmation.
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
              <div style={{ fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>{editingId ? 'Edit Rule' : 'New Critical Rule'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
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
                  <label className="form-label">Operator *</label>
                  <select className="form-control" value={form.operator} onChange={e => set('operator', e.target.value)}>
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {isQual ? (
                  <div>
                    <label className="form-label">Matches text</label>
                    <input className="form-control" value={form.qualitativeMatch} onChange={e => set('qualitativeMatch', e.target.value)} placeholder="Positive" />
                  </div>
                ) : (
                  <div>
                    <label className="form-label">Threshold *</label>
                    <input className="form-control" type="number" step="any" value={form.thresholdValue} onChange={e => set('thresholdValue', e.target.value)} placeholder="6.5" />
                  </div>
                )}
                <div>
                  <label className="form-label">Unit</label>
                  <input className="form-control" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="mmol/L" />
                </div>
                <div>
                  <label className="form-label">Severity</label>
                  <select className="form-control" value={form.severity} onChange={e => set('severity', e.target.value)}>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label className="form-label">Clinical message</label>
                <input className="form-control" value={form.message} onChange={e => set('message', e.target.value)} placeholder="Critical hyperkalemia — risk of cardiac arrhythmia." />
              </div>
              <div style={{ display: 'flex', gap: '18px', marginTop: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.requiresConfirmation} onChange={e => set('requiresConfirmation', e.target.checked)} />
                  Require technician confirmation
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
                <tr><th>Test</th><th>Condition</th><th>Severity</th><th>Confirm</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr><td colSpan={6} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No rules configured yet.</td></tr>
                ) : rules.map(r => (
                  <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.test_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.test_code}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--rose-hover, #be123c)' }}>{ruleThreshold(r)}</td>
                    <td><span className={`badge ${r.severity === 'Critical' ? 'badge-rose' : 'badge-amber'}`}>{r.severity}</span></td>
                    <td>{r.requires_confirmation ? 'Required' : 'Optional'}</td>
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
