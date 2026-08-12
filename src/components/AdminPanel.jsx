"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';
import CriticalValueSettings from './CriticalValueSettings';
import DeltaCheckSettings from './DeltaCheckSettings';

export default function AdminPanel() {
  const {
    users,
    addUser,
    deleteUser
  } = useClinic();

  const [activeTab, setActiveTab] = useState('directory');
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const res = await fetch('/api/admin/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAuditLogs();
    }
  }, [activeTab]);

  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    role: 'doctor',
    email: '',
    cabin: ''
  });

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formData.username || !formData.fullName || !formData.email) {
      alert("Please fill in all required fields.");
      return;
    }
    
    // Check if user already exists
    const existing = users.find(u => u.username === formData.username);
    if (existing) {
      alert("Username already registered!");
      return;
    }

    addUser(formData);
    alert(`Staff member ${formData.fullName} added successfully.`);
    setFormData({
      username: '',
      fullName: '',
      role: 'doctor',
      email: '',
      cabin: ''
    });
  };

  // Define Permissions Matrix Data
  const permissionsMatrix = [
    { module: 'Dashboard', doctor: 'Read/Write', pharmacy: 'Read Only', frontdesk: 'Read Only', admin: 'Read/Write' },
    { module: 'Patients Directory', doctor: 'Read/Write', pharmacy: 'None', frontdesk: 'Read/Write', admin: 'Read/Write' },
    { module: 'EMR Portal (Patient 360)', doctor: 'Read/Write', pharmacy: 'Read Only', frontdesk: 'Read Only', admin: 'Read/Write' },
    { module: 'OPD Consultation', doctor: 'Read/Write', pharmacy: 'None', frontdesk: 'None', admin: 'Read/Write' },
    { module: 'Pharmacy Inventory', doctor: 'Read Only', pharmacy: 'Read/Write', frontdesk: 'None', admin: 'Read/Write' },
    { module: 'Billing Ledger', doctor: 'Read Only', pharmacy: 'Read Only', frontdesk: 'Read/Write', admin: 'Read/Write' },
    { module: 'Clinical Reports', doctor: 'Read Only', pharmacy: 'Read Only', frontdesk: 'None', admin: 'Read/Write' },
    { module: 'Staff Directory (Users)', doctor: 'None', pharmacy: 'None', frontdesk: 'None', admin: 'Read/Write' },
    { module: 'Clinic Settings', doctor: 'Read Only', pharmacy: 'None', frontdesk: 'None', admin: 'Read/Write' }
  ];

  const getBadgeClass = (right) => {
    if (right === 'Read/Write') return 'badge-emerald';
    if (right === 'Read Only') return 'badge-sky';
    return 'badge-rose';
  };

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Clinic Employee & User Directory</h1>
          <p>Register new staff members, set cabin designations, and configure security permissions.</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '10px', paddingBottom: '10px' }}>
        <button 
          onClick={() => setActiveTab('directory')}
          className={`btn ${activeTab === 'directory' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: '700' }}
        >
          👥 Staff Directory
        </button>
        <button 
          onClick={() => setActiveTab('audit')}
          className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: '700' }}
        >
          📋 Security Audit Logs
        </button>
        <button 
          onClick={() => setActiveTab('critical')}
          className={`btn ${activeTab === 'critical' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: '700' }}
        >
          🚨 Critical Values
        </button>
        <button 
          onClick={() => setActiveTab('delta')}
          className={`btn ${activeTab === 'delta' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: '700' }}
        >
          📈 Delta Checks
        </button>
      </div>

      {activeTab === 'directory' ? (
        <>
          <div className="dashboard-grid">
          {/* COLUMN 1: USER LIST DIRECTORY */}
        <div className="panel-card col-8">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Staff Members Directory ({users.length})</h3>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Duty Cabin</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.username}>
                    <td><code>{u.username}</code></td>
                    <td><strong>{u.fullName}</strong></td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-rose' : u.role === 'doctor' ? 'badge-sky' : 'badge-teal'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.email}</td>
                    <td>{u.cabin || 'n/a'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-rose btn-sm"
                        onClick={() => {
                          if (confirm(`Remove staff login for ${u.fullName}?`)) {
                            deleteUser(u.username);
                          }
                        }}
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                      >
                        Revoke Access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* COLUMN 2: REGISTRATION FORM */}
        <div className="panel-card col-4">
          <div className="panel-card-header" style={{ marginBottom: '16px' }}>
            <h3 className="panel-card-title">Register New Staff</h3>
          </div>
          <form onSubmit={handleAddSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Username *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="E.g. doctor_jen"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="E.g. Dr. Sarah Jenkins"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Staff Role *</label>
                <select
                  className="form-control"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="doctor">Doctor</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="admin">System Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-control"
                  required
                  placeholder="name@rkclinic.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Duty Cabin Location</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="E.g. Cabin B - First Floor"
                  value={formData.cabin}
                  onChange={(e) => setFormData({ ...formData, cabin: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
                Authorize Access Profile
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ROLE PERMISSIONS MATRIX */}
      <div className="dashboard-grid">
        <div className="panel-card col-12">
          <div className="panel-card-header" style={{ marginBottom: '16px' }}>
            <h3 className="panel-card-title">
              <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', stroke: 'var(--primary)', fill: 'none' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Role Permissions & Feature Access Matrix
            </h3>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ERP Application Modules (Tabs)</th>
                  <th>Doctor Privileges</th>
                  <th>Pharmacist Privileges</th>
                  <th>Front-Desk Privileges</th>
                  <th>Admin / Master Privileges</th>
                </tr>
              </thead>
              <tbody>
                {permissionsMatrix.map((p, idx) => (
                  <tr key={idx}>
                    <td><strong>{p.module}</strong></td>
                    <td>
                      <span className={`badge ${getBadgeClass(p.doctor)}`} style={{ fontSize: '10.5px' }}>{p.doctor}</span>
                    </td>
                    <td>
                      <span className={`badge ${getBadgeClass(p.pharmacy)}`} style={{ fontSize: '10.5px' }}>{p.pharmacy}</span>
                    </td>
                    <td>
                      <span className={`badge ${getBadgeClass(p.frontdesk)}`} style={{ fontSize: '10.5px' }}>{p.frontdesk}</span>
                    </td>
                    <td>
                      <span className={`badge ${getBadgeClass(p.admin)}`} style={{ fontSize: '10.5px' }}>{p.admin}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  ) : activeTab === 'critical' ? (
        /* CRITICAL VALUE SETTINGS */
        <CriticalValueSettings />
      ) : activeTab === 'delta' ? (
        /* DELTA CHECK SETTINGS */
        <DeltaCheckSettings />
      ) : (
        /* AUDIT LOGS VIEW */
        <div className="panel-card col-12" style={{ padding: '0px', borderRadius: '16px', overflow: 'hidden' }}>
          <div className="panel-card-header" style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 className="panel-card-title">🔐 Enterprise Activity & Audit Trail</h3>
          </div>
          {auditLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Querying security audit logs...</div>
          ) : auditLogs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit log events found. All security logs are clear.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Event Timestamp</th>
                    <th>Operator Profile</th>
                    <th>Action Signature</th>
                    <th>Module Reference</th>
                    <th>Entity Identifier</th>
                    <th>IP Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--text-secondary)' }}>{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                      <td><strong>{log.user_name || 'System Operator'}</strong></td>
                      <td>
                        <span className={`badge ${
                          log.action.includes('CREATE') ? 'badge-emerald' : 
                          log.action.includes('UPDATE') ? 'badge-amber' : 
                          log.action.includes('DELETE') ? 'badge-rose' : 'badge-sky'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{log.entity_type || 'Auth Log'}</td>
                      <td><code style={{ fontSize: '11px' }}>{log.entity_id || '--'}</code></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{log.ip_address || '127.0.0.1'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
