"use client";

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Printable Code128 specimen-barcode label.
 * Props: value (encoded string), title, lines[] (human-readable text below).
 */
export default function BarcodeLabel({ value, title, lines = [] }) {
  const svgRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        displayValue: true,
        height: 55,
        width: 2,
        fontSize: 14,
        margin: 8,
        textMargin: 3,
        font: 'monospace',
      });
    } catch {
      /* invalid barcode value — leave svg empty */
    }
  }, [value]);

  const printLabel = () => {
    if (!labelRef.current) return;
    const w = window.open('', '_blank', 'width=460,height=340');
    if (!w) return;
    w.document.write(
      `<html><head><title>Specimen Label — ${value || ''}</title>
       <style>body{margin:0;padding:14px;font-family:Arial,Helvetica,sans-serif;text-align:center;color:#111}</style>
       </head><body>${labelRef.current.innerHTML}</body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); w.close(); } catch { /* popup closed */ } }, 300);
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <div
        ref={labelRef}
        style={{
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          background: '#ffffff',
          textAlign: 'center',
          minWidth: '240px',
        }}
      >
        {title && <div style={{ fontSize: '12px', fontWeight: 700, color: '#111', marginBottom: '2px' }}>{title}</div>}
        <svg ref={svgRef} />
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: '11px', color: '#333', lineHeight: 1.35 }}>{l}</div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={printLabel}>Print Label</button>
    </div>
  );
}
