"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function BackupPanel() {
  const {
    backups,
    runBackup
  } = useClinic();

  const [backingUp, setBackingUp] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleStartBackup = () => {
    if (backingUp) return;
    setBackingUp(true);
    setProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          runBackup();
          setBackingUp(false);
          alert("Database SQL backup created successfully.");
          return 0;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleDownloadFile = (filename) => {
    const textContent = `-- RK Clinic SQL Database Dump\n-- Generated on: ${new Date().toLocaleString()}\n-- File: ${filename}\n\nSELECT * FROM patients;\nSELECT * FROM consultations;\nSELECT * FROM medicines;\nSELECT * FROM invoices;\n`;
    const encodedUri = encodeURI("data:text/plain;charset=utf-8," + textContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`Downloading database dump: ${filename}`);
  };

  return (
    <div className="content-panel active">
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Database Backups</h1>
          <p>Export clinical registers, download database state dumps, and restore clinic historical indexes.</p>
        </div>
        <div className="action-buttons-group" style={{ alignItems: 'center' }}>
          {backingUp && (
            <div style={{ marginRight: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>pg_dump executing... {progress}%</span>
              <div style={{ width: '150px', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--primary)' }} />
              </div>
            </div>
          )}
          <button 
            className="btn btn-rose" 
            onClick={handleStartBackup}
            disabled={backingUp}
          >
            {backingUp ? 'Exporting SQL...' : 'Run Manual SQL Backup'}
          </button>
        </div>
      </div>

      {/* BACKUP FILES HISTORY */}
      <div className="dashboard-grid">
        <div className="panel-card col-12">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Local Backup Archives History</h3>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SQL Dump Filename</th>
                  <th>Creation Date & Time</th>
                  <th>Archive Size</th>
                  <th>Trigger Mode</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.filename}>
                    <td><code>{b.filename}</code></td>
                    <td>{b.date}</td>
                    <td>{b.size}</td>
                    <td>
                      <span className={`badge ${b.type === 'Manual' ? 'badge-sky' : 'badge-emerald'}`}>
                        {b.type}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleDownloadFile(b.filename)}
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                      >
                        Download Dump File
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
