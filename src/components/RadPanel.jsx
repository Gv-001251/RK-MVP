"use client";

import React from 'react';
import { useClinic } from '../context/ClinicContext';

export default function RadPanel() {
  const { inpatients, patients } = useClinic();

  return (
    <div className="content-panel active">
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>RAD Diagnostics & IPD Admissions</h1>
          <p>Inspect radiograph imaging files, ECG results, and admitted inpatient ward beds allocations.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Admitted list */}
        <div className="panel-card col-12">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Active Ward Admitted Inpatients</h3>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ward Bed</th>
                  <th>Patient ID</th>
                  <th>Patient Name</th>
                  <th>Diagnosis</th>
                  <th>Admit Date</th>
                  <th>Latest Observation Vitals</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inpatients.map((ip, idx) => {
                  const pat = patients.find(p => p.id === ip.patientId);
                  return (
                    <tr key={idx}>
                      <td><span className="badge badge-sky" style={{ textTransform: 'none' }}>{ip.bed}</span></td>
                      <td><code>{ip.patientId}</code></td>
                      <td><strong>{pat ? pat.name : 'Unknown'}</strong></td>
                      <td>{ip.diagnosis}</td>
                      <td>{ip.date}</td>
                      <td><code>{ip.vitals}</code></td>
                      <td>
                        <span className={`badge ${ip.billing.includes('Covered') ? 'badge-emerald' : 'badge-amber'}`}>
                          {ip.billing}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Diagnostics simulation cards */}
      <div className="dashboard-grid">
        <div className="panel-card col-6">
          <div className="panel-card-header">
            <h3 className="panel-card-title">ECG Wave Analysis</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
            <svg width="90%" height="100" viewBox="0 0 300 100" style={{ overflow: 'visible' }}>
              <path d="M 0 50 L 30 50 L 40 40 L 50 60 L 60 50 L 100 50 L 105 10 L 115 90 L 125 50 L 170 50 L 175 40 L 180 50 L 210 50 L 215 10 L 225 90 L 235 50 L 300 50" fill="none" stroke="var(--rose)" strokeWidth="2.5" />
            </svg>
          </div>
        </div>
        <div className="panel-card col-6">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Diagnostic Imaging Logs</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <strong>Chest X-Ray AP View</strong><br />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Patient: Faraj Bin Ahmad | June 03, 2026</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => alert("Simulated X-Ray image viewing!")}>View Scan</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <strong>Cardiac Echocardiography Report</strong><br />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Patient: Fayruz Husniya | June 02, 2026</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => alert("Simulated Echocardiography report viewing!")}>View Scan</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
