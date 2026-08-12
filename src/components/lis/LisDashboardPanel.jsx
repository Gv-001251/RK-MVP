"use client";

/**
 * Laboratory dashboard.
 *
 * Replaces the previous mixed hospital dashboard (bed occupancy, pharmacy
 * stock, collections) with laboratory measures only, laid out to match the
 * reference design: a row of headline cards, a monthly volume chart beside a
 * workload gauge, then the live order table.
 *
 * Every number is read from the API — `/api/lab/analytics` for aggregates and
 * `/api/lab/orders` for the live queue. Nothing here is hard-coded.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Ellipsis, Timer } from 'lucide-react';

/**
 * Order statuses grouped into the four stages the lab actually tracks.
 * The status strings mirror the lifecycle the API writes:
 * Ordered → Barcode Printed → Sample Collected → Received → Sample Registered
 * → Processing → Analyzer Running → Pending Verification → Technician Review
 * → Senior Review → Verified → Released → Reported/Delivered.
 */
const STAGES = [
  { id: 'awaiting', label: 'Awaiting collection', colour: '#8ea2e8', statuses: ['Ordered', 'Barcode Printed', 'Sample Registered'] },
  { id: 'progress', label: 'On the bench', colour: '#b9c7f0', statuses: ['Sample Collected', 'Received', 'Processing', 'Analyzer Running'] },
  { id: 'review', label: 'Awaiting verification', colour: '#f4b6c8', statuses: ['Pending Verification', 'Technician Review', 'Senior Review'] },
  { id: 'released', label: 'Released', colour: '#5c7cf5', statuses: ['Verified', 'Released', 'Reported', 'Delivered', 'Completed'] },
];

/** Terminal states that are not a completed result. */
const DEAD_END = new Set(['Cancelled', 'Rejected']);

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const stageOf = (status) =>
  STAGES.find((stage) => stage.statuses.includes(status))?.id || 'progress';

/** 165 -> "2h 45m", 48 -> "48m", 0 -> "--" */
function formatMinutes(total) {
  const value = Number(total) || 0;
  if (value <= 0) return '--';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function isToday(value) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function statusBadge(status) {
  if (status === 'Rejected') return 'badge-rose';
  if (status === 'Cancelled') return 'badge-secondary';
  if (STAGES[3].statuses.includes(status)) return 'badge-emerald';
  if (STAGES[2].statuses.includes(status)) return 'badge-amber';
  if (STAGES[0].statuses.includes(status)) return 'badge-sky';
  return 'badge-indigo';
}

function dateLabel(value) {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function timeLabel(value) {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function initials(name) {
  if (!name) return '??';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Monthly volume chart
 * ------------------------------------------------------------------ */

function VolumeChart({ series, metric }) {
  const currentMonth = new Date().getMonth();
  const [hovered, setHovered] = useState(null);

  // Normalise the API's `YYYY-MM` rows onto a fixed Jan–Dec axis so the chart
  // keeps a stable shape even when months are missing.
  const bars = useMemo(() => {
    const byMonth = new Map(
      (series || []).map((row) => [Number(String(row.month).slice(5, 7)) - 1, row])
    );
    return MONTH_ABBR.map((label, index) => {
      const row = byMonth.get(index);
      return {
        label,
        index,
        value: Number(row?.[metric]) || 0,
      };
    });
  }, [series, metric]);

  const peak = Math.max(...bars.map((b) => b.value), 1);
  const active = hovered ?? currentMonth;

  const chartHeight = 168;
  const barWidth = 26;
  const gap = 12;
  const width = bars.length * barWidth + (bars.length - 1) * gap;

  return (
    <div className="lis-chart">
      <svg
        viewBox={`0 0 ${width} ${chartHeight + 26}`}
        className="lis-chart-svg"
        role="img"
        aria-label={`Monthly ${metric} for the last twelve months`}
      >
        {bars.map((bar) => {
          const x = bar.index * (barWidth + gap);
          const height = Math.max(Math.round((bar.value / peak) * chartHeight), 4);
          const y = chartHeight - height;
          const isActive = bar.index === active;

          return (
            <g key={bar.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={barWidth / 2}
                fill={isActive ? '#17181c' : '#c2cff2'}
                onMouseEnter={() => setHovered(bar.index)}
                onMouseLeave={() => setHovered(null)}
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 18}
                textAnchor="middle"
                className={`lis-chart-label${isActive ? ' is-active' : ''}`}
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="lis-chart-readout" aria-live="polite">
        <span className="lis-chart-readout-value">
          {bars[active]?.value.toLocaleString() ?? 0}
        </span>
        <span className="lis-chart-readout-unit">
          {metric === 'revenue' ? 'billed' : 'orders'} in {MONTH_ABBR[active]}
        </span>
      </p>

      <p className="lis-chart-legend">
        <span className="lis-legend-dot" style={{ background: '#5c7cf5' }} aria-hidden="true" />
        {metric === 'revenue' ? 'Billed value' : 'Orders received'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Workload gauge
 * ------------------------------------------------------------------ */

function WorkloadGauge({ segments, total }) {
  const cx = 110;
  const cy = 104;
  const r = 84;
  const arcLength = Math.PI * r;
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  let consumed = 0;

  return (
    <div className="lis-gauge">
      <svg viewBox="0 0 220 128" className="lis-gauge-svg" role="img"
        aria-label={`Today's workload: ${total} specimens`}>
        <path d={track} className="lis-gauge-track" strokeWidth="15" strokeLinecap="round" />
        {total > 0 && segments.map((segment) => {
          const length = (segment.value / total) * arcLength;
          const offset = consumed;
          consumed += length;
          if (length <= 0) return null;
          return (
            <path
              key={segment.id}
              d={track}
              stroke={segment.colour}
              strokeWidth="15"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${Math.max(length - 3, 1)} ${arcLength}`}
              strokeDashoffset={-offset}
            />
          );
        })}
        <text x={cx} y={cy - 26} textAnchor="middle" className="lis-gauge-value">{total}</text>
        <text x={cx} y={cy - 8} textAnchor="middle" className="lis-gauge-caption">Specimens today</text>
      </svg>

      <ul className="lis-gauge-legend">
        {segments.map((segment) => (
          <li key={segment.id}>
            <span className="lis-legend-dot" style={{ background: segment.colour }} aria-hidden="true" />
            <span className="lis-gauge-legend-value">{segment.value}</span>
            <span className="lis-gauge-legend-label">{segment.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export default function LisDashboardPanel({ onNavigateToTab }) {
  const [analytics, setAnalytics] = useState(null);
  const [orders, setOrders] = useState([]);
  const [metric, setMetric] = useState('orders');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Bumped by "Try again"; the effect below re-runs on change.
  const [reloadToken, setReloadToken] = useState(0);

  // Nothing is set before the first await, so a refresh costs one render pass
  // rather than cascading through the effect.
  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        const [analyticsRes, ordersRes] = await Promise.all([
          fetch('/api/lab/analytics'),
          fetch('/api/lab/orders?limit=100'),
        ]);
        if (!analyticsRes.ok) throw new Error('Unable to load laboratory analytics');
        if (!ordersRes.ok) throw new Error('Unable to load the order queue');

        const analyticsData = await analyticsRes.json();
        const ordersData = await ordersRes.json();
        if (cancelled) return;
        setAnalytics(analyticsData);
        setOrders(Array.isArray(ordersData.labOrders) ? ordersData.labOrders : []);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Unable to load the dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDashboard();
    return () => { cancelled = true; };
  }, [reloadToken]);

  const retry = () => {
    setLoading(true);
    setError('');
    setReloadToken((token) => token + 1);
  };

  const kpis = analytics?.kpis || {};

  const todaysOrders = useMemo(
    () => orders.filter((o) => isToday(o.created_at || o.order_time)),
    [orders]
  );

  const stageCounts = useMemo(() => {
    const counts = { awaiting: 0, progress: 0, review: 0, released: 0 };
    for (const order of todaysOrders) {
      if (DEAD_END.has(order.status)) continue;
      counts[stageOf(order.status)] += 1;
    }
    return counts;
  }, [todaysOrders]);

  const gaugeSegments = STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    colour: stage.colour,
    value: stageCounts[stage.id],
  }));

  const gaugeTotal = gaugeSegments.reduce((sum, s) => sum + s.value, 0);

  const released = stageCounts.released;
  const inLab = gaugeTotal - released;
  const releasedShare = gaugeTotal ? (released / gaugeTotal) * 100 : 0;

  const growth = Number(kpis.monthlyGrowthPct) || 0;
  const recent = orders.slice(0, 6);

  if (loading) {
    return (
      <div className="panel-card col-12 lis-state-card">
        <p>Loading laboratory dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-card col-12 lis-state-card">
        <p className="lis-state-error">{error}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Try again</button>
      </div>
    );
  }

  return (
    <div className="lis-dashboard">
      {/* ── Headline cards ─────────────────────────────────────────── */}
      <div className="lis-kpi-row">
        <article className="lis-card lis-kpi">
          <header className="lis-card-head">
            <h2 className="lis-card-title">Average turnaround</h2>
            <button
              type="button"
              className="lis-card-action"
              aria-label="Open analytics"
              onClick={() => onNavigateToTab?.('analytics')}
            >
              <ArrowUpRight aria-hidden="true" size={15} strokeWidth={2.2} />
            </button>
          </header>
          <p className="lis-kpi-value">
            {formatMinutes(kpis.avgTatMinutes)}
            <span className="lis-kpi-unit">
              <Timer aria-hidden="true" size={12} strokeWidth={2.4} /> 30d
            </span>
          </p>
          <p className="lis-kpi-foot">Order received to report released</p>
        </article>

        <article className="lis-card lis-kpi">
          <header className="lis-card-head">
            <h2 className="lis-card-title">Specimens today</h2>
            <button
              type="button"
              className="lis-card-action"
              aria-label="Open specimen tracking"
              onClick={() => onNavigateToTab?.('specimen_tracking')}
            >
              <Ellipsis aria-hidden="true" size={15} strokeWidth={2.2} />
            </button>
          </header>

          <p className="lis-kpi-value">
            {Number(kpis.dailySamples) || 0}
            <span className={`lis-kpi-delta${growth < 0 ? ' is-down' : ''}`}>
              {growth >= 0 ? '+' : ''}{growth}%
              <span className="lis-kpi-delta-note">vs last month</span>
            </span>
          </p>

          <div
            className="lis-split-bar"
            role="img"
            aria-label={`${released} released, ${inLab} still in the laboratory`}
          >
            <span style={{ width: `${releasedShare}%`, background: '#5c7cf5' }} />
            <span style={{ width: `${100 - releasedShare}%`, background: '#f4b6c8' }} />
          </div>

          <p className="lis-split-legend">
            <span><span className="lis-legend-dot" style={{ background: '#5c7cf5' }} aria-hidden="true" />{released} released</span>
            <span><span className="lis-legend-dot" style={{ background: '#f4b6c8' }} aria-hidden="true" />{inLab} in the lab</span>
          </p>
        </article>

        <article className="lis-card lis-kpi">
          <header className="lis-card-head">
            <h2 className="lis-card-title">Analyzer availability</h2>
            <button
              type="button"
              className="lis-card-action"
              aria-label="Open analyzer management"
              onClick={() => onNavigateToTab?.('analyzer_mgmt')}
            >
              <ArrowUpRight aria-hidden="true" size={15} strokeWidth={2.2} />
            </button>
          </header>
          <p className="lis-kpi-value is-accent">
            {Number(kpis.analyzerUtilizationPct) || 0}%
            <span className="lis-kpi-pill">
              {Number(kpis.activeAnalyzers) || 0} of {Number(kpis.totalAnalyzers) || 0} online
            </span>
          </p>
          <p className="lis-kpi-foot">
            {Number(kpis.criticalResults) || 0} critical result{Number(kpis.criticalResults) === 1 ? '' : 's'} flagged today
          </p>
        </article>
      </div>

      {/* ── Volume chart + workload gauge ──────────────────────────── */}
      <div className="lis-chart-row">
        <article className="lis-card">
          <header className="lis-card-head">
            <h2 className="lis-card-title is-lg">Specimen volume</h2>
            <label className="lis-select">
              <span className="sr-only">Chart measure</span>
              <select value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="orders">Orders</option>
                <option value="revenue">Billed value</option>
              </select>
            </label>
          </header>
          <VolumeChart series={analytics?.monthlyGrowth} metric={metric} />
        </article>

        <article className="lis-card">
          <header className="lis-card-head">
            <h2 className="lis-card-title is-lg">Workload</h2>
            <span className="lis-card-tag">Today</span>
          </header>
          {gaugeTotal === 0 ? (
            <p className="lis-card-empty">No specimens registered yet today.</p>
          ) : (
            <WorkloadGauge segments={gaugeSegments} total={gaugeTotal} />
          )}
        </article>
      </div>

      {/* ── Live order queue ───────────────────────────────────────── */}
      <article className="lis-card">
        <header className="lis-card-head">
          <h2 className="lis-card-title is-lg">Recent orders</h2>
          <button
            type="button"
            className="lis-text-btn"
            onClick={() => onNavigateToTab?.('specimen_tracking')}
          >
            View all
            <ArrowUpRight aria-hidden="true" size={13} strokeWidth={2.4} />
          </button>
        </header>

        {recent.length === 0 ? (
          <p className="lis-card-empty">No laboratory orders recorded yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table lis-table">
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Accession</th>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                  <th scope="col">Time</th>
                  <th scope="col">Report</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => {
                  const releasedRow = STAGES[3].statuses.includes(order.status);
                  return (
                    <tr key={order.id}>
                      <td>
                        <span className="lis-person">
                          <span className="lis-person-avatar" aria-hidden="true">{initials(order.patient_name)}</span>
                          <span className="lis-person-name">{order.patient_name || order.patient_id}</span>
                        </span>
                      </td>
                      <td className="lis-mono">{order.accession_number || order.id}</td>
                      <td><span className={`badge ${statusBadge(order.status)}`}>{order.status}</span></td>
                      <td>{dateLabel(order.created_at || order.order_time)}</td>
                      <td>{timeLabel(order.order_time || order.created_at)}</td>
                      <td>
                        <span className={`lis-report-state${releasedRow ? ' is-ready' : ''}`}>
                          {releasedRow
                            ? <Check aria-hidden="true" size={13} strokeWidth={3} />
                            : <span className="lis-report-dot" aria-hidden="true" />}
                          {releasedRow ? 'Released' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}
