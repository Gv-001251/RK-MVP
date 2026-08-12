"use client";

import React from 'react';

const STATUS_COLOR = { Pass: '#059669', Warning: '#d97706', Reject: '#e11d48' };

/**
 * Levey-Jennings chart (pure SVG, no chart lib).
 * Plots QC points against the target mean and ±1/2/3 SD control limits.
 *
 * props: points [{ value, z, status, runAt }] (oldest first), mean, sd, unit
 */
export default function LeveyJenningsChart({ points = [], mean, sd, unit }) {
  const W = 720, H = 320, padL = 54, padR = 16, padT = 16, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (mean == null || sd == null || !sd) {
    return <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No target mean/SD available for this control.</div>;
  }
  if (!points.length) {
    return <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No QC results yet for this control.</div>;
  }

  // Y axis spans mean ± 4SD so 3SD outliers stay on-chart.
  const yMin = mean - 4 * sd;
  const yMax = mean + 4 * sd;
  const yOf = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const xOf = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);

  const sdLines = [
    { k: 3, color: '#e11d48', label: '+3SD' },
    { k: 2, color: '#d97706', label: '+2SD' },
    { k: 1, color: '#cbd5e1', label: '+1SD' },
    { k: 0, color: '#0f172a', label: 'Mean' },
    { k: -1, color: '#cbd5e1', label: '-1SD' },
    { k: -2, color: '#d97706', label: '-2SD' },
    { k: -3, color: '#e11d48', label: '-3SD' },
  ];

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: '520px', fontFamily: 'var(--font-body, sans-serif)' }} role="img" aria-label="Levey-Jennings chart">
        {sdLines.map(({ k, color, label }) => {
          const y = yOf(mean + k * sd);
          return (
            <g key={label}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={color} strokeWidth={k === 0 ? 1.5 : 1} strokeDasharray={k === 0 ? '' : '4 3'} opacity={k === 0 ? 0.9 : 0.6} />
              <text x={6} y={y + 3} fontSize="10" fill="var(--text-muted)">{label}</text>
              <text x={W - padR} y={y - 3} fontSize="9" fill="var(--text-muted)" textAnchor="end">{(mean + k * sd).toFixed(2)}</text>
            </g>
          );
        })}

        {/* connecting line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="1.5" opacity="0.7" />

        {/* points */}
        {points.map((p, i) => {
          const cx = xOf(i), cy = yOf(p.value);
          const color = STATUS_COLOR[p.status] || '#64748b';
          return (
            <g key={p.id || i}>
              <circle cx={cx} cy={cy} r={p.status === 'Reject' ? 5 : 4} fill={color} stroke="#fff" strokeWidth="1.5">
                <title>{`${p.value}${unit ? ' ' + unit : ''} (z=${p.z != null ? p.z.toFixed(2) : '—'}) ${p.status}${p.flags?.length ? ' · ' + p.flags.join(',') : ''}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', paddingLeft: `${padL}px` }}>
        <span>Mean <strong>{mean}</strong>{unit ? ` ${unit}` : ''}</span>
        <span>SD <strong>{sd}</strong></span>
        <span style={{ color: STATUS_COLOR.Pass }}>● Pass</span>
        <span style={{ color: STATUS_COLOR.Warning }}>● Warning</span>
        <span style={{ color: STATUS_COLOR.Reject }}>● Reject</span>
        <span>n = {points.length}</span>
      </div>
    </div>
  );
}
