"use client";

import React, { useState, useEffect, useCallback } from 'react';
import LeveyJenningsChart from './LeveyJenningsChart';

const RUN_ROLES = ['technician', 'senior_technician', 'admin'];
const CONFIG_ROLES = ['senior_technician', 'admin'];
const OVERRIDE_ROLES = ['senior_technician', 'pathologist', 'admin'];

function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
function batchBadge(s) {
  return ({ Pass: 'badge-emerald', Warning: 'badge-amber', Rejected: 'badge-rose', Overridden: 'badge-sky', Pending: 'badge-secondary' })[s] || 'badge-secondary';
}
const EMPTY_MATERIAL = { name: '', lotNumber: '', controlLevel: 'Level 1', analyzerId: '', manufacturer: '', expiryDate: '', targets: [{ testCode: '', testName: '', unit: '', targetMean: '', targetSd: '' }] };

export default function QualityControlPanel() {
  const [tab, setTab] = useState('dashboard');
  const [role, setRole] = useState('');
  const [myName, setMyName] = useState('');
  const [analyzers, setAnalyzers] = useState([]);
  const canRun = RUN_ROLES.includes(role);
  const canConfig = CONFIG_ROLES.includes(role);
  const canOverride = OVERRIDE_ROLES.includes(role);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      setRole(d?.profile?.role || d?.user?.role || '');
      setMyName(d?.profile?.full_name || d?.user?.username || '');
    }).catch(() => {});
    fetch('/api/lab/analyzers').then(r => r.ok ? r.json() : null).then(d => {
      setAnalyzers((d?.analyzers || []).filter(a => a.status !== 'manual'));
    }).catch(() => {});
  }, []);

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Quality Control</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Daily QC with Westgard multirule evaluation and Levey-Jennings charts. A failed QC blocks patient verification for the analyzer.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[['dashboard', 'Dashboard'], ['run', 'New QC Run'], ['lj', 'Levey-Jennings'], ['reports', 'Reports'], ...(canConfig ? [['materials', 'Materials']] : [])].map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard canOverride={canOverride} />}
      {tab === 'run' && <NewRun analyzers={analyzers} canRun={canRun} myName={myName} />}
      {tab === 'lj' && <LeveyJennings analyzers={analyzers} />}
      {tab === 'reports' && <Reports analyzers={analyzers} />}
      {tab === 'materials' && canConfig && <Materials analyzers={analyzers} />}
    </div>
  );
}

/* ── Dashboard ── */
function Dashboard({ canOverride }) {
  const [status, setStatus] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overrideFor, setOverrideFor] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        fetch('/api/lab/qc/status').then(r => r.ok ? r.json() : { analyzers: [] }),
        fetch('/api/lab/qc/batches?limit=15').then(r => r.ok ? r.json() : { batches: [] }),
      ]);
      setStatus(s); setBatches(b.batches || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onmessage = (e) => { try { if (JSON.parse(e.data).type === 'QC_BATCH') load(); } catch { /* ignore */ } };
    } catch { /* ignore */ }
    return () => { if (es) es.close(); };
  }, [load]);

  const override = async (id) => {
    if (!reason.trim()) return;
    await fetch(`/api/lab/qc/batches/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    setOverrideFor(null); setReason(''); load();
  };

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  return (
    <div>
      {status?.blockedCount > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--rose-light)', border: '1px solid var(--rose, #e11d48)', color: 'var(--rose-hover)', fontWeight: 700, marginBottom: '16px' }}>
          ⚠ {status.blockedCount} analyzer(s) have FAILED QC — patient verification is blocked until QC passes or is overridden.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        {(status?.analyzers || []).length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No QC runs recorded yet.</p>
          : status.analyzers.map(a => (
            <div key={a.analyzerId} style={{ border: `1px solid ${a.blocked ? 'var(--rose,#e11d48)' : 'var(--border-color)'}`, borderRadius: 'var(--radius-md)', padding: '14px', background: a.blocked ? 'var(--rose-light)' : 'transparent' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{a.analyzerName}</div>
              <div style={{ margin: '6px 0' }}><span className={`badge ${batchBadge(a.status)}`}>{a.status}</span></div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last run {fmt(a.lastRunAt)}</div>
              {a.blocked && canOverride && (
                overrideFor === a.batchId ? (
                  <div style={{ marginTop: '8px' }}>
                    <input className="form-control" placeholder="Override reason" value={reason} onChange={e => setReason(e.target.value)} style={{ marginBottom: '6px' }} />
                    <button className="btn btn-rose btn-sm" onClick={() => override(a.batchId)}>Confirm override</button>
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: '6px' }} onClick={() => { setOverrideFor(null); setReason(''); }}>Cancel</button>
                  </div>
                ) : <button className="btn btn-secondary btn-sm" style={{ marginTop: '8px' }} onClick={() => setOverrideFor(a.batchId)}>Override block</button>
              )}
            </div>
          ))}
      </div>

      <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '15px', marginBottom: '10px' }}>Recent QC Batches</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead><tr><th>Batch</th><th>Analyzer</th><th>Operator</th><th>Status</th><th>Run at</th></tr></thead>
          <tbody>
            {batches.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No batches.</td></tr>
              : batches.map(b => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{b.batch_no}</td>
                  <td>{b.analyzer_id}</td>
                  <td>{b.operator}</td>
                  <td><span className={`badge ${batchBadge(b.status)}`}>{b.status}</span></td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(b.run_at)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── New QC Run ── */
function NewRun({ analyzers, canRun, myName }) {
  const [analyzerId, setAnalyzerId] = useState('');
  const [materials, setMaterials] = useState([]);
  const [values, setValues] = useState({});
  const [operator, setOperator] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOperator(myName || ''); }, [myName]);

  const loadMaterials = useCallback(async (aid) => {
    setMaterials([]); setValues({}); setResult(null); setMsg('');
    if (!aid) return;
    const d = await fetch(`/api/lab/qc/materials?analyzerId=${encodeURIComponent(aid)}&active=true`).then(r => r.ok ? r.json() : { materials: [] });
    setMaterials(d.materials || []);
  }, []);

  const key = (mid, code) => `${mid}::${code}`;
  const submit = async () => {
    const results = [];
    for (const m of materials) for (const t of (m.targets || [])) {
      const v = values[key(m.id, t.test_code)];
      if (v !== undefined && v !== '' && !Number.isNaN(Number(v))) results.push({ materialId: m.id, testCode: t.test_code, value: Number(v) });
    }
    if (!results.length) { setMsg('Enter at least one control value.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/lab/qc/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyzerId, operator, results }),
      });
      const d = await res.json();
      if (res.ok) { setResult(d); setValues({}); } else setMsg(d.error || 'QC run failed.');
    } catch { setMsg('Network error.'); }
    finally { setBusy(false); }
  };

  if (!canRun) return <p style={{ color: 'var(--text-muted)' }}>You do not have permission to run QC.</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <select className="form-control" style={{ maxWidth: '260px' }} value={analyzerId} onChange={e => { setAnalyzerId(e.target.value); loadMaterials(e.target.value); }}>
          <option value="">Select analyzer…</option>
          {analyzers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="form-control" style={{ maxWidth: '220px' }} placeholder="Operator" value={operator} onChange={e => setOperator(e.target.value)} />
      </div>

      {analyzerId && materials.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No active QC materials configured for this analyzer.</p>}

      {materials.map(m => (
        <div key={m.id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '12px' }}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>{m.name} <span className="badge badge-sky">{m.control_level}</span> <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Lot {m.lot_number}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
            {(m.targets || []).map(t => (
              <div key={t.id}>
                <label className="form-label">{t.test_name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(μ {parseFloat(t.target_mean)} · SD {parseFloat(t.target_sd)})</span></label>
                <input className="form-control" type="number" step="any" placeholder={t.unit || 'value'} value={values[key(m.id, t.test_code)] ?? ''} onChange={e => setValues(v => ({ ...v, [key(m.id, t.test_code)]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {materials.length > 0 && (
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Evaluating…' : 'Run QC & Evaluate'}</button>
      )}
      {msg && <div style={{ marginTop: '10px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}

      {result && (
        <div style={{ marginTop: '18px' }}>
          <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', fontWeight: 700, marginBottom: '12px',
            background: result.batch.status === 'Rejected' ? 'var(--rose-light)' : result.batch.status === 'Warning' ? 'var(--amber-light, #fef3c7)' : 'var(--emerald-light, #d1fae5)',
            color: result.batch.status === 'Rejected' ? 'var(--rose-hover)' : result.batch.status === 'Warning' ? 'var(--amber-hover, #b45309)' : 'var(--emerald-hover, #047857)' }}>
            QC {result.batch.status}. {result.blocked ? 'Patient verification for this analyzer is now BLOCKED.' : ''}
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Test</th><th>Level</th><th>Value</th><th>Z</th><th>Westgard</th><th>Status</th></tr></thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i} style={{ background: r.status === 'Reject' ? 'var(--rose-light)' : r.status === 'Warning' ? 'var(--amber-light, #fef3c7)' : 'transparent' }}>
                    <td style={{ fontWeight: 600 }}>{r.testName}</td>
                    <td>{r.controlLevel}</td>
                    <td>{r.value}</td>
                    <td>{r.z != null ? r.z.toFixed(2) : '—'}</td>
                    <td style={{ fontWeight: 700 }}>{r.flags?.length ? r.flags.join(', ') : '—'}</td>
                    <td><span className={`badge ${r.status === 'Reject' ? 'badge-rose' : r.status === 'Warning' ? 'badge-amber' : 'badge-emerald'}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Levey-Jennings ── */
function LeveyJennings({ analyzers }) {
  const [analyzerId, setAnalyzerId] = useState('');
  const [materials, setMaterials] = useState([]);
  const [seriesKey, setSeriesKey] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const options = materials.flatMap(m => (m.targets || []).map(t => ({
    key: `${t.test_code}::${m.control_level}`, testCode: t.test_code, controlLevel: m.control_level,
    label: `${t.test_name} — ${m.control_level}`, unit: t.unit,
  })));

  const pickAnalyzer = async (aid) => {
    setAnalyzerId(aid); setMaterials([]); setSeriesKey(''); setData(null);
    if (!aid) return;
    const d = await fetch(`/api/lab/qc/materials?analyzerId=${encodeURIComponent(aid)}`).then(r => r.ok ? r.json() : { materials: [] });
    setMaterials(d.materials || []);
  };

  const pickSeries = async (k) => {
    setSeriesKey(k); setData(null);
    const opt = options.find(o => o.key === k);
    if (!opt) return;
    setLoading(true);
    try {
      const d = await fetch(`/api/lab/qc/results?analyzerId=${encodeURIComponent(analyzerId)}&testCode=${encodeURIComponent(opt.testCode)}&controlLevel=${encodeURIComponent(opt.controlLevel)}`).then(r => r.ok ? r.json() : null);
      setData(d ? { ...d, unit: opt.unit } : null);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <select className="form-control" style={{ maxWidth: '260px' }} value={analyzerId} onChange={e => pickAnalyzer(e.target.value)}>
          <option value="">Select analyzer…</option>
          {analyzers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: '260px' }} value={seriesKey} onChange={e => pickSeries(e.target.value)} disabled={!options.length}>
          <option value="">Select test / level…</option>
          {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        : data ? <LeveyJenningsChart points={data.points} mean={data.mean} sd={data.sd} unit={data.unit} />
        : <p style={{ color: 'var(--text-muted)' }}>Pick an analyzer and control to view its chart.</p>}
    </div>
  );
}

/* ── Reports ── */
function Reports({ analyzers }) {
  const [analyzerId, setAnalyzerId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (aid) => {
    setLoading(true);
    try {
      const qs = aid ? `?analyzerId=${encodeURIComponent(aid)}` : '';
      const d = await fetch(`/api/lab/qc/reports${qs}`).then(r => r.ok ? r.json() : null);
      setData(d);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(analyzerId);
  }, [load, analyzerId]);

  const t = data?.totals || {};
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <select className="form-control" style={{ maxWidth: '260px' }} value={analyzerId} onChange={e => setAnalyzerId(e.target.value)}>
          <option value="">All analyzers</option>
          {analyzers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : !data ? <p style={{ color: 'var(--text-muted)' }}>No data.</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[['Batches', t.batches, 'badge-secondary'], ['Pass', t.Pass, 'badge-emerald'], ['Warning', t.Warning, 'badge-amber'], ['Rejected', t.Rejected, 'badge-rose'], ['Overridden', t.Overridden, 'badge-sky']].map(([label, n, b]) => (
              <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>{n || 0}</div>
                <span className={`badge ${b}`}>{label}</span>
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>Westgard Rule Frequency</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {Object.keys(data.ruleFrequency || {}).length === 0 ? <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No violations in range.</span>
              : Object.entries(data.ruleFrequency).map(([rule, n]) => <span key={rule} className={`badge ${rule === '1-2s' ? 'badge-amber' : 'badge-rose'}`}>{rule}: {n}</span>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>By Analyzer</h3>
              <div className="table-responsive"><table className="data-table"><thead><tr><th>Analyzer</th><th>Batches</th><th>Rejected</th><th>Warning</th></tr></thead>
                <tbody>{(data.perAnalyzer || []).length === 0 ? <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>—</td></tr>
                  : data.perAnalyzer.map((r, i) => <tr key={i}><td>{r.analyzer_id}</td><td>{r.batches}</td><td>{Number(r.rejected) || 0}</td><td>{Number(r.warning) || 0}</td></tr>)}</tbody></table></div>
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>By Test</h3>
              <div className="table-responsive"><table className="data-table"><thead><tr><th>Test</th><th>Runs</th><th>Rejects</th><th>Warnings</th></tr></thead>
                <tbody>{(data.perTest || []).length === 0 ? <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>—</td></tr>
                  : data.perTest.map((r, i) => <tr key={i}><td>{r.test_name}</td><td>{r.runs}</td><td>{Number(r.rejects) || 0}</td><td>{Number(r.warnings) || 0}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Materials config (QC_CONFIG) ── */
function Materials({ analyzers }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_MATERIAL);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch('/api/lab/qc/materials').then(r => r.ok ? r.json() : { materials: [] });
      setMaterials(d.materials || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const startCreate = () => { setEditingId(null); setForm(EMPTY_MATERIAL); setMsg(''); setShowForm(true); };
  const startEdit = (m) => {
    setEditingId(m.id);
    setForm({
      name: m.name || '', lotNumber: m.lot_number || '', controlLevel: m.control_level || 'Level 1',
      analyzerId: m.analyzer_id || '', manufacturer: m.manufacturer || '', expiryDate: m.expiry_date ? String(m.expiry_date).slice(0, 10) : '',
      targets: (m.targets || []).map(t => ({ testCode: t.test_code, testName: t.test_name, unit: t.unit || '', targetMean: String(parseFloat(t.target_mean)), targetSd: String(parseFloat(t.target_sd)) })),
    });
    setMsg(''); setShowForm(true);
  };
  const setTarget = (i, k, v) => setForm(f => ({ ...f, targets: f.targets.map((t, j) => j === i ? { ...t, [k]: v } : t) }));
  const addTarget = () => setForm(f => ({ ...f, targets: [...f.targets, { testCode: '', testName: '', unit: '', targetMean: '', targetSd: '' }] }));
  const removeTarget = (i) => setForm(f => ({ ...f, targets: f.targets.filter((_, j) => j !== i) }));

  const save = async () => {
    if (!form.name.trim() || !form.lotNumber.trim() || !form.controlLevel.trim()) { setMsg('Name, lot and level are required.'); return; }
    const targets = form.targets.filter(t => t.testCode && t.targetMean !== '' && t.targetSd !== '' && Number(t.targetSd) > 0)
      .map(t => ({ testCode: t.testCode, testName: t.testName || t.testCode, unit: t.unit, targetMean: Number(t.targetMean), targetSd: Number(t.targetSd) }));
    setBusy(true); setMsg('');
    try {
      const url = editingId ? `/api/lab/qc/materials/${editingId}` : '/api/lab/qc/materials';
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, targets }) });
      const d = await res.json();
      if (res.ok) { setShowForm(false); setEditingId(null); load(); } else setMsg(d.error || 'Save failed.');
    } catch { setMsg('Network error.'); }
    finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (!confirm(`Delete QC material ${m.name}? Past QC results are kept.`)) return;
    await fetch(`/api/lab/qc/materials/${m.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary" onClick={startCreate}>+ Add Material</button>
      </div>

      {showForm && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px', background: 'var(--bg-subtle, #fafafa)' }}>
          <div style={{ fontWeight: 700, marginBottom: '12px' }}>{editingId ? 'Edit Material' : 'New QC Material'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            <div><label className="form-label">Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="form-label">Lot number *</label><input className="form-control" value={form.lotNumber} onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))} /></div>
            <div><label className="form-label">Control level *</label>
              <select className="form-control" value={form.controlLevel} onChange={e => setForm(f => ({ ...f, controlLevel: e.target.value }))}>
                <option>Level 1</option><option>Level 2</option><option>Level 3</option>
              </select></div>
            <div><label className="form-label">Analyzer</label>
              <select className="form-control" value={form.analyzerId} onChange={e => setForm(f => ({ ...f, analyzerId: e.target.value }))}>
                <option value="">—</option>{analyzers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></div>
            <div><label className="form-label">Manufacturer</label><input className="form-control" value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
            <div><label className="form-label">Expiry</label><input className="form-control" type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
          </div>
          <div style={{ fontWeight: 700, fontSize: '13px', margin: '6px 0' }}>Analyte targets (mean / SD)</div>
          {form.targets.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 0.8fr 0.9fr 0.9fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
              <div><label className="form-label">Test code</label><input className="form-control" value={t.testCode} onChange={e => setTarget(i, 'testCode', e.target.value)} placeholder="GLUCOSE" /></div>
              <div><label className="form-label">Name</label><input className="form-control" value={t.testName} onChange={e => setTarget(i, 'testName', e.target.value)} placeholder="Glucose" /></div>
              <div><label className="form-label">Unit</label><input className="form-control" value={t.unit} onChange={e => setTarget(i, 'unit', e.target.value)} placeholder="mg/dL" /></div>
              <div><label className="form-label">Mean</label><input className="form-control" type="number" step="any" value={t.targetMean} onChange={e => setTarget(i, 'targetMean', e.target.value)} /></div>
              <div><label className="form-label">SD</label><input className="form-control" type="number" step="any" value={t.targetSd} onChange={e => setTarget(i, 'targetSd', e.target.value)} /></div>
              <button className="btn btn-rose btn-sm" onClick={() => removeTarget(i)}>✕</button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={addTarget}>+ Add analyte</button>
          {msg && <div style={{ marginTop: '10px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : editingId ? 'Save Changes' : 'Create Material'}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : (
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Material</th><th>Lot</th><th>Level</th><th>Analyzer</th><th>Analytes</th><th>Active</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {materials.length === 0 ? <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No QC materials configured.</td></tr>
                : materials.map(m => (
                  <tr key={m.id} style={{ opacity: m.active ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 700 }}>{m.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{m.lot_number}</td>
                    <td>{m.control_level}</td>
                    <td>{m.analyzer_id || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{(m.targets || []).map(t => t.test_name).join(', ') || '—'}</td>
                    <td>{m.active ? <span className="badge badge-emerald">Active</span> : <span className="badge badge-secondary">Inactive</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEdit(m)} style={{ marginRight: '6px' }}>Edit</button>
                      <button className="btn btn-rose btn-sm" onClick={() => remove(m)}>Delete</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
