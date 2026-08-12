"use client";

import React, { useEffect, useRef, useState, forwardRef } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { useClinic } from '../context/ClinicContext';

const TEAL = '#107a82';

function dateOnly(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(); }
function dateTime(v) { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }

function signoff(v) {
  if (!v) return null;
  if (v.released_at) return { by: v.released_by, sig: v.release_signature, at: v.released_at, label: 'Released & Authorised' };
  if (v.approved_at) return { by: v.approved_by, sig: v.approved_signature, at: v.approved_at, label: 'Approved (pending release)' };
  if (v.reviewed_at) return { by: v.reviewed_by, sig: v.reviewed_signature, at: v.reviewed_at, label: 'Technician reviewed' };
  return null;
}

/**
 * Branded A4 laboratory report. Presentational — consumes assembled report
 * data. Renders the specimen barcode (Code128), a QR verification code, and any
 * cell-distribution histograms the analyzer sent with the results.
 * forwardRef exposes the root node for PDF capture (html2canvas/jsPDF).
 */
const LabReportDocument = forwardRef(function LabReportDocument({ data, report, verifyBaseUrl }, ref) {
  const { clinicName } = useClinic();
  const barcodeRef = useRef(null);
  const [qr, setQr] = useState('');

  const order = data?.order || {};
  const patient = data?.patient || {};
  const tests = data?.tests || [];
  const images = data?.images || [];
  const counts = data?.counts || { tests: 0, abnormal: 0, critical: 0 };
  const sign = signoff(data?.verification);
  const status = data?.verification?.status || order.status || 'Preliminary';
  const released = status === 'Released';
  const amended = status === 'Amended';
  const barcodeValue = order.accession_number || order.id || '';
  const verifyUrl = report?.verification_token && verifyBaseUrl ? `${verifyBaseUrl}/verify/${report.verification_token}` : null;

  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, String(barcodeValue), { format: 'CODE128', displayValue: true, height: 38, width: 1.5, fontSize: 11, margin: 2, font: 'monospace' });
      } catch { /* invalid value */ }
    }
  }, [barcodeValue]);

  useEffect(() => {
    let alive = true;
    if (verifyUrl) {
      QRCode.toDataURL(verifyUrl, { width: 160, margin: 1 }).then(u => { if (alive) setQr(u); }).catch(() => {});
    } else {
      setQr('');
    }
    return () => { alive = false; };
  }, [verifyUrl]);

  // Group results by department for sectioned rendering.
  const byDept = {};
  for (const t of tests) (byDept[t.department || 'General'] ||= []).push(t);

  const watermark = amended ? 'AMENDED' : !released ? 'PRELIMINARY' : (clinicName || 'RK CLINIC');
  const watermarkColor = amended ? 'rgba(225,29,72,0.08)' : !released ? 'rgba(217,119,6,0.09)' : 'rgba(16,122,130,0.05)';

  const cellTd = { padding: '5px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11.5px' };
  const th = { padding: '6px 8px', textAlign: 'left', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#fff', background: TEAL };

  return (
    <div ref={ref} className="lab-report" style={{ position: 'relative', width: '100%', maxWidth: '820px', margin: '0 auto', background: '#fff', color: '#0f172a', padding: '28px 32px', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      {/* Watermark */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ transform: 'rotate(-32deg)', fontSize: '86px', fontWeight: 900, color: watermarkColor, letterSpacing: '6px', whiteSpace: 'nowrap' }}>{watermark}</div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${TEAL}`, paddingBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '46px', height: '46px', border: `3px solid ${TEAL}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '30px', color: TEAL, lineHeight: 1 }}>+</div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: '20px', fontWeight: 900, color: TEAL, letterSpacing: '0.5px' }}>{clinicName || 'RK CLINIC'}</div>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.6px', color: '#555', textTransform: 'uppercase' }}>Laboratory &amp; Diagnostics</div>
              <div style={{ fontSize: '8.5px', color: '#777', marginTop: '2px' }}>Safe Tower 123, Riyadh · +966 11 456 7890 · lab@rkclinic.com</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.5px' }}>LABORATORY REPORT</div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>Report No: <strong>{report?.report_no || '(unsaved preview)'}</strong></div>
            <div style={{ display: 'inline-block', marginTop: '4px', fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', color: '#fff', background: released ? '#059669' : amended ? '#e11d48' : '#d97706' }}>{status.toUpperCase()}</div>
          </div>
        </div>

        {/* Meta band: barcode + QR + counts */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
          <div><svg ref={barcodeRef} /></div>
          <div style={{ fontSize: '10px', color: '#334155', textAlign: 'center' }}>
            <div><strong>{counts.tests}</strong> tests · <strong style={{ color: counts.abnormal ? '#b45309' : '#334155' }}>{counts.abnormal}</strong> abnormal · <strong style={{ color: counts.critical ? '#e11d48' : '#334155' }}>{counts.critical}</strong> critical</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            {qr ? <img src={qr} alt="Verification QR" style={{ width: '74px', height: '74px' }} /> : <div style={{ width: '74px', height: '74px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#94a3b8', textAlign: 'center' }}>Generate to enable QR</div>}
            <div style={{ fontSize: '7.5px', color: '#777' }}>Scan to verify</div>
          </div>
        </div>

        {/* Patient + doctor */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', border: `1px solid ${TEAL}`, borderRadius: '6px', padding: '10px 14px', margin: '10px 0', fontSize: '11px' }}>
          <div><strong>Patient:</strong> {patient.name || order.patient_name || '—'}</div>
          <div><strong>Referring Doctor:</strong> {order.doctor_name || '—'}</div>
          <div><strong>Patient ID:</strong> <span style={{ fontFamily: 'monospace' }}>{order.patient_id || '—'}</span></div>
          <div><strong>Department:</strong> {order.department || '—'}</div>
          <div><strong>Age / Gender:</strong> {patient.age ? `${patient.age}y` : '—'} / {patient.gender || '—'}</div>
          <div><strong>Priority:</strong> {order.priority || 'Routine'}</div>
          <div><strong>Accession:</strong> <span style={{ fontFamily: 'monospace' }}>{order.accession_number || '—'}</span></div>
          <div><strong>Phone:</strong> {patient.phone || '—'}</div>
          <div><strong>Collected:</strong> {dateTime(order.collection_time)}</div>
          <div><strong>Reported:</strong> {dateTime(order.report_generated_at || report?.generated_at)}</div>
        </div>

        {/* Critical banner */}
        {counts.critical > 0 && (
          <div style={{ background: '#fee2e2', border: '1px solid #e11d48', color: '#9f1239', borderRadius: '6px', padding: '7px 12px', fontSize: '11px', fontWeight: 700, marginBottom: '8px' }}>
            ⚠ CRITICAL VALUES PRESENT — {(data.criticals || []).map(c => c.test_name).join(', ')}. Treating physician notified per critical-value policy.
          </div>
        )}

        {/* Results by department */}
        {tests.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No results recorded.</div>
          : Object.entries(byDept).map(([dept, rows]) => (
            <div key={dept} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 3px' }}>{dept}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, width: '34%' }}>Investigation</th><th style={{ ...th, width: '20%' }}>Result</th><th style={{ ...th, width: '12%' }}>Unit</th><th style={{ ...th, width: '22%' }}>Reference Range</th><th style={{ ...th, width: '12%' }}>Flag</th></tr></thead>
                <tbody>
                  {rows.map((t, i) => {
                    const rowBg = t.critical ? '#fee2e2' : t.abnormal ? '#fef3c7' : (i % 2 ? '#f8fafc' : '#fff');
                    const resColor = t.critical ? '#e11d48' : t.abnormal ? '#b45309' : '#0f172a';
                    return (
                      <tr key={i} style={{ background: rowBg }}>
                        <td style={{ ...cellTd, fontWeight: 600 }}>{t.testName}</td>
                        <td style={{ ...cellTd, fontWeight: 800, color: resColor }}>
                          {t.result || '—'}
                          {t.critical && <span style={{ marginLeft: '6px', fontSize: '8px', fontWeight: 900, color: '#fff', background: '#e11d48', borderRadius: '6px', padding: '1px 5px' }}>CRITICAL</span>}
                        </td>
                        <td style={cellTd}>{t.unit || '—'}</td>
                        <td style={{ ...cellTd, color: '#475569' }}>{t.referenceRange || '—'}</td>
                        <td style={{ ...cellTd, fontWeight: 800, color: resColor }}>{t.flag === 'H' ? 'High ▲' : t.flag === 'L' ? 'Low ▼' : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

        {/* Cell-distribution histograms, when the analyzer sent any. Placed
            after the numbers and before sign-off: the curve is read alongside
            the counts, not instead of them. Renders nothing when absent, so
            reports from instruments that send no images are unchanged. */}
        {images.length > 0 && (
          <div style={{ marginTop: '14px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Cell Distribution Histograms
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, 1fr)`, gap: '10px' }}>
              {images.map((img) => (
                <figure key={img.id} style={{ margin: 0, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  {/*
                    A plain <img> rather than next/image: these are patient
                    images behind an authenticated route, and the Next image
                    optimizer fetches server-side without the session cookie,
                    so it would 401. Same-origin, so html2canvas can also
                    rasterise it for the PDF without tainting the canvas.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={`${img.label || img.name} cell-distribution histogram for ${barcodeValue}`}
                    loading="eager"
                    style={{ display: 'block', width: '100%', height: 'auto', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff' }}
                  />
                  <figcaption style={{ fontSize: '8.5px', color: '#475569', marginTop: '2px', lineHeight: 1.35 }}>
                    <strong style={{ color: '#0f172a' }}>{img.label || img.name}</strong>
                    {img.markers?.length > 0 && (
                      <> · {img.markers.map((m) => `${m.label} ${m.value}`).join(', ')}</>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div style={{ fontSize: '8px', color: '#777', marginTop: '3px' }}>
              Curves as reported by the analyzer. Values shown are the instrument&apos;s discriminator positions.
            </div>
          </div>
        )}

        {/* Signature */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '22px', paddingTop: '10px' }}>
          <div style={{ fontSize: '8.5px', color: '#777', width: '55%', lineHeight: 1.4 }}>
            Results relate only to the item(s) tested. This report is not valid for medico-legal purposes unless countersigned.
            {verifyUrl && <> Verify authenticity at <span style={{ color: TEAL }}>{verifyUrl}</span></>}
          </div>
          <div style={{ textAlign: 'right', width: '42%' }}>
            {sign ? (
              <>
                <div style={{ fontFamily: 'cursive', fontStyle: 'italic', fontSize: '20px', color: TEAL, lineHeight: 1 }}>{sign.sig || sign.by}</div>
                <div style={{ borderTop: '1px solid #333', marginTop: '2px', paddingTop: '3px' }}>
                  <strong style={{ fontSize: '11px' }}>{sign.by}</strong>
                  <div style={{ fontSize: '8.5px', color: '#555' }}>{sign.label} · {dateTime(sign.at)}</div>
                  <div style={{ fontSize: '8px', color: TEAL, fontWeight: 700 }}>✓ Electronically signed</div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, borderTop: '1px dashed #d97706', paddingTop: '4px' }}>Preliminary — pending authorisation. Not for clinical use.</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${TEAL}`, marginTop: '12px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#666' }}>
          <span>Electronically generated report — {clinicName || 'RK Clinic'} Laboratory Information System</span>
          <span>Report {report?.report_no || 'preview'} · Generated {dateTime(report?.generated_at || Date.now())}</span>
        </div>
      </div>
    </div>
  );
});

export default LabReportDocument;
