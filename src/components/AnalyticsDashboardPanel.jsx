"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useClinic } from '../context/ClinicContext';

const PALETTE = ['#4f46e5', '#0ea5e9', '#059669', '#d97706', '#e11d48', '#7c3aed', '#0d9488', '#db2777'];

function fmtTat(min) {
  if (!min) return '—';
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}

// Compact inline icon set for the KPI cards.
const ICON = {
  patients: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  samples: <path d="M14 2v14a4 4 0 0 1-8 0V2M5 2h10M6 9h7" />,
  revenue: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  rejected: <><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>,
  critical: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  tat: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  utilization: <path d="M3 3v18h18M7 15l3-3 3 3 5-5" />,
  pending: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15l2 2 4-4" /></>,
  growth: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>,
};

function KpiCard({ icon, label, value, accent, sub }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg, 14px)', padding: '16px', background: '#fff', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <span style={{ width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0, background: `${accent}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICON[icon]}</svg>
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
        {sub != null && <div style={{ fontSize: '11px', color: accent, fontWeight: 700, marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  );
}

function ChartCard({ title, children, height = 280 }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg, 14px)', padding: '16px', background: '#fff' }}>
      <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', margin: '0 0 12px', color: 'var(--text-primary)' }}>{title}</h3>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AnalyticsDashboardPanel() {
  const { currency } = useClinic();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const dashRef = useRef(null);
  const debounce = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/analytics');
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setData(d); setUpdatedAt(new Date()); setError('');
    } catch {
      setError('Could not load analytics. Sign in with an authorised role.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Real-time: refetch (debounced) on any lab event, plus a 60s safety refresh.
    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onmessage = () => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(load, 1500);
      };
    } catch { /* SSE unavailable */ }
    const poll = setInterval(load, 60000);
    return () => { if (es) es.close(); if (debounce.current) clearTimeout(debounce.current); clearInterval(poll); };
  }, [load]);

  const money = (v) => `${currency}${Number(v || 0).toLocaleString()}`;

  const exportCsv = () => {
    if (!data) return;
    const lines = [];
    const k = data.kpis;
    lines.push('RK Clinic — Laboratory Analytics');
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push('');
    lines.push('Metric,Value');
    lines.push(`Daily Patients,${k.dailyPatients}`);
    lines.push(`Daily Samples,${k.dailySamples}`);
    lines.push(`Daily Revenue,${k.dailyRevenue}`);
    lines.push(`Rejected Samples,${k.rejectedSamples}`);
    lines.push(`Critical Results,${k.criticalResults}`);
    lines.push(`Avg Turnaround (min),${k.avgTatMinutes}`);
    lines.push(`Analyzer Utilization %,${k.analyzerUtilizationPct}`);
    lines.push(`Pending Verification,${k.pendingVerification}`);
    lines.push(`Monthly Growth %,${k.monthlyGrowthPct}`);
    lines.push('');
    lines.push('Date,Patients,Samples,Revenue');
    for (const r of data.dailySeries) lines.push(`${r.date},${r.patients},${r.samples},${r.revenue}`);
    lines.push('');
    lines.push('Top Test,Orders');
    for (const t of data.topTests) lines.push(`${String(t.name).replace(/,/g, ' ')},${t.count}`);
    lines.push('');
    lines.push('Month,Orders,Revenue');
    for (const m of data.monthlyGrowth) lines.push(`${m.month},${m.orders},${m.revenue}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lab-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPdf = async () => {
    if (!dashRef.current) return;
    setBusy(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const canvas = await html2canvas(dashRef.current, { scale: 2, backgroundColor: '#f8fafc', useCORS: true });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;
      let pos = 0; let remaining = imgH;
      pdf.addImage(img, 'PNG', 0, pos, pw, imgH); remaining -= ph;
      while (remaining > 0) { pdf.addPage(); pos -= ph; pdf.addImage(img, 'PNG', 0, pos, pw, imgH); remaining -= ph; }
      pdf.save(`lab-analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  if (loading) return <div className="panel-card col-12" style={{ padding: '26px', color: 'var(--text-muted)' }}>Loading analytics…</div>;
  if (error) return <div className="panel-card col-12" style={{ padding: '26px', color: 'var(--rose-hover)' }}>{error}</div>;

  const k = data.kpis;

  return (
    <div className="panel-card col-12" style={{ padding: '26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontSize: '22px' }}>Laboratory Analytics</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Live operational metrics{updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ''}
            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#059669', marginLeft: '8px' }} title="Live" />
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={exportPdf}>{busy ? 'Exporting…' : 'Export PDF'}</button>
        </div>
      </div>

      <div ref={dashRef} style={{ background: '#f8fafc', padding: '4px' }}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          <KpiCard icon="patients" label="Daily Patients" value={k.dailyPatients} accent={PALETTE[0]} />
          <KpiCard icon="samples" label="Samples Today" value={k.dailySamples} accent={PALETTE[1]} />
          <KpiCard icon="revenue" label="Revenue Today" value={money(k.dailyRevenue)} accent={PALETTE[2]} />
          <KpiCard icon="rejected" label="Rejected Samples" value={k.rejectedSamples} accent={PALETTE[4]} />
          <KpiCard icon="critical" label="Critical Results" value={k.criticalResults} accent={PALETTE[4]} />
          <KpiCard icon="tat" label="Avg Turnaround" value={fmtTat(k.avgTatMinutes)} accent={PALETTE[6]} />
          <KpiCard icon="utilization" label="Analyzer Utilization" value={`${k.analyzerUtilizationPct}%`} accent={PALETTE[5]} sub={`${k.activeAnalyzers}/${k.totalAnalyzers} online`} />
          <KpiCard icon="pending" label="Pending Verification" value={k.pendingVerification} accent={PALETTE[3]} />
          <KpiCard icon="growth" label="Monthly Growth" value={`${k.monthlyGrowthPct >= 0 ? '+' : ''}${k.monthlyGrowthPct}%`} accent={k.monthlyGrowthPct >= 0 ? PALETTE[2] : PALETTE[4]} />
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
          <ChartCard title="Daily Activity (14 days)">
            <AreaChart data={data.dailySeries} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gSamples" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PALETTE[1]} stopOpacity={0.35} /><stop offset="95%" stopColor={PALETTE[1]} stopOpacity={0} /></linearGradient>
                <linearGradient id="gPatients" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PALETTE[0]} stopOpacity={0.3} /><stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="samples" stroke={PALETTE[1]} fill="url(#gSamples)" strokeWidth={2} name="Samples" />
              <Area type="monotone" dataKey="patients" stroke={PALETTE[0]} fill="url(#gPatients)" strokeWidth={2} name="Patients" />
            </AreaChart>
          </ChartCard>

          <ChartCard title="Daily Revenue (14 days)">
            <AreaChart data={data.dailySeries} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <defs><linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PALETTE[2]} stopOpacity={0.35} /><stop offset="95%" stopColor={PALETTE[2]} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Area type="monotone" dataKey="revenue" stroke={PALETTE[2]} fill="url(#gRev)" strokeWidth={2} name="Revenue" />
            </AreaChart>
          </ChartCard>

          <ChartCard title="Top Ordered Tests (30 days)">
            <BarChart data={data.topTests} layout="vertical" margin={{ top: 4, right: 16, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip />
              <Bar dataKey="count" fill={PALETTE[0]} radius={[0, 4, 4, 0]} name="Orders" />
            </BarChart>
          </ChartCard>

          <ChartCard title="Analyzer Utilization (tests today)">
            <BarChart data={data.analyzerUtilization} margin={{ top: 4, right: 10, left: -10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="analyzer" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} height={50} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="tests" radius={[4, 4, 0, 0]} name="Tests">
                {data.analyzerUtilization.map((a, i) => (
                  <Cell key={i} fill={a.status === 'active' ? PALETTE[2] : a.status === 'online' ? PALETTE[1] : '#cbd5e1'} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>

          <ChartCard title="Monthly Growth (12 months)">
            <LineChart data={data.monthlyGrowth} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis yAxisId="l" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line yAxisId="l" type="monotone" dataKey="orders" stroke={PALETTE[0]} strokeWidth={2} dot={false} name="Orders" />
              <Line yAxisId="r" type="monotone" dataKey="revenue" stroke={PALETTE[2]} strokeWidth={2} dot={false} name="Revenue" />
            </LineChart>
          </ChartCard>

          <ChartCard title="Sample Rejections (90 days)">
            {data.rejectionBreakdown.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No sample rejections recorded.</div>
            ) : (
              <PieChart>
                <Pie data={data.rejectionBreakdown} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={90} label={(e) => e.reason}>
                  {data.rejectionBreakdown.map((r, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
