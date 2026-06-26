"use client";

import React from 'react';
import { useClinic } from '../context/ClinicContext';

export default function InsurancePanel() {
  const { invoices, patients } = useClinic();

  // Find insurance claims (invoices with mode 'Insurance')
  const claims = invoices.filter(inv => inv.mode === 'Insurance');

  return (
    <div className="content-panel active">
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Insurance Pre-Authorizations</h1>
          <p>Track insurance billing, verify pre-auth codes, and submit claim settlements.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel-card col-12">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Pending Claims & Pre-Authorizations</h3>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Patient</th>
                  <th>Claim Amount</th>
                  <th>Status</th>
                  <th>Verification Code</th>
                  <th>Submitted Date</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim, idx) => {
                  const pat = patients.find(p => p.id === claim.patientId);
                  return (
                    <tr key={claim.id}>
                      <td><code>{claim.id}</code></td>
                      <td><strong>{pat ? pat.name : 'Unknown'}</strong> ({claim.patientId})</td>
                      <td>${claim.amount.toFixed(2)}</td>
                      <td>
                        <span className={`badge ${claim.status === 'Paid' ? 'badge-emerald' : 'badge-amber'}`}>
                          {claim.status === 'Paid' ? 'Settled' : 'Pre-Auth / Pending'}
                        </span>
                      </td>
                      <td><code>AUTH-TX-{claim.id.split('-')[2]}</code></td>
                      <td>{claim.date}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
