"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function SettingsPanel() {
  const {
    clinicName, setClinicName,
    doctorName, setDoctorName,
    doctorRole, setDoctorRole,
    currency, setCurrency,
    backups, runBackup
  } = useClinic();

  // Local state for fee, template header and alerts
  const [consultationFee, setConsultationFee] = useState('100');
  const [templateHeader, setTemplateHeader] = useState('Premium Specialty Clinics & Diagnostics');
  const [showSavedAlert, setShowSavedAlert] = useState(false);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setShowSavedAlert(true);
    setTimeout(() => setShowSavedAlert(false), 3000);
  };

  const handleRunBackup = () => {
    runBackup();
    alert("Database SQL Backup created successfully and stored in the secure backups directory.");
  };

  return (
    <div className="content-panel active">
      {/* Welcome Row */}
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>System Settings</h1>
          <p>Configure clinic properties, edit clinician credentials, and maintain database SQL backups.</p>
        </div>
      </div>

      {/* Save Success Banner */}
      {showSavedAlert && (
        <div style={{ padding: '12px 18px', backgroundColor: 'var(--teal-light)', borderLeft: '4px solid var(--teal)', borderRadius: 'var(--radius-sm)', marginBottom: '20px', color: 'var(--teal)', fontWeight: '600', fontSize: '14px' }}>
          ✓ Clinic settings and physician profiles updated successfully.
        </div>
      )}

      <div className="dashboard-grid">
        {/* LEFT COLUMN: SETTINGS FORM */}
        <div className="col-7" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 1: Clinic Info */}
          <div className="panel-card">
            <div className="panel-card-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }}>
              <h3 className="panel-card-title">
                <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', stroke: 'var(--primary)', fill: 'none' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                Clinic Organization Settings
              </h3>
            </div>
            
            <form onSubmit={handleSaveSettings}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Clinic / Center Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Preferred Currency Symbol</label>
                    <select
                      className="form-control"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    >
                      <option value="$">USD ($)</option>
                      <option value="₹">INR (₹)</option>
                      <option value="£">GBP (£)</option>
                      <option value="SAR">SAR (SAR)</option>
                      <option value="€">EUR (€)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>OPD Consultation Fee</label>
                    <input
                      type="number"
                      className="form-control"
                      value={consultationFee}
                      onChange={(e) => setConsultationFee(e.target.value)}
                      required
                      min="1"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Prescription Template Header Details</label>
                  <input
                    type="text"
                    className="form-control"
                    value={templateHeader}
                    onChange={(e) => setTemplateHeader(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="submit" className="btn btn-primary">
                    Save General Changes
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Card 2: Doctor Info */}
          <div className="panel-card">
            <div className="panel-card-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }}>
              <h3 className="panel-card-title">
                <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', stroke: 'var(--primary)', fill: 'none' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Physician Credentials & Credentials Settings
              </h3>
            </div>
            
            <form onSubmit={handleSaveSettings}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Doctor Full Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Clinical Specialization *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={doctorRole}
                      onChange={(e) => setDoctorRole(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Cabin Room Location</label>
                    <input
                      type="text"
                      className="form-control"
                      defaultValue="Cabin A - Ground Floor"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Clinician License/ID</label>
                    <input
                      type="text"
                      className="form-control"
                      defaultValue="LIC-MED-77631"
                      disabled
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="submit" className="btn btn-primary">
                    Update Clinician Vitals
                  </button>
                </div>
              </div>
            </form>
          </div>

        </div>

        {/* RIGHT COLUMN: DATABASE BACKUPS */}
        <div className="col-5">
          <div className="panel-card" style={{ height: '100%' }}>
            <div className="panel-card-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }}>
              <h3 className="panel-card-title">
                <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', stroke: 'var(--primary)', fill: 'none' }}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                Database SQL Backups
              </h3>
            </div>

            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '20px' }}>
              <p>Maintain data integrity by taking manual database snapshot backups. All patient logs, scripts, and invoices will be exported to a secure SQL container.</p>
              <button 
                className="btn btn-rose btn-sm" 
                onClick={handleRunBackup}
                style={{ width: '100%', marginTop: '14px', justifyContent: 'center' }}
              >
                ⚡ Run Manual SQL Backup
              </button>
            </div>

            <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: 'var(--text-primary)' }}>Backup Transaction Logs</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
              {backups.map((b, idx) => (
                <div key={idx} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{b.filename}</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{b.date} • Size: {b.size}</div>
                  </div>
                  <span style={{ 
                    fontSize: '9.5px', 
                    fontWeight: '700', 
                    padding: '2px 6px', 
                    borderRadius: '4px',
                    backgroundColor: b.type === 'Manual' ? 'var(--primary-light)' : 'var(--teal-light)',
                    color: b.type === 'Manual' ? 'var(--primary)' : 'var(--teal)',
                    textTransform: 'uppercase'
                  }}>
                    {b.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
