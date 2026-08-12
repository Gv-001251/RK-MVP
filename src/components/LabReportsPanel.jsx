"use client";

import React, { useState, useEffect, useCallback } from 'react';
import ReportViewer from './ReportViewer';

const MANAGE_ROLES = ['technician', 'senior_technician', 'pathologist', 'admin'];

function fmt(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }

export default function LabReportsPanel() {
  const [tab, setTab] = useState('generate');
  const [role, setRole] = useState('');
  const [origin, setOrigin] = useState('');
  const canManage = MANAGE_ROLES.includes(role);

  const [orders, setOrders] = useState([]);
  const [reports, setReports] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openOrderId, setOpenOrderId] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => setRole(d?.profile?.role || d?.user?.role || '')).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (q) params.set('q', q);
      if (tab === 'history') {
        const d = await fetch(`/api/lab/reports?${params.toString()}`).then(r => r.ok ? r.json() : { reports: [] });
        setReports(d.reports || []);
      } else {
        const d = await fetch(`/api/lab/verifications?${params.toString()}`).then(r => r.ok ? r.json() : { verifications: [] });
        setOrders(d.verifications || []);
      }
    } finally { setLoading(false); }
  }, [tab, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Laboratory Reports</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Generate branded PDF reports with barcode, QR verification, reference ranges, abnormal/critical flags and electronic signature.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[['generate', 'Generate'], ['history', 'Report History']].map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <input className="form-control" style={{ maxWidth: '260px' }} placeholder="Search patient / accession / order…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadList()} />
          <button className="btn btn-primary btn-sm" onClick={loadList}>Search</button>
        </div>
      </div>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        : tab === 'history' ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Report No</th><th>Patient</th><th>Accession</th><th>Status</th><th>Tests</th><th>Generated</th><th style={{ textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {reports.length === 0 ? <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No reports generated yet.</td></tr>
                  : reports.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.report_no}</td>
                      <td style={{ fontWeight: 600 }}>{r.patient_name || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.accession_number || '—'}</td>
                      <td><span className={`badge ${r.status === 'Released' ? 'badge-emerald' : r.status === 'Amended' ? 'badge-rose' : 'badge-amber'}`}>{r.status}</span></td>
                      <td>{r.test_count}{r.critical_count ? <span className="badge badge-rose" style={{ marginLeft: '6px' }}>{r.critical_count} crit</span> : null}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(r.generated_at)}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-sm" onClick={() => setOpenOrderId(r.lab_order_id)}>Open</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Patient</th><th>Accession</th><th>Priority</th><th>Verification</th><th>Results</th><th style={{ textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {orders.length === 0 ? <tr><td colSpan={6} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No orders with results found.</td></tr>
                  : orders.map(o => (
                    <tr key={o.lab_order_id}>
                      <td><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{o.patient_name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{o.patient_id}</div></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{o.accession_number || o.lab_order_id}</td>
                      <td><span className={`badge ${o.priority === 'STAT' ? 'badge-rose' : o.priority === 'Urgent' ? 'badge-amber' : 'badge-sky'}`}>{o.priority}</span></td>
                      <td><span className="badge badge-secondary">{o.status}</span></td>
                      <td>{o.result_count}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-primary btn-sm" onClick={() => setOpenOrderId(o.lab_order_id)}>Open Report</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

      {openOrderId && (
        <ReportViewer orderId={openOrderId} canManage={canManage} verifyBaseUrl={origin} onClose={() => setOpenOrderId(null)} />
      )}
    </div>
  );
}
