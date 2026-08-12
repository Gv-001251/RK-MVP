"use client";

import React from 'react';

const FLAG_COLOR = { '': '#059669', H: '#e11d48', L: '#d97706' };

function parseRange(ref) {
  if (!ref) return null;
  const m = String(ref).replace(/[–—]/g, '-').match(/^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const low = parseFloat(m[1]); const high = parseFloat(m[2]);
  return Number.isNaN(low) || Number.isNaN(high) ? null : { low, high };
}
function d(v) { if (!v) return ''; const dt = new Date(v); return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString(); }

/**
 * Trend line chart for a single analyte over time (pure SVG).
 * props: testName, unit, referenceRange, points [{ value, at, flag }] (oldest first)
 */
export default function TrendChart({ testName, unit, referenceRange, points = [] }) {
  const W = 720, H = 240, padL = 48, padR = 14, padT = 14, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (!points.length) return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No data points for {testName}.</div>;

  const range = parseRange(referenceRange);
  const vals = points.map(p => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (range) { min = Math.min(min, range.low); max = Math.max(max, range.high); }
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const yOf = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;
  const xOf = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');

  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{testName}</strong>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{unit || ''}{referenceRange ? ` · Ref ${referenceRange}` : ''}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: '480px', fontFamily: 'var(--font-body, sans-serif)' }} role="img" aria-label={`${testName} trend`}>
          {/* reference band */}
          {range && (
            <rect x={padL} y={yOf(range.high)} width={plotW} height={Math.max(0, yOf(range.low) - yOf(range.high))} fill="rgba(5,150,105,0.10)" />
          )}
          {range && [range.low, range.high].map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="#059669" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
              <text x={6} y={yOf(v) + 3} fontSize="9" fill="var(--text-muted)">{v}</text>
            </g>
          ))}
          {/* min/max y labels */}
          <text x={6} y={yOf(min) - 2} fontSize="9" fill="var(--text-muted)">{min.toFixed(1)}</text>
          <text x={6} y={yOf(max) + 8} fontSize="9" fill="var(--text-muted)">{max.toFixed(1)}</text>

          <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="1.6" opacity="0.75" />

          {points.map((p, i) => (
            <g key={i}>
              <circle cx={xOf(i)} cy={yOf(p.value)} r={p.flag ? 5 : 4} fill={FLAG_COLOR[p.flag] || '#64748b'} stroke="#fff" strokeWidth="1.5">
                <title>{`${p.value}${unit ? ' ' + unit : ''}${p.flag ? ` (${p.flag === 'H' ? 'High' : 'Low'})` : ''} · ${d(p.at)}`}</title>
              </circle>
              {(i === 0 || i === points.length - 1 || points.length <= 8) && (
                <text x={xOf(i)} y={H - 8} fontSize="8.5" fill="var(--text-muted)" textAnchor="middle">{d(p.at)}</text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
