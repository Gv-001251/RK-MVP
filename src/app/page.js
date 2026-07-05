"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';

// Import Panels & LoginPage
// Helper component to slice the canvas handwriting snapshot to support seamless continuation on page breaks
// SlicedHandwriting removed - replaced with dynamic single-flow image container
import LoginPage from '../components/LoginPage';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import DashboardPanel from '../components/DashboardPanel';
import PatientsPanel from '../components/PatientsPanel';
import EmrPanel from '../components/EmrPanel';
import OpdPanel from '../components/OpdPanel';
import IpdPanel from '../components/IpdPanel';
import LaboratoryPanel from '../components/LaboratoryPanel';
import PharmacyPanel from '../components/PharmacyPanel';
import BillingPanel from '../components/BillingPanel';
import ReportsPanel from '../components/ReportsPanel';
import AdminPanel from '../components/AdminPanel';
import SettingsPanel from '../components/SettingsPanel';
import DoctorConsultationPanel from '../components/DoctorConsultationPanel';

// Missing Panels
import RadPanel from '../components/RadPanel';
import BackupPanel from '../components/BackupPanel';
import SchedulerPanel from '../components/SchedulerPanel';
import InsurancePanel from '../components/InsurancePanel';
import SterilizationPanel from '../components/SterilizationPanel';
import SuppliersPanel from '../components/SuppliersPanel';
import EmergencyPanel from '../components/EmergencyPanel';

export default function Home() {
  const {
    patients,
    inventory,
    nursingNotes,
    prescriptions,
    invoices,
    registerPatient,
    addMedicine,
    recordPayment,
    createInvoice,
    currency,
    doctorName,
    doctorRole,
    clinicName,
    user,
    activeRole
  } = useClinic();

  const displayDoctorName = doctorName ? (doctorName.startsWith('Dr.') ? doctorName : 'Dr. ' + doctorName) : 'Dr. Habiba Tithy';

  const [activePanel, setActivePanel] = useState('dashboard');
  const [drawerPatientId, setDrawerPatientId] = useState(patients[0]?.id || '');
  const [editPatientTarget, setEditPatientTarget] = useState(null);
  const [showPrintRxModal, setShowPrintRxModal] = useState(false);
  const [currentPrintRx, setCurrentPrintRx] = useState(null);

  useEffect(() => {
    if (activeRole === 'doctor' && activePanel === 'dashboard') {
      const timer = setTimeout(() => {
        setActivePanel('consultation');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeRole, activePanel]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPrintRxModal(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [activePanel]);

  const handleGlobalSearch = (query) => {
    if (query) {
      setActivePanel('registration');
    }
  };

  const renderActivePanel = () => {
    switch (activePanel) {
      case 'dashboard':
        return (
          <DashboardPanel 
            onOpenPatientProfile={(pId) => {
              setDrawerPatientId(pId);
              setActivePanel('emr');
            }} 
            onEditPatient={(p) => {
              setEditPatientTarget(p);
              setActivePanel('registration');
            }}
            onNavigateToTab={setActivePanel}
          />
        );
      case 'emr':
        return <EmrPanel initialSelectedPatientId={drawerPatientId} />;
      case 'consultation':
        return (
          <DoctorConsultationPanel 
            onPrintPrescription={(rx) => {
              setCurrentPrintRx(rx);
              setShowPrintRxModal(true);
            }} 
            onNavigateToTab={setActivePanel}
          />
        );
      case 'opd':
        return (
          <OpdPanel 
            onPrintPrescription={(rx) => {
              setCurrentPrintRx(rx);
              setShowPrintRxModal(true);
            }} 
            onNavigateToTab={setActivePanel}
          />
        );
      case 'ipd':
        return <IpdPanel />;
      case 'laboratory':
        return <LaboratoryPanel />;
      case 'registration':
        return (
          <PatientsPanel 
            onOpenPatientProfile={(pId) => {
              setDrawerPatientId(pId);
              setActivePanel('emr');
            }} 
            editPatientTarget={editPatientTarget}
            setEditPatientTarget={setEditPatientTarget}
          />
        );
      case 'pharmacy':
        return <PharmacyPanel />;
      case 'billing':
        return <BillingPanel />;
      case 'reports':
        return <ReportsPanel />;
      case 'admin':
        return <AdminPanel />;
      case 'settings':
        return <SettingsPanel />;
      case 'rad':
        return <RadPanel />;
      case 'sterilization':
        return <SterilizationPanel />;
      case 'backup':
        return <BackupPanel />;
      case 'scheduler':
        return <SchedulerPanel />;
      case 'insurance':
        return <InsurancePanel />;
      case 'suppliers':
        return <SuppliersPanel />;
      case 'emergency':
        return <EmergencyPanel />;
      case 'store':
        return (
          <div className="panel-card col-12" style={{ padding: '30px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>RK Clinic ERP Store & Inventory</h2>
            <p style={{ color: 'var(--text-muted)' }}>Main surgical store, consumable inventory, and procurement records are online. Logged under compliance audits.</p>
          </div>
        );
      default:
        return <DashboardPanel />;
    }
  };

  // If user is not logged in, render the secure Login Page
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app-container no-sidebar">
      <Sidebar activePanel={activePanel} setActivePanel={setActivePanel} />
      <main className="main-content">
        <Header 
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          onSearch={handleGlobalSearch} 
        />
        
        <div className="content-body">
          {renderActivePanel()}
        </div>
      </main>

      {/* MODAL OVERLAY: PRINT PRESCRIPTION PREVIEW */}
      {showPrintRxModal && currentPrintRx && (
        <div className="print-rx-modal-overlay">
          <div className="print-rx-modal-card">
            <div className="modal-header" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <h3 className="modal-title">Prescription Printout Preview</h3>
              <button className="modal-close-btn" onClick={() => setShowPrintRxModal(false)}>
                <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div className="prescription-print-preview">
              {(() => {
                const pat = patients.find(p => p.id === currentPrintRx.patientId);
                const ageText = pat ? `${pat.age} Y` : 'n/a';
                const genderText = pat?.gender || 'n/a';
                const diagnosisText = currentPrintRx.diagnosis || 'General OPD Consultation';

                const medCount = currentPrintRx.meds?.length || 0;
                const labCount = currentPrintRx.labTests?.length || 0;
                const totalItems = medCount + labCount;

                let layoutClass = '';
                if (totalItems > 10) {
                  layoutClass = 'extra-compact-layout';
                } else if (totalItems > 6) {
                  layoutClass = 'compact-layout';
                }

                // Dynamic canvas max height depending on items to prevent overflow
                let canvasMaxHeight = '6.5cm';
                if (totalItems > 10) {
                  canvasMaxHeight = '2.5cm';
                } else if (totalItems > 7) {
                  canvasMaxHeight = '4cm';
                } else if (totalItems > 4) {
                  canvasMaxHeight = '5cm';
                }

                // Vitals extraction helper
                const parseVital = (vitalsStr, label) => {
                  if (!vitalsStr) return '--';
                  const match = vitalsStr.match(new RegExp(label + '\\s*:\\s*([^,|]+)'));
                  if (!match) return '--';
                  return match[1].trim().replace(/\s*(bpm|°F|%|cm|kg|mg\/dL)$/i, '');
                };

                const displayDoctorName = doctorName ? (doctorName.startsWith('Dr.') ? doctorName : 'Dr. ' + doctorName) : 'Dr. R. Kumar';

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
                    {/* Left: Clinic Logo and Branding */}
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
                        <span style={{ fontSize: '16px', fontWeight: '900', letterSpacing: '0.5px', color: '#107a82' }}>{clinicName || "RK CLINIC"}</span>
                        <span style={{ fontSize: '8px', fontWeight: '700', letterSpacing: '0.8px', color: '#666', textTransform: 'uppercase' }}>Healthcare & Multi-Specialty Care</span>
                        <span style={{ fontSize: '7.5px', color: '#777', marginTop: '1px' }}>Ph: +966 11 456 7890 | info@rkclinic.com</span>
                      </div>
                    </div>

                    {/* Right: Doctor Details */}
                    <div style={{ textAlign: 'right', lineHeight: '1.3' }}>
                      <strong style={{ fontSize: '13px', color: '#107a82', display: 'block' }}>{displayDoctorName}</strong>
                      <span style={{ fontSize: '9px', color: '#333', fontWeight: '600', display: 'block' }}>MBBS, MD | {doctorRole || "CMO & Specialist"}</span>
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
                    <div style={{ textAlign: 'right' }}><strong>Date:</strong> <span style={{ color: '#000', fontWeight: '600' }}>{currentPrintRx.date}</span></div>
                    
                    <div style={{ gridColumn: 'span 2' }}>
                      <strong>Patient ID:</strong> <span style={{ fontFamily: 'monospace', color: '#000', fontWeight: '600' }}>{currentPrintRx.patientId}</span>
                    </div>
                    <div style={{ gridColumn: 'span 2', textAlign: 'right' }}>
                      <strong>Diagnosis:</strong> <span style={{ color: '#000', fontWeight: '600' }}>{diagnosisText}</span>
                    </div>
                  </div>
                );

                const renderVitalsBlock = () => {
                  if (!currentPrintRx.vitals) return null;
                  const bp = parseVital(currentPrintRx.vitals, 'BP');
                  const hr = parseVital(currentPrintRx.vitals, 'HR') || parseVital(currentPrintRx.vitals, 'Pulse');
                  const temp = parseVital(currentPrintRx.vitals, 'Temp');
                  const spo2 = parseVital(currentPrintRx.vitals, 'SpO2');
                  const sugar = parseVital(currentPrintRx.vitals, 'Sugar');
                  const wt = parseVital(currentPrintRx.vitals, 'Wt') || parseVital(currentPrintRx.vitals, 'Weight') || currentPrintRx.weight;
                  const bmi = parseVital(currentPrintRx.vitals, 'BMI');

                  return (
                    <div style={{ pageBreakInside: 'avoid', marginBottom: '10px' }}>
                      <strong style={{ fontSize: '11px', color: '#107a82', display: 'block', borderBottom: '1.5px solid #107a82', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        PATIENT VITALS:
                      </strong>
                      <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse' }}>
                        <tbody>
                          {bp && bp !== '--' && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>Blood Pressure:</td>
                              <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{bp} mmHg</td>
                            </tr>
                          )}
                          {hr && hr !== '--' && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>Heart Rate:</td>
                              <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{hr} bpm</td>
                            </tr>
                          )}
                          {temp && temp !== '--' && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>Temperature:</td>
                              <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{temp} °F</td>
                            </tr>
                          )}
                          {spo2 && spo2 !== '--' && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>SpO₂ Level:</td>
                              <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{spo2} %</td>
                            </tr>
                          )}
                          {sugar && sugar !== '--' && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>Blood Sugar:</td>
                              <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{sugar} mg/dL</td>
                            </tr>
                          )}
                          {wt && wt !== '--' && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>Weight:</td>
                              <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{wt} kg</td>
                            </tr>
                          )}
                          {bmi && bmi !== '--' && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 0', color: '#555', fontWeight: '600' }}>BMI:</td>
                              <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '700', color: '#000' }}>{bmi}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                };

                const renderSymptomsBlock = () => {
                  if (!currentPrintRx.symptoms) return null;
                  return (
                    <div style={{ pageBreakInside: 'avoid', marginBottom: '10px' }}>
                      <strong style={{ fontSize: '11px', color: '#107a82', display: 'block', borderBottom: '1.5px solid #107a82', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        CHIEF COMPLAINT:
                      </strong>
                      <div style={{ fontSize: '10.5px', color: '#333', lineHeight: '1.3', paddingLeft: '2px', fontWeight: '500' }}>
                        {currentPrintRx.symptoms}
                      </div>
                    </div>
                  );
                };

                const renderMeds = () => {
                  if (!currentPrintRx.meds || currentPrintRx.meds.length === 0) return null;
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
                          {currentPrintRx.meds.map((med, idx) => (
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
                  if (!currentPrintRx.labTests || currentPrintRx.labTests.length === 0) return null;
                  return (
                    <div style={{ marginTop: '10px', pageBreakInside: 'avoid' }}>
                      <strong style={{ fontSize: '11px', color: '#107a82', display: 'block', borderBottom: '1.5px solid #107a82', paddingBottom: '3px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        INVESTIGATIONS ADVISED:
                      </strong>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px', fontSize: '10.5px', paddingLeft: '2px', color: '#333' }}>
                        {currentPrintRx.labTests.map((test, index) => (
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
                  if (!currentPrintRx.canvasSnapshot) return null;
                  return (
                    <div className="handwriting-prescription-print-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px', pageBreakInside: 'avoid', backgroundColor: 'transparent' }}>
                      <img 
                        src={currentPrintRx.canvasSnapshot} 
                        alt="Doctor Handwriting" 
                        style={{ width: '100%', height: 'auto', maxHeight: canvasMaxHeight, objectFit: 'contain', display: 'block', opacity: 0.9 }} 
                      />
                    </div>
                  );
                };

                const renderFollowUp = () => {
                  if (!currentPrintRx.followUp && !currentPrintRx.specialInstructions && !currentPrintRx.referralNotes) return null;
                  return (
                    <div style={{ borderTop: '1.5px solid #107a82', paddingTop: '6px', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '2px', color: '#333' }}>
                      {currentPrintRx.followUp && (
                        <div><strong>Follow Up / Review:</strong> {currentPrintRx.followUp}</div>
                      )}
                      {currentPrintRx.referralNotes && (
                        <div><strong>Referral Notes:</strong> {currentPrintRx.referralNotes}</div>
                      )}
                      {currentPrintRx.specialInstructions && (
                        <div><strong>Special Instructions:</strong> {currentPrintRx.specialInstructions}</div>
                      )}
                    </div>
                  );
                };

                const renderSignature = () => (
                  <div className="signature-block-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '8px', pageBreakInside: 'avoid' }}>
                    <div style={{ fontSize: '8px', color: '#777', fontStyle: 'italic', width: '50%', lineHeight: '1.2' }}>
                      * This is a digitally signed, authentic prescription issued by {clinicName || "RK Clinic"}. Verification code on file.
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
                        <span style={{ fontSize: '8.5px', color: '#555', display: 'block' }}>MBBS, MD | {doctorRole || "CMO & Specialist"}</span>
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
                  <div className={`prescription-page ${layoutClass}`} style={{ boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                      <div>
                        {renderHeader()}
                        {renderPatientInfo()}
                      </div>

                      <div style={{ display: 'flex', gap: '20px', flexGrow: 1, marginTop: '10px', minHeight: '0' }}>
                        {/* Left column: Vitals, complaints, and investigations */}
                        <div style={{ width: '32%', borderRight: '1px solid #e2e8f0', paddingRight: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {renderVitalsBlock()}
                          {renderSymptomsBlock()}
                          {renderInvestigations()}
                        </div>

                        {/* Right column: Medicines table and doctor handwriting */}
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
                );
              })()}
            </div>
            
            <div className="modal-footer" style={{ padding: '12px 0 0 0', backgroundColor: 'transparent', borderTop: 'none', marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPrintRxModal(false)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={() => { window.print(); }}>Mock Print Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
