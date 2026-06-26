"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function EmrPanel({ initialSelectedPatientId }) {
  const {
    patients,
    nursingNotes,
    setNursingNotes,
    prescriptions,
    invoices,
    appointments,
    doctorName,
    currency
  } = useClinic();

  const [selectedPatientId, setSelectedPatientId] = useState(initialSelectedPatientId || patients[0]?.id || '');
  const [activeTab, setActiveTab] = useState('notes'); // notes, visits, prescriptions, billing
  
  // Note creation form state
  const [noteText, setNoteText] = useState('');
  const [notePriority, setNotePriority] = useState('Routine');

  // Adjust state during render when prop changes (React recommended pattern to avoid effect)
  const [prevInitialId, setPrevInitialId] = useState(initialSelectedPatientId);
  if (initialSelectedPatientId !== prevInitialId) {
    setPrevInitialId(initialSelectedPatientId);
    setSelectedPatientId(initialSelectedPatientId);
  }

  const patient = patients.find(p => p.id === selectedPatientId);

  // Filter notes, prescriptions, invoices, and visits for active patient
  const patientNotes = nursingNotes.filter(note => note.patientId === selectedPatientId);
  const patientPrescriptions = prescriptions.filter(rx => rx.patientId === selectedPatientId);
  const patientInvoices = invoices.filter(inv => inv.patientId === selectedPatientId);
  const patientAppointments = appointments.filter(app => app.patientId === selectedPatientId);

  // Handle adding clinical note inline
  const handleAddNote = (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    const newNote = {
      time: 'Just now',
      author: `Dr. ${doctorName}`,
      priority: notePriority,
      patientId: selectedPatientId,
      text: noteText
    };

    setNursingNotes(prev => [newNote, ...prev]);
    setNoteText('');
    setNotePriority('Routine');
  };

  return (
    <div className="content-panel active">
      {/* Welcome & Patient Selector Row */}
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Patient 360° EMR Profile</h1>
          <p>Complete Electronic Medical Records & clinical history overview.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>Select Patient:</span>
          <select
            className="form-control"
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            style={{ width: '240px', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
            ))}
          </select>
        </div>
      </div>

      {patient ? (
        <div className="dashboard-grid">
          {/* LEFT COLUMN: PERSONAL INFO & UPLOADED DOCUMENTS */}
          <div className="col-4" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* 1. PERSONAL INFO CARD */}
            <div className="panel-card" style={{ height: 'max-content' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
                <div className="patient-large-avatar" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontWeight: '700', fontSize: '20px', width: '50px', height: '50px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {patient.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{patient.name}</h2>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>ID: {patient.id}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Age & Gender</div>
                  <div className="detail-value" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginTop: '2px' }}>{patient.age} Years / {patient.gender}</div>
                </div>
                
                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Blood Group</div>
                  <div className="detail-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--primary)', marginTop: '2px' }}>{patient.blood}</div>
                </div>

                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Phone Contact</div>
                  <div className="detail-value" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginTop: '2px' }}>{patient.phone}</div>
                </div>

                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Email Address</div>
                  <div className="detail-value" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginTop: '2px' }}>{patient.email}</div>
                </div>

                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Known Allergies</div>
                  <div className="detail-value" style={{ fontSize: '14px', fontWeight: '600', color: patient.allergies !== 'None' ? 'var(--rose)' : 'var(--text-primary)', marginTop: '2px' }}>
                    {patient.allergies}
                  </div>
                </div>

                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Emergency Contact</div>
                  <div className="detail-value" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginTop: '2px' }}>{patient.emergencyContact}</div>
                </div>

                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Residential Address</div>
                  <div className="detail-value" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginTop: '2px' }}>{patient.address}</div>
                </div>

                <div className="detail-block">
                  <div className="detail-label" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Record Created</div>
                  <div className="detail-value" style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{patient.createdDate}</div>
                </div>
              </div>
            </div>

            {/* 2. UPLOADED DOCUMENTS CARD */}
            <div className="panel-card" style={{ height: 'max-content' }}>
              <div className="panel-card-header" style={{ marginBottom: '16px' }}>
                <h3 className="panel-card-title" style={{ fontSize: '15px' }}>
                  <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', stroke: 'var(--primary)', fill: 'none' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Uploaded Documents
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)' }}>
                  <span style={{ fontWeight: '500', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📄</span> Complete Blood Count.pdf
                  </span>
                  <a href="#" onClick={(e) => { e.preventDefault(); alert("Blood Count Report file download simulated!"); }} style={{ color: 'var(--primary)', fontWeight: '700', textDecoration: 'none' }}>Download</a>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)' }}>
                  <span style={{ fontWeight: '500', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📄</span> Cardiology Stress Test.pdf
                  </span>
                  <a href="#" onClick={(e) => { e.preventDefault(); alert("Stress Test Report download simulated!"); }} style={{ color: 'var(--primary)', fontWeight: '700', textDecoration: 'none' }}>Download</a>
                </div>
                
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => alert("Upload document simulation triggered! Select files...")}
                  style={{ marginTop: '10px', justifyContent: 'center', fontSize: '12px', padding: '8px 12px' }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Upload New Document
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: TABBED HISTORY LAYOUT */}
          <div className="col-8 panel-card" style={{ minHeight: '500px' }}>
            
            {/* Tab Headers */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', paddingBottom: '0', marginBottom: '24px', gap: '8px', overflowX: 'auto' }}>
              <button 
                className={`btn ${activeTab === 'notes' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab === 'notes' ? '3px solid var(--primary)' : 'none', padding: '10px 16px', fontSize: '13px', backgroundColor: activeTab === 'notes' ? 'var(--primary-light)' : 'transparent', color: activeTab === 'notes' ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: 'none' }}
                onClick={() => setActiveTab('notes')}
              >
                Doctor Notes Timeline ({patientNotes.length})
              </button>
              <button 
                className={`btn ${activeTab === 'visits' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab === 'visits' ? '3px solid var(--primary)' : 'none', padding: '10px 16px', fontSize: '13px', backgroundColor: activeTab === 'visits' ? 'var(--primary-light)' : 'transparent', color: activeTab === 'visits' ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: 'none' }}
                onClick={() => setActiveTab('visits')}
              >
                Visit History ({patientAppointments.length})
              </button>
              <button 
                className={`btn ${activeTab === 'prescriptions' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab === 'prescriptions' ? '3px solid var(--primary)' : 'none', padding: '10px 16px', fontSize: '13px', backgroundColor: activeTab === 'prescriptions' ? 'var(--primary-light)' : 'transparent', color: activeTab === 'prescriptions' ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: 'none' }}
                onClick={() => setActiveTab('prescriptions')}
              >
                Prescription History ({patientPrescriptions.length})
              </button>
              <button 
                className={`btn ${activeTab === 'billing' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab === 'billing' ? '3px solid var(--primary)' : 'none', padding: '10px 16px', fontSize: '13px', backgroundColor: activeTab === 'billing' ? 'var(--primary-light)' : 'transparent', color: activeTab === 'billing' ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: 'none' }}
                onClick={() => setActiveTab('billing')}
              >
                Billing History ({patientInvoices.length})
              </button>
            </div>

            {/* TAB CONTENT AREAS */}
            
            {/* TAB 1: DOCTOR NOTES TIMELINE */}
            {activeTab === 'notes' && (
              <div>
                {/* Form to add note */}
                <form onSubmit={handleAddNote} className="panel-card" style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: '24px', boxShadow: 'none' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: 'var(--text-primary)' }}>Add New Clinical / Nursing Note</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Type diagnostic findings, vitals, nursing notes, or care instructions..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontSize: '13px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Priority:</span>
                        <select
                          className="form-control"
                          value={notePriority}
                          onChange={(e) => setNotePriority(e.target.value)}
                          style={{ padding: '4px 8px', fontSize: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                        >
                          <option value="Routine">Routine</option>
                          <option value="Warning">Warning</option>
                          <option value="Critical">Critical</option>
                        </select>
                      </div>
                      <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '6px 14px', fontSize: '12.5px' }}>
                        Post Note
                      </button>
                    </div>
                  </div>
                </form>

                {/* Timeline Feed */}
                <div className="timeline-feed" style={{ paddingLeft: '20px', borderLeft: '2px solid var(--border-color)', marginLeft: '10px' }}>
                  {patientNotes.length > 0 ? (
                    patientNotes.map((note, idx) => (
                      <div key={idx} className="timeline-note-item" style={{ position: 'relative', marginBottom: '20px', paddingBottom: '12px' }}>
                        <span 
                          className="timeline-note-dot" 
                          style={{ 
                            position: 'absolute',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: note.priority === 'Critical' ? 'var(--rose)' : note.priority === 'Warning' ? 'var(--amber)' : 'var(--teal)',
                            left: '-26px',
                            top: '4px',
                            border: '2px solid var(--bg-surface)'
                          }} 
                        />
                        <div className="timeline-note-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '13.5px' }}>{note.author}</strong>
                          <span>{note.time}</span>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ 
                            display: 'inline-block', 
                            padding: '2px 8px', 
                            fontSize: '9.5px', 
                            fontWeight: '700', 
                            borderRadius: '4px',
                            backgroundColor: note.priority === 'Critical' ? 'var(--rose-light)' : note.priority === 'Warning' ? 'var(--amber-light)' : 'var(--teal-light)',
                            color: note.priority === 'Critical' ? 'var(--rose)' : note.priority === 'Warning' ? 'var(--amber)' : 'var(--teal)',
                            textTransform: 'uppercase'
                          }}>
                            {note.priority}
                          </span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', backgroundColor: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--border-color)' }}>
                          {note.text}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No clinical notes found for this patient.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: VISIT HISTORY */}
            {activeTab === 'visits' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Scheduled & Past Consultations</h4>
                {patientAppointments.length > 0 ? (
                  <div className="table-responsive">
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                          <th style={{ padding: '10px' }}>Date & Time</th>
                          <th style={{ padding: '10px' }}>Facility / Location</th>
                          <th style={{ padding: '10px' }}>Type</th>
                          <th style={{ padding: '10px' }}>Consultation Reason / Title</th>
                          <th style={{ padding: '10px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientAppointments.map((app, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '10px' }}>
                              <strong>{app.date}</strong><br />
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{app.time}</span>
                            </td>
                            <td style={{ padding: '10px' }}>{app.hospital}</td>
                            <td style={{ padding: '10px', textTransform: 'capitalize' }}>
                              <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', backgroundColor: app.type === 'procedure' ? 'var(--amber-light)' : 'var(--primary-light)', color: app.type === 'procedure' ? 'var(--amber)' : 'var(--primary)' }}>
                                {app.type}
                              </span>
                            </td>
                            <td style={{ padding: '10px' }}>{app.title}</td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ color: 'var(--teal)', fontWeight: '600' }}>{app.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No recorded visit history found.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: PRESCRIPTION HISTORY */}
            {activeTab === 'prescriptions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Prescribed Medications & Instructions</h4>
                {patientPrescriptions.length > 0 ? (
                  patientPrescriptions.map((rx, idx) => (
                    <div key={idx} className="panel-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', boxShadow: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '12px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>DATE: {rx.date}</span>
                          <h5 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>Rx ID: {rx.id}</h5>
                        </div>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => {
                            alert(`Simulating printing prescription Rx: ${rx.id}\nDiagnosis: ${rx.diagnosis}\nMeds: ${rx.meds.length} items`);
                          }}
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                        >
                          🖨️ Print Rx
                        </button>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Diagnosis</span>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>{rx.diagnosis}</div>
                      </div>

                      {rx.symptoms && (
                        <div style={{ marginBottom: '12px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Symptoms / Observations</span>
                          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{rx.symptoms}</div>
                        </div>
                      )}

                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Prescribed Medications</span>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px dashed var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '4px' }}>Medicine</th>
                              <th style={{ padding: '4px' }}>Instructions</th>
                              <th style={{ padding: '4px' }}>Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rx.meds.map((med, medIdx) => (
                              <tr key={medIdx} style={{ borderBottom: '1px dashed var(--border-color)' }}>
                                <td style={{ padding: '6px 4px' }}><strong>{med.name}</strong></td>
                                <td style={{ padding: '6px 4px' }}>{med.dose}</td>
                                <td style={{ padding: '6px 4px' }}>{med.duration}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No recorded prescriptions found.
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: BILLING HISTORY */}
            {activeTab === 'billing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Patient Invoices & Payment Ledger</h4>
                {patientInvoices.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {patientInvoices.map((inv, idx) => (
                      <div key={idx} className="panel-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', boxShadow: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '12px' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>DATE: {inv.date}</span>
                            <h5 style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>Invoice: {inv.id}</h5>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              padding: '4px 10px', 
                              fontSize: '11px', 
                              fontWeight: '700', 
                              borderRadius: '20px', 
                              backgroundColor: inv.status === 'Paid' ? 'var(--teal-light)' : inv.status === 'Partial' ? 'var(--amber-light)' : 'var(--rose-light)',
                              color: inv.status === 'Paid' ? 'var(--teal)' : inv.status === 'Partial' ? 'var(--amber)' : 'var(--rose)'
                            }}>
                              {inv.status}
                            </span>
                            <button 
                              className="btn btn-secondary btn-sm" 
                              onClick={() => alert(`Simulating invoice print preview: ${inv.id}\nAmount: ${currency}${inv.amount}`)}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              🖨️ Print
                            </button>
                          </div>
                        </div>

                        {/* Invoice Items */}
                        <div style={{ marginBottom: '12px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Billed Services</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                            {inv.items.map((item, itemIdx) => (
                              <div key={itemIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                <span>{item.desc}</span>
                                <strong>{currency}{item.price.toFixed(2)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Payment Method: <strong>{inv.mode}</strong>
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                            Total Amount: <strong style={{ color: 'var(--primary)', fontSize: '16px' }}>{currency}{inv.amount.toFixed(2)}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No invoice transactions recorded for this patient.
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      ) : (
        <div className="panel-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No patient records exist. Please register a patient first in the Patients tab.
        </div>
      )}

    </div>
  );
}
