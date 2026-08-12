"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';

const MANAGE_ROLES = ['technician', 'senior_technician', 'admin'];
const CATEGORIES = ['Reagent', 'Kit', 'Control', 'Calibrator', 'Consumable'];

function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
function dateOnly(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(); }

export default function InventoryManagementPanel() {
  const [tab, setTab] = useState('dashboard');
  const [role, setRole] = useState('');
  const canManage = MANAGE_ROLES.includes(role);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => setRole(d?.profile?.role || d?.user?.role || '')).catch(() => {});
  }, []);

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Laboratory Inventory</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Reagents, kits, controls, calibrators and consumables — with stock movements, auto-consumption, and expiry/low-stock alerts.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[['dashboard', 'Dashboard'], ['catalog', 'Catalog'], ['ledger', 'Ledger'], ['reports', 'Reports']].map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'catalog' && <Catalog canManage={canManage} />}
      {tab === 'ledger' && <Ledger />}
      {tab === 'reports' && <Reports />}
    </div>
  );
}

/* ── Dashboard ── */
function Dashboard() {
  const { currency } = useClinic();
  const [alerts, setAlerts] = useState(null);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const debounce = useRef(null);

  const load = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([
        fetch('/api/lab/inventory/alerts').then(x => x.ok ? x.json() : null),
        fetch('/api/lab/inventory/reports').then(x => x.ok ? x.json() : null),
      ]);
      setAlerts(a); setTotals(r?.totals || null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onmessage = (e) => {
        try {
          const t = JSON.parse(e.data).type;
          if (t === 'INVENTORY_UPDATED' || t === 'INVENTORY_LOW') {
            if (debounce.current) clearTimeout(debounce.current);
            debounce.current = setTimeout(load, 400);
          }
        } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    return () => { if (es) es.close(); if (debounce.current) clearTimeout(debounce.current); };
  }, [load]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  const kpis = [
    ['Items', totals?.items ?? 0, 'badge-secondary'],
    ['Stock Value', `${currency}${(totals?.stockValue ?? 0).toLocaleString()}`, 'badge-sky'],
    ['Low Stock', alerts?.counts?.lowStock ?? 0, 'badge-rose'],
    ['Expiring ≤30d', alerts?.counts?.expiringSoon ?? 0, 'badge-amber'],
    ['Expired', alerts?.counts?.expired ?? 0, 'badge-rose'],
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        {kpis.map(([label, val, badge]) => (
          <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{val}</div>
            <span className={`badge ${badge}`}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <AlertList title="Low / Out of Stock" items={alerts?.lowStock || []} render={i => `${i.currentStock} / min ${i.minimumStock} ${i.unit}`} tone="rose" />
        <AlertList title="Expiring & Expired" items={[...(alerts?.expired || []), ...(alerts?.expiringSoon || [])]} render={i => i.expired ? `EXPIRED ${dateOnly(i.expiryDate)}` : `${i.daysToExpiry}d left · ${dateOnly(i.expiryDate)}`} tone="amber" />
      </div>
    </div>
  );
}

function AlertList({ title, items, render, tone }) {
  return (
    <div>
      <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>{title} ({items.length})</h3>
      {items.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nothing to flag.</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.slice(0, 10).map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: tone === 'rose' ? 'var(--rose-light)' : 'var(--amber-light, #fef3c7)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{i.name}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: tone === 'rose' ? 'var(--rose-hover)' : 'var(--amber-hover, #b45309)' }}>{render(i)}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

/* ── Catalog ── */
const EMPTY_ITEM = { name: '', category: 'Reagent', unit: 'tests', stockQty: '', minimumStock: '10', expiryDate: '', lotNumber: '', vendor: '', location: '', costPerUnit: '0', consumePerTest: '0', analyzerId: '', notes: '' };

function Catalog({ canManage }) {
  const { currency } = useClinic();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [analyzers, setAnalyzers] = useState([]);
  const [form, setForm] = useState(null);      // item form (create/edit) or null
  const [editingId, setEditingId] = useState(null);
  const [stockFor, setStockFor] = useState(null); // item for stock modal
  const [stock, setStock] = useState({ type: 'in', quantity: '', reason: '', lotNumber: '', expiryDate: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (q) params.set('q', q);
      const d = await fetch(`/api/lab/inventory?${params.toString()}`).then(r => r.ok ? r.json() : { inventory: [] });
      setItems(d.inventory || []);
    } finally { setLoading(false); }
  }, [category, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    fetch('/api/lab/analyzers').then(r => r.ok ? r.json() : null).then(d => setAnalyzers((d?.analyzers || []).filter(a => a.status !== 'manual'))).catch(() => {});
  }, []);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_ITEM); setMsg(''); };
  const openEdit = (i) => {
    setEditingId(i.id);
    setForm({
      name: i.name, category: i.category, unit: i.unit, stockQty: String(i.currentStock),
      minimumStock: String(i.minimumStock), expiryDate: i.expiryDate ? String(i.expiryDate).slice(0, 10) : '',
      lotNumber: i.lotNumber || '', vendor: i.vendor || '', location: i.storageLocation || '',
      costPerUnit: String(i.costPerUnit), consumePerTest: String(i.consumePerTest), analyzerId: i.analyzerId || '', notes: i.notes || '',
    });
    setMsg('');
  };

  const saveItem = async () => {
    if (!form.name.trim()) { setMsg('Name is required.'); return; }
    setBusy(true); setMsg('');
    try {
      const url = editingId ? `/api/lab/inventory/${editingId}` : '/api/lab/inventory';
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await res.json();
      if (res.ok) { setForm(null); setEditingId(null); load(); } else setMsg(d.error || 'Save failed.');
    } catch { setMsg('Network error.'); }
    finally { setBusy(false); }
  };

  const remove = async (i) => {
    if (!confirm(`Delete ${i.name}? Ledger history is kept.`)) return;
    await fetch(`/api/lab/inventory/${i.id}`, { method: 'DELETE' });
    load();
  };

  const submitStock = async () => {
    const qty = Number(stock.quantity);
    if (Number.isNaN(qty) || (stock.type !== 'adjust' && qty <= 0)) { setMsg('Enter a valid quantity.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/lab/inventory/${stockFor.id}/stock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: stock.type, quantity: qty, reason: stock.reason, lotNumber: stock.lotNumber, expiryDate: stock.expiryDate || undefined }),
      });
      const d = await res.json();
      if (res.ok) { setStockFor(null); setStock({ type: 'in', quantity: '', reason: '', lotNumber: '', expiryDate: '' }); load(); }
      else setMsg(d.error || 'Stock movement failed.');
    } catch { setMsg('Network error.'); }
    finally { setBusy(false); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <select className="form-control" style={{ maxWidth: '180px' }} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="form-control" style={{ maxWidth: '240px' }} placeholder="Search name / vendor / lot…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        <button className="btn btn-primary btn-sm" onClick={load}>Search</button>
        {canManage && <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openCreate}>+ Add Item</button>}
      </div>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : (
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Min</th><th>Lot</th><th>Vendor</th><th>Location</th><th>Expiry</th><th>Value</th>{canManage && <th style={{ textAlign: 'right' }}>Actions</th>}</tr></thead>
            <tbody>
              {items.length === 0 ? <tr><td colSpan={canManage ? 10 : 9} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No items.</td></tr>
                : items.map(i => (
                  <tr key={i.id}>
                    <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{i.name}</div>{i.notes && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{i.notes}</div>}</td>
                    <td><span className="badge badge-sky">{i.category}</span></td>
                    <td>
                      <span style={{ fontWeight: 800, color: i.low || i.outOfStock ? 'var(--rose-hover)' : 'var(--text-primary)' }}>{i.currentStock} {i.unit}</span>
                      {(i.low || i.outOfStock) && <span className="badge badge-rose" style={{ marginLeft: '6px' }}>{i.outOfStock ? 'Out' : 'Low'}</span>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{i.minimumStock}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{i.lotNumber || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{i.vendor || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{i.storageLocation || '—'}</td>
                    <td style={{ fontSize: '12px', color: i.expired ? 'var(--rose-hover)' : i.expiringSoon ? 'var(--amber-hover, #b45309)' : 'var(--text-secondary)', fontWeight: i.expired || i.expiringSoon ? 700 : 400 }}>
                      {i.expiryDate ? dateOnly(i.expiryDate) : '—'}{i.expired ? ' (expired)' : i.expiringSoon ? ` (${i.daysToExpiry}d)` : ''}
                    </td>
                    <td style={{ fontSize: '12px' }}>{currency}{i.stockValue.toLocaleString()}</td>
                    {canManage && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => { setStockFor(i); setStock({ type: 'in', quantity: '', reason: '', lotNumber: '', expiryDate: '' }); setMsg(''); }} style={{ marginRight: '6px' }}>Stock</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(i)} style={{ marginRight: '6px' }}>Edit</button>
                        <button className="btn btn-rose btn-sm" onClick={() => remove(i)}>Del</button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Item create/edit modal */}
      {form && (
        <Modal title={editingId ? 'Edit Item' : 'New Inventory Item'} onClose={() => { setForm(null); setEditingId(null); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
            <Field label="Name *"><input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
            <Field label="Category"><select className="form-control" value={form.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Unit"><input className="form-control" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="tests / vials / pcs" /></Field>
            {!editingId && <Field label="Opening stock"><input className="form-control" type="number" step="any" value={form.stockQty} onChange={e => set('stockQty', e.target.value)} /></Field>}
            <Field label="Minimum stock"><input className="form-control" type="number" step="any" value={form.minimumStock} onChange={e => set('minimumStock', e.target.value)} /></Field>
            <Field label="Lot number"><input className="form-control" value={form.lotNumber} onChange={e => set('lotNumber', e.target.value)} /></Field>
            <Field label="Vendor"><input className="form-control" value={form.vendor} onChange={e => set('vendor', e.target.value)} /></Field>
            <Field label="Storage location"><input className="form-control" value={form.location} onChange={e => set('location', e.target.value)} /></Field>
            <Field label="Expiry"><input className="form-control" type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></Field>
            <Field label={`Cost / unit (${currency})`}><input className="form-control" type="number" step="any" value={form.costPerUnit} onChange={e => set('costPerUnit', e.target.value)} /></Field>
            <Field label="Analyzer (auto-consume)"><select className="form-control" value={form.analyzerId} onChange={e => set('analyzerId', e.target.value)}><option value="">—</option>{analyzers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Consume / test"><input className="form-control" type="number" step="any" value={form.consumePerTest} onChange={e => set('consumePerTest', e.target.value)} /></Field>
          </div>
          <Field label="Notes"><input className="form-control" value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
          {msg && <div style={{ marginTop: '10px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn btn-primary" disabled={busy} onClick={saveItem}>{busy ? 'Saving…' : editingId ? 'Save' : 'Create'}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => { setForm(null); setEditingId(null); }}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Stock movement modal */}
      {stockFor && (
        <Modal title={`Stock movement — ${stockFor.name}`} onClose={() => setStockFor(null)}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Current: <strong>{stockFor.currentStock} {stockFor.unit}</strong></div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {[['in', 'Stock In'], ['out', 'Stock Out'], ['adjust', 'Adjust']].map(([t, l]) => (
              <button key={t} className={`btn btn-sm ${stock.type === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStock(s => ({ ...s, type: t }))}>{l}</button>
            ))}
          </div>
          <Field label={stock.type === 'adjust' ? 'Signed quantity (+/-)' : 'Quantity'}><input className="form-control" type="number" step="any" value={stock.quantity} onChange={e => setStock(s => ({ ...s, quantity: e.target.value }))} /></Field>
          {stock.type === 'in' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="Lot number (new lot)"><input className="form-control" value={stock.lotNumber} onChange={e => setStock(s => ({ ...s, lotNumber: e.target.value }))} /></Field>
              <Field label="Expiry (new lot)"><input className="form-control" type="date" value={stock.expiryDate} onChange={e => setStock(s => ({ ...s, expiryDate: e.target.value }))} /></Field>
            </div>
          )}
          <Field label="Reason / note"><input className="form-control" value={stock.reason} onChange={e => setStock(s => ({ ...s, reason: e.target.value }))} placeholder={stock.type === 'in' ? 'Purchase / restock' : stock.type === 'out' ? 'Usage / wastage' : 'Correction'} /></Field>
          {msg && <div style={{ marginTop: '10px', color: 'var(--rose-hover)', fontSize: '13px' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn btn-primary" disabled={busy} onClick={submitStock}>{busy ? 'Saving…' : 'Record Movement'}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setStockFor(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <div style={{ marginBottom: '6px' }}><label className="form-label">{label}</label>{children}</div>;
}
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-primary, #fff)', borderRadius: 'var(--radius-lg, 14px)', width: 'min(680px, 100%)', maxHeight: '85vh', overflowY: 'auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '16px' }}>{title}</h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Ledger ── */
function Ledger() {
  const [txns, setTxns] = useState([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      const d = await fetch(`/api/lab/inventory/txns?${params.toString()}`).then(r => r.ok ? r.json() : { txns: [] });
      setTxns(d.txns || []);
    } finally { setLoading(false); }
  }, [type]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const badge = (t) => ({ in: 'badge-emerald', out: 'badge-amber', consume: 'badge-sky', adjust: 'badge-secondary' })[t] || 'badge-secondary';

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <select className="form-control" style={{ maxWidth: '180px' }} value={type} onChange={e => setType(e.target.value)}>
          <option value="">All movements</option>
          <option value="in">Stock In</option><option value="out">Stock Out</option><option value="consume">Auto-consume</option><option value="adjust">Adjust</option>
        </select>
      </div>
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : (
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Time</th><th>Item</th><th>Type</th><th>Change</th><th>Balance</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {txns.length === 0 ? <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No movements.</td></tr>
                : txns.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(t.created_at)}</td>
                    <td style={{ fontWeight: 600 }}>{t.item_name || '—'}</td>
                    <td><span className={`badge ${badge(t.type)}`}>{t.type}</span></td>
                    <td style={{ fontWeight: 700, color: Number(t.change_qty) >= 0 ? 'var(--emerald-hover, #047857)' : 'var(--rose-hover)' }}>{Number(t.change_qty) > 0 ? '+' : ''}{Number(t.change_qty)}</td>
                    <td>{t.balance_after != null ? Number(t.balance_after) : '—'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.reason || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{t.performed_by || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Reports ── */
function Reports() {
  const { currency } = useClinic();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/lab/inventory/reports')
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  if (!data) return <p style={{ color: 'var(--text-muted)' }}>No data.</p>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[['Stock Value', `${currency}${(data.totals.stockValue || 0).toLocaleString()}`], ['Total In', data.movement.totalIn], ['Total Out', data.movement.totalOut], ['Movements', data.movement.movements]].map(([l, v]) => (
          <div key={l} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>{v}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>By Category</h3>
          <div className="table-responsive"><table className="data-table"><thead><tr><th>Category</th><th>Items</th><th>Value</th></tr></thead>
            <tbody>{(data.byCategory || []).map((c, i) => <tr key={i}><td>{c.category}</td><td>{c.items}</td><td>{currency}{c.stockValue.toLocaleString()}</td></tr>)}</tbody></table></div>
        </div>
        <div>
          <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>Top Consumed</h3>
          <div className="table-responsive"><table className="data-table"><thead><tr><th>Item</th><th>Consumed</th></tr></thead>
            <tbody>{(data.topConsumed || []).length === 0 ? <tr><td colSpan={2} style={{ color: 'var(--text-muted)' }}>No consumption yet.</td></tr>
              : data.topConsumed.map((r, i) => <tr key={i}><td>{r.item_name}</td><td>{r.consumed} {r.unit}</td></tr>)}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
