"use client";

/**
 * Maglumi 800 Control Panel
 * 
 * Dedicated interface for the Snibe Maglumi 800 CLIA immunoassay analyzer.
 * Mirrors the operation software layout from the instrument manual:
 * - System status bar (connection, mode, temperature)
 * - Reagent area (9 on-board reagents with RFID data)
 * - Sample area (40 positions with barcode recognition)
 * - Incubator (13 slots, 78 tests at once, 36.8C)
 * - Real-time test monitoring
 * - Result history
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Constants matching the Maglumi 800 hardware spec                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

const REAGENT_SLOTS = 9;
const SAMPLE_POSITIONS = 40;
const INCUBATOR_SLOTS = 13;
const TESTS_PER_SLOT = 6;
const MAX_CONCURRENT_TESTS = INCUBATOR_SLOTS * TESTS_PER_SLOT; // 78
const TARGET_TEMP = 36.8;
const THROUGHPUT = 180; // tests/hour
const FIRST_RESULT_MIN = 17; // minutes

const STATUS_COLORS = {
  active: '#059669',
  online: '#0284c7',
  offline: '#e11d48',
  idle: '#94a3b8',
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Helper components                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function StatusDot({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
  return (
    <span style={{
      width: 10, height: 10, borderRadius: '50%', background: color,
      display: 'inline-block', boxShadow: `0 0 6px ${color}60`,
    }} />
  );
}

function SectionHeader({ title, subtitle, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h3>
        {subtitle && <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, unit, color }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary, #f8fafc)',
      border: '1px solid var(--border-color, #e2e8f0)', minWidth: 100, textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text-primary)' }}>
        {value}<span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Reagent Slot                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ReagentSlot({ slot, data }) {
  const isEmpty = !data || !data.testName;
  const isLow = data?.remainingTests <= 10;
  const isExpired = data?.expiryDate && new Date(data.expiryDate) < new Date();

  const bg = isEmpty ? 'var(--bg-secondary, #f1f5f9)'
    : isExpired ? '#fef2f2'
    : isLow ? '#fffbeb'
    : '#f0fdf4';

  const border = isEmpty ? 'var(--border-color, #e2e8f0)'
    : isExpired ? '#fecaca'
    : isLow ? '#fde68a'
    : '#bbf7d0';

  return (
    <div style={{
      border: `1.5px solid ${border}`, borderRadius: 10, padding: '10px 12px',
      background: bg, minHeight: 90, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', background: 'rgba(0,0,0,0.05)', borderRadius: 4, padding: '1px 5px' }}>
          R{slot}
        </span>
        {!isEmpty && (
          <span style={{ fontSize: 9, fontWeight: 700, color: isExpired ? '#dc2626' : isLow ? '#d97706' : '#16a34a', textTransform: 'uppercase' }}>
            {isExpired ? 'EXPIRED' : isLow ? 'LOW' : 'OK'}
          </span>
        )}
      </div>
      {isEmpty ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 'auto' }}>Empty</div>
      ) : (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{data.testName}</div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
            Lot: {data.lotNumber || '—'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {data.remainingTests ?? '—'} tests
            </span>
            <span style={{ fontSize: 10, color: isExpired ? '#dc2626' : 'var(--text-muted)' }}>
              {data.expiryDate ? new Date(data.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Sample Position                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SamplePosition({ pos, data }) {
  const isEmpty = !data || !data.barcode;
  const statusColor = data?.status === 'running' ? '#059669'
    : data?.status === 'queued' ? '#0284c7'
    : data?.status === 'complete' ? '#6b7280'
    : 'transparent';

  return (
    <div
      title={data?.barcode ? `${data.barcode}\n${data.patientName || ''}\n${data.tests?.join(', ') || ''}` : `Position ${pos} — Empty`}
      style={{
        width: 32, height: 32, borderRadius: 6,
        border: `1.5px solid ${isEmpty ? 'var(--border-color, #e2e8f0)' : statusColor}`,
        background: isEmpty ? 'var(--bg-secondary, #f8fafc)' : `${statusColor}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color: isEmpty ? 'var(--text-muted)' : statusColor,
        cursor: data?.barcode ? 'pointer' : 'default',
        transition: 'all 0.15s',
        position: 'relative',
      }}
    >
      {isEmpty ? pos : (
        <>
          {pos}
          {data.status === 'running' && (
            <span style={{
              position: 'absolute', top: -3, right: -3, width: 7, height: 7,
              borderRadius: '50%', background: '#059669',
              animation: 'pulse 1.5s infinite',
            }} />
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Incubator Visualization                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function IncubatorView({ slots, temperature }) {
  const activeCount = slots.filter(s => s.active).length;
  const tempOk = temperature >= TARGET_TEMP - 0.5 && temperature <= TARGET_TEMP + 0.5;

  return (
    <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-primary, #fff)' }}>
      <SectionHeader title="Incubator" subtitle={`${activeCount}/${INCUBATOR_SLOTS} slots active (${activeCount * TESTS_PER_SLOT} tests)`}>
        <div style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          background: tempOk ? '#f0fdf4' : '#fef2f2',
          color: tempOk ? '#16a34a' : '#dc2626',
          border: `1px solid ${tempOk ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {temperature?.toFixed(1) ?? '—'}°C
        </div>
      </SectionHeader>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {slots.map((s, i) => (
          <div key={i} style={{
            width: 40, height: 28, borderRadius: 5,
            border: `1.5px solid ${s.active ? '#059669' : 'var(--border-color)'}`,
            background: s.active ? '#dcfce7' : 'var(--bg-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: s.active ? '#059669' : 'var(--text-muted)',
          }}>
            {s.active ? `${s.testsRunning || TESTS_PER_SLOT}T` : '—'}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Test Progress Row                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function TestProgressRow({ test }) {
  const elapsed = test.startedAt ? Math.floor((Date.now() - new Date(test.startedAt).getTime()) / 60000) : 0;
  const progress = Math.min(100, Math.round((elapsed / FIRST_RESULT_MIN) * 100));

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
      borderRadius: 8, background: 'var(--bg-secondary, #f8fafc)', marginBottom: 6,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
          {test.testName} — <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{test.specimenId}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          {test.patientName || 'Unknown'} · Position {test.position}
        </div>
      </div>
      <div style={{ width: 80 }}>
        <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#059669', borderRadius: 2, transition: 'width 1s linear' }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'right', marginTop: 2 }}>{elapsed}m / ~{FIRST_RESULT_MIN}m</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Result Row                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ResultRow({ result }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
      borderRadius: 8, background: 'var(--bg-secondary, #f8fafc)', marginBottom: 4,
      borderLeft: `3px solid ${result.flag === 'H' || result.flag === 'HH' ? '#dc2626' : result.flag === 'L' || result.flag === 'LL' ? '#2563eb' : '#16a34a'}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
          {result.testName} — <span style={{ fontWeight: 500 }}>{result.specimenId}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
          {result.patientName || ''} · {new Date(result.completedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: result.flag ? (result.flag.includes('H') ? '#dc2626' : '#2563eb') : 'var(--text-primary)' }}>
          {result.value} <span style={{ fontSize: 10, fontWeight: 600 }}>{result.unit}</span>
        </div>
        {result.flag && (
          <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: result.flag.includes('H') ? '#dc2626' : '#2563eb', borderRadius: 3, padding: '1px 4px' }}>
            {result.flag}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* LIS link                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

const MSG_STATUS_COLORS = {
  applied: '#059669',
  received: '#0284c7',
  unmatched: '#d97706',
  duplicate: '#6b7280',
  error: '#dc2626',
};

/**
 * The interface half of the panel: what we are listening for, and what the
 * analyzer has actually sent.
 *
 * This is here because "no results are coming through" is the failure everyone
 * hits first, and answering it otherwise means reading bridge logs on the lab
 * machine. `unmatched` is the number worth watching — it means the Maglumi is
 * talking to us fine but its barcode does not line up with an open order.
 *
 * One thing this cannot show: the IP and port the instrument is dialling. That
 * lives in its own Lis.exe screen; the vendor's config files on disk are
 * encrypted, so it has to be read off the instrument and matched to the port below.
 */
function LisLinkCard({ link, stats, messages }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!link) return null;

  const total = Object.values(stats || {}).reduce((a, b) => a + (b || 0), 0);
  const field = (label, value, hint) => (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{value || '—'}</div>
      {hint && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-primary, #fff)', marginBottom: 20 }}>
      <SectionHeader title="LIS Link" subtitle="HL7 v2 over TCP — the analyzer connects in to the bridge">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          style={{
            fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--border-color)', background: 'var(--bg-secondary, #f8fafc)',
            color: 'var(--text-secondary)',
          }}
        >
          {showRaw ? 'Hide raw HL7' : `Raw HL7 (${messages?.length || 0})`}
        </button>
      </SectionHeader>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {field('Protocol', link.protocol)}
        {field('Listening on', link.port ? `TCP ${link.port}` : '—', 'set this as the LIS port on the instrument')}
        {field('Framing', 'Auto', 'MLLP · PACK · unframed')}
        {field('ACK', link.ackMode?.startsWith('off') ? 'Off' : 'On', 'Snibe sends MSH-15 = NE')}
        {field(
          'Last message',
          link.lastMessageAt ? new Date(link.lastMessageAt).toLocaleString() : 'never',
          link.lastMessageStatus || null,
        )}
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {Object.entries(stats).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              color: '#fff', background: MSG_STATUS_COLORS[k] || '#6b7280',
            }}>
              {v} {k}
            </span>
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>last 7 days</span>
        </div>
      )}

      {link.lastMessageAt === null && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '12px 0 0' }}>
          Nothing received yet. On the instrument, open its LIS screen, choose TCP, and point it at
          this machine on port {link.port}. Results appear here as soon as the first message lands.
        </p>
      )}

      {showRaw && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(messages || []).length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No messages stored yet.</div>
          ) : messages.map((m) => (
            <div key={m.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '6px 10px', background: 'var(--bg-secondary, #f8fafc)', fontSize: 10,
              }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {m.specimenId || '(no specimen id)'} · {m.testsCount} result{m.testsCount === 1 ? '' : 's'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.note && <span style={{ color: 'var(--text-muted)' }}>{m.note}</span>}
                  <span style={{
                    fontWeight: 700, color: '#fff', borderRadius: 4, padding: '1px 6px',
                    background: MSG_STATUS_COLORS[m.status] || '#6b7280',
                  }}>{m.status}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{new Date(m.createdAt).toLocaleTimeString()}</span>
                </span>
              </div>
              <pre style={{
                margin: 0, padding: '8px 10px', fontSize: 10, lineHeight: 1.5, maxHeight: 160,
                overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                color: 'var(--text-secondary)', background: 'var(--bg-primary, #fff)',
              }}>
                {/* Segments are CR-separated on the wire; split them for reading. */}
                {String(m.raw || '').split(/\r\n?|\n/).filter(Boolean).join('\n')}
                {m.truncated ? '\n… truncated' : ''}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Main Panel                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function MaglumiControlPanel() {
  const [analyzerStatus, setAnalyzerStatus] = useState('offline');
  const [mode, setMode] = useState('Random Access');
  const [temperature, setTemperature] = useState(TARGET_TEMP);
  const [reagents, setReagents] = useState(Array.from({ length: REAGENT_SLOTS }, () => null));
  const [samples, setSamples] = useState(Array.from({ length: SAMPLE_POSITIONS }, () => null));
  const [incubatorSlots, setIncubatorSlots] = useState(Array.from({ length: INCUBATOR_SLOTS }, () => ({ active: false })));
  const [activeTests, setActiveTests] = useState([]);
  const [recentResults, setRecentResults] = useState([]);
  const [testsToday, setTestsToday] = useState(0);
  const [lastPing, setLastPing] = useState(null);
  const [link, setLink] = useState(null);
  const [messageStats, setMessageStats] = useState(null);
  const [rawMessages, setRawMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  // ── Fetch initial state ──
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/analyzer/maglumi/status');
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (!mounted.current) return;

      setAnalyzerStatus(data.status || 'offline');
      setMode(data.mode || 'Random Access');
      setTemperature(data.temperature ?? TARGET_TEMP);
      setReagents(data.reagents || Array.from({ length: REAGENT_SLOTS }, () => null));
      setSamples(data.samples || Array.from({ length: SAMPLE_POSITIONS }, () => null));
      setIncubatorSlots(data.incubator || Array.from({ length: INCUBATOR_SLOTS }, () => ({ active: false })));
      setActiveTests(data.activeTests || []);
      setRecentResults(data.recentResults || []);
      setTestsToday(data.testsToday || 0);
      setLastPing(data.lastPing || null);
      setLink(data.link || null);
      setMessageStats(data.messageStats || null);
      setRawMessages(data.rawMessages || []);
    } catch {
      // Fallback: just fetch basic analyzer status
      try {
        const res = await fetch('/api/lab/analyzers');
        if (res.ok) {
          const d = await res.json();
          const maglumi = (d.analyzers || []).find(a => a.id === 'maglumi800');
          if (maglumi && mounted.current) {
            setAnalyzerStatus(maglumi.status || 'offline');
            setLastPing(maglumi.lastSeen);
            setTestsToday(maglumi.testsToday || 0);
          }
        }
      } catch { /* ignore */ }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchState();
    return () => { mounted.current = false; };
  }, [fetchState]);

  // ── SSE for real-time updates ──
  useEffect(() => {
    let es;
    try {
      es = new EventSource('/api/lab/realtime');
      es.onmessage = (evt) => {
        let parsed;
        try { parsed = JSON.parse(evt.data); } catch { return; }

        if (parsed.type === 'MACHINE_STATUS' && parsed.data?.analyzerId === 'maglumi800') {
          setAnalyzerStatus(parsed.data.status);
          setLastPing(new Date().toISOString());
        }
        // Maglumi-specific events
        if (parsed.type === 'MAGLUMI_REAGENT_UPDATE' && parsed.data) {
          setReagents(parsed.data.reagents);
        }
        if (parsed.type === 'MAGLUMI_SAMPLE_LOADED' && parsed.data) {
          setSamples(prev => {
            const next = [...prev];
            const pos = parsed.data.position - 1;
            if (pos >= 0 && pos < SAMPLE_POSITIONS) next[pos] = parsed.data;
            return next;
          });
        }
        if (parsed.type === 'MAGLUMI_TEST_STARTED' && parsed.data) {
          setActiveTests(prev => [...prev, parsed.data]);
        }
        if (parsed.type === 'MAGLUMI_TEST_COMPLETE' && parsed.data) {
          setActiveTests(prev => prev.filter(t => t.specimenId !== parsed.data.specimenId || t.testName !== parsed.data.testName));
          setRecentResults(prev => [parsed.data, ...prev].slice(0, 20));
          setTestsToday(prev => prev + 1);
        }
      };
    } catch { /* SSE not available */ }
    return () => { if (es) es.close(); };
  }, []);

  // ── Periodic refresh (every 30s as fallback) ──
  useEffect(() => {
    const interval = setInterval(fetchState, 30000);
    return () => clearInterval(interval);
  }, [fetchState]);

  if (loading) {
    return (
      <div className="panel-card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading Maglumi 800 status...</p>
      </div>
    );
  }

  const statusLabel = analyzerStatus === 'active' ? 'Active — Processing'
    : analyzerStatus === 'online' ? 'Online — Ready'
    : 'Offline';

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* ═══════ System Header Bar ═══════ */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
        borderRadius: 14, padding: '16px 24px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 800 }}>MAGLUMI 800</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Snibe Diagnostic · Chemiluminescence Immunoassay (CLIA)</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status={analyzerStatus} />
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{statusLabel}</span>
          </div>
          <div style={{
            padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 12, fontWeight: 600,
          }}>
            {mode} Mode
          </div>
          <div style={{
            padding: '5px 12px', borderRadius: 6,
            background: temperature >= TARGET_TEMP - 0.5 && temperature <= TARGET_TEMP + 0.5 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
            color: '#fff', fontSize: 12, fontWeight: 600,
          }}>
            {temperature.toFixed(1)}°C
          </div>
        </div>
      </div>

      {/* ═══════ Stats Row ═══════ */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Tests Today" value={testsToday} unit="" color="#2563eb" />
        <StatCard label="Throughput" value={THROUGHPUT} unit="/hr" color="#059669" />
        <StatCard label="Active Tests" value={activeTests.length} unit="" color="#d97706" />
        <StatCard label="Reagents Loaded" value={reagents.filter(r => r?.testName).length} unit={`/${REAGENT_SLOTS}`} color="#7c3aed" />
        <StatCard label="Samples Loaded" value={samples.filter(s => s?.barcode).length} unit={`/${SAMPLE_POSITIONS}`} color="#0891b2" />
        <StatCard label="First Result" value={FIRST_RESULT_MIN} unit="min" color="#6b7280" />
      </div>

      {/* ═══════ LIS Link ═══════ */}
      <LisLinkCard link={link} stats={messageStats} messages={rawMessages} />

      {/* ═══════ Main Grid ═══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ─── Left Column ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Reagent Area */}
          <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-primary, #fff)' }}>
            <SectionHeader title="Reagent Area" subtitle="9 on-board · RFID auto-read · Refrigerated">
              <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '3px 8px', borderRadius: 4, border: '1px solid #e9d5ff' }}>
                RFID
              </span>
            </SectionHeader>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {reagents.map((r, i) => <ReagentSlot key={i} slot={i + 1} data={r} />)}
            </div>
          </div>

          {/* Incubator */}
          <IncubatorView slots={incubatorSlots} temperature={temperature} />
        </div>

        {/* ─── Right Column ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sample Area */}
          <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-primary, #fff)' }}>
            <SectionHeader title="Sample Area" subtitle="40 positions · Continuous loading · Barcode reader · Refrigerated">
              <span style={{ fontSize: 10, fontWeight: 700, color: '#0891b2', background: '#ecfeff', padding: '3px 8px', borderRadius: 4, border: '1px solid #a5f3fc' }}>
                COOLED
              </span>
            </SectionHeader>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {samples.map((s, i) => <SamplePosition key={i} pos={i + 1} data={s} />)}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, border: '1.5px solid #059669', background: '#05966915' }} /> Running
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, border: '1.5px solid #0284c7', background: '#0284c715' }} /> Queued
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, border: '1.5px solid #6b7280', background: '#6b728015' }} /> Complete
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, border: '1.5px solid var(--border-color)', background: 'var(--bg-secondary)' }} /> Empty
              </span>
            </div>
          </div>

          {/* Active Tests */}
          <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-primary, #fff)' }}>
            <SectionHeader title="Processing" subtitle={`Real-time test monitoring · ${activeTests.length} active`} />
            {activeTests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
                No tests currently processing. Load samples to begin.
              </div>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {activeTests.map((t, i) => <TestProgressRow key={i} test={t} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ Recent Results ═══════ */}
      <div style={{ marginTop: 20, padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-primary, #fff)' }}>
        <SectionHeader title="Recent Results" subtitle={`Last ${recentResults.length} completed tests`} />
        {recentResults.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
            No results yet. Results appear here as tests complete.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 6 }}>
            {recentResults.slice(0, 12).map((r, i) => <ResultRow key={i} result={r} />)}
          </div>
        )}
      </div>

      {/* ═══════ Footer Info ═══════ */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', padding: '0 4px' }}>
        <span>
          {link?.comPort
            ? `Serial: ${link.comPort} · ASTM E1394 · ${link.baudRate || 9600} 8N1`
            : `${link?.protocol || 'HL7 v2 over TCP'} · listening on TCP ${link?.port || 2576} · framing auto`}
        </span>
        <span>Last heartbeat: {lastPing ? new Date(lastPing).toLocaleTimeString() : '—'}</span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
