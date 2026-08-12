"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const TEAL = '#107a82';

export default function VerifyReportPage() {
  const params = useParams();
  const token = params?.token;
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    if (!token) return;
    fetch(`/api/lab/reports/verify/${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => setState({ loading: false, data }))
      .catch(() => setState({ loading: false, data: { valid: false, message: 'Verification unavailable.' } }));
  }, [token]);

  const { loading, data } = state;
  const valid = data?.valid;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: '20px', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 10px 40px -12px rgba(0,0,0,0.25)', padding: '32px', maxWidth: '440px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `2.5px solid ${TEAL}`, paddingBottom: '12px', marginBottom: '18px' }}>
          <div style={{ width: '40px', height: '40px', border: `3px solid ${TEAL}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '26px', color: TEAL }}>+</div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 900, color: TEAL }}>RK Clinic Laboratory</div>
            <div style={{ fontSize: '10px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Report Verification</div>
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#64748b' }}>Verifying…</p>
        ) : valid ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 800, fontSize: '16px', marginBottom: '14px' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#059669', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>✓</span>
              Authentic report
            </div>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Report No', data.reportNo],
                  ['Accession', data.accession],
                  ['Status', data.status],
                  ['Tests', data.testCount],
                  ['Abnormal', data.abnormalCount],
                  ['Critical', data.criticalCount],
                  ['Generated', data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'],
                  ['Issuer', data.issuer],
                ].map(([k, v]) => (
                  <tr key={k}><td style={{ padding: '6px 0', color: '#64748b' }}>{k}</td><td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{v ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '16px' }}>This confirms the report was issued by RK Clinic Laboratory. Patient details are intentionally not shown here to protect privacy.</p>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e11d48', fontWeight: 800, fontSize: '16px', marginBottom: '10px' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#e11d48', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>✕</span>
              Not verified
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>{data?.message || 'No report matches this verification code.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
