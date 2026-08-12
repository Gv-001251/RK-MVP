"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import LabReportDocument from './LabReportDocument';

/**
 * Full-screen report viewer + toolbar shared by the Reports panel and the
 * Doctor Portal. Handles data load, (re)generation, print, PDF download
 * (jspdf + html2canvas), and email.
 *
 * Props: { orderId, canManage, verifyBaseUrl, onClose }
 */
export default function ReportViewer({ orderId, canManage = false, verifyBaseUrl = '', onClose }) {
  const [data, setData] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const reportRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true); setMsg('');
    try {
      const d = await fetch(`/api/lab/reports/data/${encodeURIComponent(orderId)}`).then(r => r.ok ? r.json() : null);
      if (d) { setData(d); setReport(d.report || null); } else setMsg('Could not load report data.');
    } catch { setMsg('Network error.'); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const generate = async () => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/lab/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
      const d = await res.json();
      if (res.ok) { await loadData(); setMsg('Report generated. QR verification is now active.'); }
      else setMsg(d.error || 'Generate failed.');
    } catch { setMsg('Network error.'); } finally { setBusy(false); }
  };

  const printReport = () => {
    document.body.classList.add('printing-report');
    const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  };

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    setBusy(true); setMsg('');
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;
      let pos = 0; let remaining = imgH;
      pdf.addImage(imgData, 'PNG', 0, pos, pw, imgH);
      remaining -= ph;
      while (remaining > 0) { pdf.addPage(); pos -= ph; pdf.addImage(imgData, 'PNG', 0, pos, pw, imgH); remaining -= ph; }
      pdf.save(`${report?.report_no || data?.order?.accession_number || 'lab-report'}.pdf`);
    } catch (e) { setMsg('PDF generation failed: ' + e.message); }
    finally { setBusy(false); }
  };

  const emailReport = async () => {
    if (!report?.id) { setMsg('Generate the report before emailing.'); return; }
    const to = window.prompt('Send report to email address:');
    if (!to) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/lab/reports/${report.id}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) });
      const d = await res.json();
      setMsg(res.ok ? d.message : (d.error || 'Email failed.'));
    } catch { setMsg('Network error.'); } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', flexDirection: 'column', zIndex: 1000, overflow: 'auto', padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '860px', width: '100%', margin: '0 auto' }}>
        <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: '#fff', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
          <strong style={{ marginRight: 'auto', fontSize: '13px' }}>{report ? report.report_no : 'Report Preview'}</strong>
          {canManage && <button className="btn btn-primary btn-sm" disabled={busy} onClick={generate}>{report ? 'Regenerate' : 'Generate'}</button>}
          <button className="btn btn-secondary btn-sm" onClick={printReport}>Print</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={downloadPdf}>Download PDF</button>
          {canManage && <button className="btn btn-secondary btn-sm" disabled={busy || !report} onClick={emailReport}>Email</button>}
          <button className="btn btn-rose btn-sm" onClick={onClose}>Close</button>
        </div>
        {msg && <div className="no-print" style={{ background: '#fff', borderRadius: '8px', padding: '8px 14px', marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>{msg}</div>}

        {loading ? <div style={{ background: '#fff', borderRadius: '10px', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading report…</div>
          : data ? <LabReportDocument ref={reportRef} data={data} report={report} verifyBaseUrl={verifyBaseUrl} />
          : <div style={{ background: '#fff', borderRadius: '10px', padding: '40px', textAlign: 'center', color: 'var(--rose-hover)' }}>Could not load report.</div>}
      </div>
    </div>
  );
}
