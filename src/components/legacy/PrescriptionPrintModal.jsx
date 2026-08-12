"use client";

/**
 * Prescription printout preview — parked with the other non-LIS modules.
 *
 * Lifted verbatim (behaviour-wise) out of `app/page.js`, where it sat inline
 * as ~390 lines of markup inside the app shell. The laboratory workflow never
 * prints prescriptions, so keeping it in the shell meant every LIS screen
 * carried it. It is registered in `src/lib/legacy-modules.js` and is ready to
 * drop back in when the consultation module returns.
 *
 * Usage:
 *   <PrescriptionPrintModal rx={rx} onClose={() => setRx(null)} />
 */

import React, { useEffect, useRef } from 'react';
import { useClinic } from '../../context/ClinicContext';

export default function PrescriptionPrintModal({ rx, onClose }) {
  const { patients, doctorName, doctorRole, clinicName } = useClinic();
  const closeButtonRef = useRef(null);

  // Close on Escape and move focus to the close button when the dialog opens.
  useEffect(() => {
    if (!rx) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [rx, onClose]);

  if (!rx) return null;

  const pat = patients.find((p) => p.id === rx.patientId);
  const ageText = pat ? `${pat.age} Y` : 'n/a';
  const genderText = pat?.gender || 'n/a';
  const diagnosisText = rx.diagnosis || 'General OPD Consultation';

  const medCount = rx.meds?.length || 0;
  const labCount = rx.labTests?.length || 0;
  const totalItems = medCount + labCount;

  let layoutClass = '';
  if (totalItems > 10) {
    layoutClass = 'extra-compact-layout';
  } else if (totalItems > 6) {
    layoutClass = 'compact-layout';
  }

  // Cap the handwriting canvas so a long medicine list cannot overflow the page.
  let canvasMaxHeight = '6.5cm';
  if (totalItems > 10) {
    canvasMaxHeight = '2.5cm';
  } else if (totalItems > 7) {
    canvasMaxHeight = '4cm';
  } else if (totalItems > 4) {
    canvasMaxHeight = '5cm';
  }

  const parseVital = (vitalsStr, label) => {
    if (!vitalsStr) return '--';
    const match = vitalsStr.match(new RegExp(label + '\\s*:\\s*([^,|]+)'));
    if (!match) return '--';
    return match[1].trim().replace(/\s*(bpm|°F|%|cm|kg|mg\/dL)$/i, '');
  };

  const displayDoctorName = doctorName
    ? (doctorName.startsWith('Dr.') ? doctorName : 'Dr. ' + doctorName)
    : 'Dr. R. Kumar';

  const renderHeader = () => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      borderBottom: '2.5px solid #107a82',
      paddingBottom: '8px',
      marginBottom: '6px',
      boxSizing: 'border-box'
    }}>
      {/* Left: clinic logo and branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #107a82',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '900',
          fontSize: '28px',
          color: '#107a82',
          lineHeight: '1',
          backgroundColor: 'transparent'
        }}>+</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.1' }}>
          <span style={{ fontSize: '16px', fontWeight: '900', letterSpacing: '0.5px', color: '#107a82' }}>{clinicName || 'RK CLINIC'}</span>
          <span style={{ fontSize: '8px', fontWeight: '700', letterSpacing: '0.8px', color: '#666', textTransform: 'uppercase' }}>Healthcare &amp; Multi-Specialty Care</span>
          <span style={{ fontSize: '7.5px', color: '#777', marginTop: '1px' }}>Ph: +966 11 456 7890 | info@rkclinic.com</span>
        </div>
      </div>

      {/* Right: doctor details */}
      <div style={{ textAlign: 'right', lineHeight: '1.3' }}>
        <strong style={{ fontSize: '13px', color: '#107a82', display: 'block' }}>{displayDoctorName}</strong>
        <span style={{ fontSize: '9px', color: '#333', fontWeight: '600', display: 'block' }}>MBBS, MD | {doctorRole || 'CMO & Specialist'}</span>
        <span style={{ fontSize: '8.5px', color: '#666', display: 'block' }}>Reg No: 12345/IN</span>
      </div>
    </div>
  );

  const renderPatientInfo = () => (
    <div style={{
      border: '1.5px solid #107a82',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '11px',
      marginTop: '8px',
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
      gap: '6px 12px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <div><strong>Patient Name:</strong> <span style={{ color: '#000', fontWeight: '700' }}>{pat?.name || 'Unknown'}</span></div>
      <div><strong>Age:</strong> <span style={{ color: '#000', fontWeight: '600' }}>{ageText}</span></div>
      <div><strong>Gender:</strong> <span style={{ color: '#000', fontWeight: '600' }}>{genderText}</span></div>
      <div style={{ textAlign: 'right' }}><strong>Date:</strong> <span style={{ color: '#000', fontWeight: '600' }}>{rx.date}</span></div>

      <div style={{ gridColumn: 'span 2' }}>
        <strong>Patient ID:</strong> <span style={{ fontFamily: 'monospace', color: '#000', fontWeight: '600' }}>{rx.patientId}</span>
      </div>
      <div style={{ gridColumn: 'span 2', textAlign: 'right' }}>
        <strong>Diagnosis:</strong> <span style={{ color: '#000', fontWeight: '600' }}>{diagnosisText}</span>
      </div>
    </div>
  );

  const renderVitalsBlock = () => {
    if (!rx.vitals) return null;
    const bp = parseVital(rx.vitals, 'BP');
    const hr = parseVital(rx.vitals, 'HR') || parseVital(rx.vitals, 'Pulse');
    const temp = parseVital(rx.vitals, 'Temp');
    const spo2 = parseVital(rx.vitals, 'SpO2');
    const sugar = parseVital(rx.vitals, 'Sugar');
    const wt = parseVital(rx.vitals, 'Wt') || parseVital(rx.vitals, 'Weight') || rx.weight;
    const bmi = parseVital(rx.vitals, 'BMI');

    const rows = [
      { label: 'Blood Pressure:', value: bp, unit: ' mmHg' },
      { label: 'Heart Rate:', value: hr, unit: ' bpm' },
      { label: 'Temperature:', value: temp, unit: ' °F' },
      { label: 'SpO₂ Level:', value: spo2, unit: ' %' },
      { label: 'Blood Sugar:', value: sugar, unit: ' mg/dL' },
      { label: 'Weight:', value: wt, unit: ' kg' },
      { label: 'BMI:', value: bmi, unit: '' },
    ].filter((r) => r.value && r.value !== '--');

    return (
      <div style={{ pageBreakInside: 'avoid', marginBottom: '10px' }}>
        <strong style={{ fontSize: '11px', color: '#107a82', display: 'block', borderBottom: '1.5px solid #107a82', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          PATIENT VITALS:
        </strong>
        <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>{r.label}</td>
                <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{r.value}{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSymptomsBlock = () => {
    if (!rx.symptoms) return null;
    return (
      <div style={{ pageBreakInside: 'avoid', marginBottom: '10px' }}>
        <strong style={{ fontSize: '11px', color: '#107a82', display: 'block', borderBottom: '1.5px solid #107a82', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          CHIEF COMPLAINT:
        </strong>
        <div style={{ fontSize: '10.5px', color: '#333', lineHeight: '1.3', paddingLeft: '2px', fontWeight: '500' }}>
          {rx.symptoms}
        </div>
      </div>
    );
  };

  const renderMeds = () => {
    if (!rx.meds || rx.meds.length === 0) return null;
    return (
      <div style={{ marginTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '22px', fontWeight: '900', color: '#107a82', fontFamily: 'serif', lineHeight: '1' }}>℞</span>
          <span style={{ fontSize: '11.5px', fontWeight: '800', letterSpacing: '0.5px', color: '#107a82', textTransform: 'uppercase' }}>Prescribed Medicines</span>
        </div>
        <table className="rx-meds-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #107a82', textAlign: 'left' }}>
              <th style={{ padding: '6px', width: '6%', fontWeight: '700' }}>S.No</th>
              <th style={{ padding: '6px', width: '38%', fontWeight: '700' }}>Medicine Name</th>
              <th style={{ padding: '6px', width: '12%', fontWeight: '700' }}>Strength</th>
              <th style={{ padding: '6px', width: '18%', fontWeight: '700' }}>Dosage Pattern</th>
              <th style={{ padding: '6px', width: '14%', fontWeight: '700' }}>Timing</th>
              <th style={{ padding: '6px', width: '12%', fontWeight: '700' }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {rx.meds.map((med, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px' }}>{idx + 1}</td>
                <td style={{ padding: '6px' }}>
                  <strong style={{ color: '#000', fontSize: '11px' }}>{med.name}</strong>
                  {(med.notes || med.specialInstructions) && (
                    <div style={{ fontSize: '9px', color: '#555', fontStyle: 'italic', marginTop: '1px' }}>
                      {med.notes || med.specialInstructions}
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px', color: '#333' }}>{med.strength || '--'}</td>
                <td style={{ padding: '6px', color: '#333', fontWeight: '500' }}>
                  {med.dose || '1 unit'} ({med.frequency})
                </td>
                <td style={{ padding: '6px', color: '#333' }}>
                  {med.instructions || 'After Food'}
                </td>
                <td style={{ padding: '6px', color: '#333' }}>{med.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderInvestigations = () => {
    if (!rx.labTests || rx.labTests.length === 0) return null;
    return (
      <div style={{ marginTop: '10px', pageBreakInside: 'avoid' }}>
        <strong style={{ fontSize: '11px', color: '#107a82', display: 'block', borderBottom: '1.5px solid #107a82', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          INVESTIGATIONS ADVISED:
        </strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px', fontSize: '10.5px', paddingLeft: '2px', color: '#333' }}>
          {rx.labTests.map((test, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
              <span style={{ color: '#107a82', fontSize: '12px' }}>☑</span>
              <span>{test}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderHandwriting = () => {
    if (!rx.canvasSnapshot) return null;
    return (
      <div className="handwriting-prescription-print-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px', pageBreakInside: 'avoid', backgroundColor: 'transparent' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={rx.canvasSnapshot}
          alt="Doctor handwriting"
          style={{ width: '100%', height: 'auto', maxHeight: canvasMaxHeight, objectFit: 'contain', display: 'block', opacity: 0.9 }}
        />
      </div>
    );
  };

  const renderFollowUp = () => {
    if (!rx.followUp && !rx.specialInstructions && !rx.referralNotes) return null;
    return (
      <div style={{ borderTop: '1.5px solid #107a82', paddingTop: '6px', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '2px', color: '#333' }}>
        {rx.followUp && (
          <div><strong>Follow Up / Review:</strong> {rx.followUp}</div>
        )}
        {rx.referralNotes && (
          <div><strong>Referral Notes:</strong> {rx.referralNotes}</div>
        )}
        {rx.specialInstructions && (
          <div><strong>Special Instructions:</strong> {rx.specialInstructions}</div>
        )}
      </div>
    );
  };

  const renderSignature = () => (
    <div className="signature-block-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '8px', pageBreakInside: 'avoid' }}>
      <div style={{ fontSize: '8px', color: '#777', fontStyle: 'italic', width: '50%', lineHeight: '1.2' }}>
        * This is a digitally signed, authentic prescription issued by {clinicName || 'RK Clinic'}. Verification code on file.
      </div>
      <div style={{ textAlign: 'right', width: '220px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{
          fontFamily: 'cursive',
          fontStyle: 'italic',
          fontSize: '22px',
          color: '#107a82',
          marginRight: '20px',
          marginBottom: '-4px',
          lineHeight: '1'
        }}>
          {displayDoctorName}
        </div>

        <div style={{ width: '100%', borderTop: '1px solid #333', paddingTop: '4px', lineHeight: '1.3' }}>
          <strong style={{ fontSize: '11px', color: '#000', display: 'block' }}>{displayDoctorName}</strong>
          <span style={{ fontSize: '8.5px', color: '#555', display: 'block' }}>MBBS, MD | {doctorRole || 'CMO & Specialist'}</span>
          <span style={{ fontSize: '8px', color: '#777', display: 'block' }}>Reg No: 12345/IN</span>
        </div>
      </div>
    </div>
  );

  const renderFooter = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', borderTop: '1px solid #107a82', paddingTop: '4px', marginTop: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8px', color: '#555' }}>
        <span>Address: Safe Tower 123 Streets, Riyadh | Phone: +123 456 789 | Emergency: +123 999 888</span>
        <span style={{ color: '#107a82', fontWeight: 'bold' }}>RK CLINIC HEALTHCARE</span>
      </div>
    </div>
  );

  return (
    <div className="print-rx-modal-overlay" onClick={() => onClose?.()}>
      <div
        className="print-rx-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-rx-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
          <h3 className="modal-title" id="print-rx-title">Prescription Printout Preview</h3>
          <button
            ref={closeButtonRef}
            className="modal-close-btn"
            onClick={() => onClose?.()}
            aria-label="Close prescription preview"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="prescription-print-preview">
          <div className={`prescription-page ${layoutClass}`} style={{ boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div>
                {renderHeader()}
                {renderPatientInfo()}
              </div>

              <div style={{ display: 'flex', gap: '20px', flexGrow: 1, marginTop: '10px', minHeight: '0' }}>
                {/* Left column: vitals, complaints, investigations */}
                <div style={{ width: '32%', borderRight: '1px solid #e2e8f0', paddingRight: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {renderVitalsBlock()}
                  {renderSymptomsBlock()}
                  {renderInvestigations()}
                </div>

                {/* Right column: medicines table and handwriting */}
                <div style={{ width: '68%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {renderMeds()}
                  {renderHandwriting()}
                </div>
              </div>

              <div style={{ marginTop: '10px' }}>
                {renderFollowUp()}
                {renderSignature()}
                {renderFooter()}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '12px 0 0 0', backgroundColor: 'transparent', borderTop: 'none', marginTop: '16px' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onClose?.()}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => { window.print(); }}>Print Out</button>
        </div>
      </div>
    </div>
  );
}
