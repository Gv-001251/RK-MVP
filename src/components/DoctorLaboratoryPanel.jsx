"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function DoctorLaboratoryPanel() {
  const {
    patients,
    labOrders,
    labTasks,
    doctorName
  } = useClinic();

  // Active patient selection state (defaults to Al Amin)
  const [selectedPatientId, setSelectedPatientId] = useState('PAT-000001');
  const [searchQuery, setSearchQuery] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [modalTask, setModalTask] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Helper to map LIS internal statuses to doctor-friendly, clinically-aligned statuses
  const mapStatus = (status) => {
    switch (status) {
      case 'Pending Sample Collection':
      case 'Ordered':
        return 'Ordered';
      case 'Sample Collected':
      case 'Collected':
        return 'Sample Collected';
      case 'Sample Registered':
        return 'Sample Registered';
      case 'Processing':
      case 'Assigned':
        return 'Processing';
      case 'Analyzer Running':
        return 'Analyzer Running';
      case 'QC Verification':
        return 'QC Verification';
      case 'Pending Verification':
      case 'Machine Completed':
        return 'Verification Pending';
      case 'Verified':
      case 'Completed':
        return 'Completed';
      case 'Report Generated':
        return 'Report Generated';
      case 'Report Delivered':
      case 'Delivered':
        return 'Delivered';
      default:
        return status || 'Ordered';
    }
  };

  // Mapped status badge style
  const getStatusBadgeClass = (status) => {
    const mapped = mapStatus(status);
    switch (mapped) {
      case 'Ordered':
        return 'badge-amber';
      case 'Sample Collected':
      case 'Sample Registered':
        return 'badge-sky';
      case 'Processing':
      case 'Analyzer Running':
        return 'badge-indigo';
      case 'QC Verification':
      case 'Verification Pending':
        return 'badge-cyan';
      case 'Completed':
      case 'Report Generated':
        return 'badge-emerald';
      case 'Delivered':
        return 'badge-teal';
      default:
        return 'badge-secondary';
    }
  };

  // Patient search filtering logic (Search by Name, ID, Mobile Number)
  const filteredPatients = patients.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return p.id.toLowerCase().includes(q) ||
           p.name.toLowerCase().includes(q) ||
           p.phone.includes(q);
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId) || patients[0];

  // Retrieve lab orders and tasks for a specific patient
  const getPatientOrders = (pId) => {
    const orders = labOrders.filter(o => o.patientId === pId).map(o => ({
      orderNumber: o.labOrderNumber,
      tests: o.orderedTests,
      date: o.orderTime,
      status: o.status,
      notes: o.notes || ''
    }));

    const tasks = labTasks.filter(t => t.clinicPatientId === pId || t.patientId === pId).map(t => {
      const suffix = pId.replace('PAT-', '');
      const dateLabel = t.verifiedAt || t.completedAt || 'Recent';
      return {
        orderNumber: `LAB-${suffix}`,
        tests: t.orderedTests,
        date: dateLabel,
        status: t.status,
        notes: t.remarks || '',
        rawTask: t
      };
    });

    const merged = {};
    orders.forEach(o => { merged[o.orderNumber] = o; });
    tasks.forEach(t => { merged[t.orderNumber] = t; });
    
    return Object.values(merged).sort((a, b) => new Date(b.date.split(' ')[0]) - new Date(a.date.split(' ')[0]));
  };

  const patientOrders = getPatientOrders(selectedPatientId);

  // Retrieve all recent laboratory orders across all patients
  const getRecentLabOrders = () => {
    const orders = labOrders.map(o => ({
      patientName: o.patientName,
      patientId: o.patientId,
      tests: o.orderedTests,
      status: o.status,
      date: o.orderTime,
      orderNumber: o.labOrderNumber
    }));

    const tasks = labTasks.map(t => ({
      patientName: t.patientName,
      patientId: t.clinicPatientId || t.patientId,
      tests: t.orderedTests,
      status: t.status,
      date: t.verifiedAt || t.completedAt || 'Recent',
      orderNumber: `LAB-${(t.clinicPatientId || t.patientId).replace('PAT-', '')}`
    }));

    const merged = [];
    const seen = new Set();
    
    // Tasks are more progressive, prioritize them
    tasks.forEach(t => {
      const key = `${t.patientId}-${t.tests.join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(t);
      }
    });
    
    orders.forEach(o => {
      const key = `${o.patientId}-${o.tests.join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(o);
      }
    });

    return merged.sort((a, b) => new Date(b.date.split(' ')[0]) - new Date(a.date.split(' ')[0]));
  };

  const recentOrdersList = getRecentLabOrders();

  // Helper to parse individual parameter observations from test result strings
  const parseParameters = (task) => {
    if (!task || !task.testResults) return {};
    const params = {};
    Object.keys(task.testResults).forEach(testName => {
      const resultObj = task.testResults[testName];
      if (!resultObj || !resultObj.val) return;
      const lines = resultObj.val.split(/,|\n/);
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const paramName = parts[0].trim();
          const paramValue = parts.slice(1).join(':').trim();
          params[paramName] = paramValue;
        } else {
          params[testName] = line.trim();
        }
      });
    });
    return params;
  };

  // Retrieve abnormal results alerts (High/Low/Critical) for the selected patient
  const getAbnormalResults = (pId) => {
    const tasks = labTasks.filter(t => t.clinicPatientId === pId || t.patientId === pId);
    const abnormals = [];
    tasks.forEach(task => {
      if (!task.testResults) return;
      Object.keys(task.testResults).forEach(testName => {
        const resultObj = task.testResults[testName];
        if (!resultObj || !resultObj.val) return;
        const lines = resultObj.val.split(/,|\n/);
        lines.forEach(line => {
          const isHigh = /high/i.test(line);
          const isLow = /low/i.test(line);
          const isCritical = /critical/i.test(line) || /abnormal/i.test(line);
          
          if (isHigh || isLow || isCritical) {
            // Clean value from parenthesis
            const refMatch = line.match(/\(Ref:\s*([^)]+)\)/);
            const refRange = refMatch ? refMatch[1] : 'n/a';
            const cleanVal = line.split('(')[0].replace(new RegExp(testName + '\\s*:\\s*', 'i'), '').trim();
            const paramName = line.split(':')[0] || testName;
            
            abnormals.push({
              date: task.verifiedAt ? task.verifiedAt.split(' ')[0] : 'Recent',
              testName: paramName,
              value: cleanVal,
              refRange,
              flag: isCritical ? 'Critical' : isHigh ? 'High' : 'Low'
            });
          }
        });
      });
    });
    return abnormals;
  };

  const patientAbnormalResults = getAbnormalResults(selectedPatientId);

  // Retrieve all abnormal results alerts (High/Low/Critical) across all patients for clinic-wide monitoring
  const getAllClinicalAlerts = () => {
    const alerts = [];
    labTasks.forEach(task => {
      if (!task.testResults) return;
      Object.keys(task.testResults).forEach(testName => {
        const resultObj = task.testResults[testName];
        if (!resultObj || !resultObj.val) return;
        const lines = resultObj.val.split(/,|\n/);
        lines.forEach(line => {
          const isHigh = /high/i.test(line);
          const isLow = /low/i.test(line);
          const isCritical = /critical/i.test(line) || /abnormal/i.test(line);
          
          if (isHigh || isLow || isCritical) {
            const paramName = line.split(':')[0] || testName;
            const cleanVal = line.split('(')[0].replace(new RegExp(testName + '\\s*:\\s*', 'i'), '').trim();
            
            alerts.push({
              patientId: task.clinicPatientId || task.patientId,
              patientName: task.patientName,
              testName: paramName,
              value: cleanVal,
              flag: isCritical ? 'Critical' : isHigh ? 'High' : 'Low',
              date: task.verifiedAt ? task.verifiedAt.split(' ')[0] : 'Recent'
            });
          }
        });
      });
    });
    return alerts;
  };

  const allClinicalAlerts = getAllClinicalAlerts();

  // Completed verified tasks for report access
  const completedReports = patientOrders.filter(o => o.status === 'Verified' || o.status === 'Completed' || o.rawTask?.status === 'Verified');

  // Compare previous reports render
  const renderCompareReports = () => {
    const verifiedTasks = labTasks.filter(t => 
      t.status === 'Verified' && 
      (t.clinicPatientId === selectedPatientId || t.patientId === selectedPatientId)
    );

    const reportsData = verifiedTasks.map(t => {
      const dateLabel = t.verifiedAt ? t.verifiedAt.split(' ')[0] : 'Recent';
      const params = parseParameters(t);
      return {
        date: dateLabel,
        taskId: t.taskId,
        params
      };
    });

    const allParams = Array.from(new Set(reportsData.flatMap(r => Object.keys(r.params))));

    return (
      <div className="panel-card" style={{ padding: '20px', borderRadius: '16px', animation: 'fadeIn 0.25s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13.5px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)', margin: 0 }}>
            📊 Diagnostic Parameter Comparison — {selectedPatient?.name}
          </h3>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm" 
            onClick={() => setShowCompareModal(false)}
            style={{ padding: '4px 10px', fontSize: '11px' }}
          >
            ✕ Close Comparison
          </button>
        </div>

        {reportsData.length < 2 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12.5px' }}>
            At least two completed reports are required to compare parameter progression. This patient currently has {reportsData.length} completed report(s).
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ borderBottom: '2.5px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '750', color: 'var(--text-secondary)' }}>Biomarker / Test Analyte</th>
                  {reportsData.map(r => (
                    <th key={r.taskId} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '750', color: 'var(--text-secondary)' }}>
                      Date: {r.date} <br />
                      <small style={{ color: 'var(--text-muted)', fontSize: '9.5px', fontWeight: '400' }}>{r.taskId}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allParams.map((param, idx) => (
                  <tr key={param} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--text-primary)' }}>{param}</td>
                    {reportsData.map(r => {
                      const val = r.params[param] || 'Not Tested';
                      const isHigh = /high/i.test(val);
                      const isLow = /low/i.test(val);
                      const isCritical = /critical/i.test(val) || /abnormal/i.test(val);

                      let style = { padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)' };
                      if (isCritical) {
                        style.color = 'var(--rose)';
                        style.fontWeight = '800';
                      } else if (isHigh || isLow) {
                        style.color = 'var(--amber)';
                        style.fontWeight = '700';
                      }

                      return (
                        <td key={r.taskId} style={style}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Dynamic inline styles block */}
      <style>{`
        .doctor-lab-layout {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 20px;
          align-items: stretch;
        }

        .doctor-lab-sidebar {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-shadow: var(--shadow-sm);
        }

        .doctor-lab-main {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .search-input-wrapper {
          position: relative;
          width: 100%;
        }

        .search-input-wrapper input {
          width: 100%;
          padding: 9px 12px 9px 34px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 13px;
          outline: none;
          background-color: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.2s;
        }

        .search-input-wrapper input:focus {
          border-color: var(--primary);
        }

        .search-input-wrapper svg {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          stroke: var(--text-secondary);
          fill: none;
          stroke-width: 2.2;
        }

        .patient-card-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: 250px;
        }

        .recent-orders-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: 300px;
        }

        .lab-order-row-item {
          border: 1px solid var(--border-color);
          background-color: var(--bg-primary);
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          text-align: left;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: all 0.2s;
        }

        .lab-order-row-item:hover {
          border-color: var(--primary);
          background-color: rgba(79, 70, 229, 0.02);
        }

        .lab-order-row-item.active {
          border-color: var(--primary);
          background-color: rgba(79, 70, 229, 0.05);
          box-shadow: 0 0 0 1px var(--primary);
        }

        .report-actions-wrapper {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .critical-alert-card {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Success Notification Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#0f172a',
          color: '#34d399',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
          zIndex: 1000,
          fontSize: '13px',
          fontWeight: '700',
          borderLeft: '4px solid #10b981',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Info Panel */}
      <div className="panel-card" style={{ padding: '16px 20px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>🔬</span>
          <div>
            <h2 style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)', margin: 0 }}>Laboratory Results & Orders Workspace</h2>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Review patient investigations, monitor diagnostic order statuses, and access certified report PDFs.</span>
          </div>
        </div>
      </div>

      {/* Main Grid Workstation */}
      <div className="doctor-lab-layout">
        
        {/* Left Hand: Patient Search & Recent Lab Orders Feed */}
        <aside className="doctor-lab-sidebar">
          
          {/* Patient Search Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <strong style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>🔍 Patient Registry Search</strong>
            <div className="search-input-wrapper">
              <input 
                type="text" 
                placeholder="Search ID, Name, or Mobile No..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            
            <div className="patient-card-list">
              {filteredPatients.map(p => {
                const isSelected = selectedPatientId === p.id;
                return (
                  <button
                    key={p.id}
                    className={`lab-order-row-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setShowCompareModal(false); // reset comparison
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span className="badge badge-sky" style={{ fontSize: '9px', fontWeight: '700' }}>{p.id}</span>
                      <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>{p.phone}</span>
                    </div>
                    <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px' }}>{p.name}</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{p.age} Y / {p.gender}</div>
                  </button>
                );
              })}
              {filteredPatients.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No matching patients found.
                </div>
              )}
            </div>
          </div>

          {/* Recent Lab Orders Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <strong style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>📋 Recent Laboratory Orders</strong>
            <div className="recent-orders-list">
              {recentOrdersList.map((order, idx) => {
                const isSelected = selectedPatientId === order.patientId;
                return (
                  <button
                    key={`${order.orderNumber}-${idx}`}
                    className={`lab-order-row-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedPatientId(order.patientId);
                      setShowCompareModal(false);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{order.patientName}</strong>
                      <span className={`badge ${getStatusBadgeClass(order.status)}`} style={{ fontSize: '9px' }}>
                        {mapStatus(order.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                      <strong>Tests:</strong> {order.tests.join(', ')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      <span>Order: {order.orderNumber}</span>
                      <span>{order.date}</span>
                    </div>
                  </button>
                );
              })}
              {recentOrdersList.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No recent laboratory orders found.
                </div>
              )}
            </div>
          </div>

        </aside>

        {/* Right Hand: Patient Diagnostic Workspace details */}
        <main className="doctor-lab-main">
          
          {/* Patient Header & Vitals Summary */}
          <div className="panel-card" style={{ padding: '16px 20px', borderRadius: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Patient Name</span>
                <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>{selectedPatient?.name}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Patient ID</span>
                <strong style={{ fontSize: '13.5px', color: 'var(--primary)' }}>{selectedPatient?.id}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Age / Gender</span>
                <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>{selectedPatient?.age} Y / {selectedPatient?.gender}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Blood Group</span>
                <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>{selectedPatient?.blood}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Allergies</span>
                <span className="badge badge-rose" style={{ fontSize: '10px', marginTop: '2px', display: 'inline-block' }}>{selectedPatient?.allergies || 'None'}</span>
              </div>
            </div>
          </div>

          {/* Dynamic reports comparison block */}
          {showCompareModal && renderCompareReports()}

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', alignItems: 'start' }}>
            
            {/* Left Box: Laboratory Orders Status */}
            <div className="panel-card" style={{ padding: '20px', borderRadius: '16px', minHeight: '340px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px' }}>
                📋 Laboratory Order Statuses
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {patientOrders.map((o, idx) => (
                  <div 
                    key={`${o.orderNumber}-${idx}`}
                    style={{
                      padding: '12px 14px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      backgroundColor: 'var(--bg-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '12.5px' }}>{o.orderNumber}</span>
                      <span className={`badge ${getStatusBadgeClass(o.status)}`} style={{ fontSize: '10px' }}>
                        {mapStatus(o.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      <strong>Tests:</strong> {o.tests.join(', ')}
                    </div>
                    {o.notes && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '2px', backgroundColor: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '4px' }}>
                        <strong>Indications:</strong> {o.notes}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', borderTop: '1px dashed var(--border-color)', paddingTop: '4px' }}>
                      <span>Ordered Date: {o.date}</span>
                    </div>
                  </div>
                ))}
                {patientOrders.length === 0 && (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12px' }}>
                    No laboratory requests issued for this patient.
                  </div>
                )}
              </div>
            </div>

            {/* Right Box: Critical Results Panel (Abnormals only) */}
            <div className="panel-card" style={{ padding: '20px', borderRadius: '16px', minHeight: '340px', border: patientAbnormalResults.length > 0 ? '1.5px solid rgba(244, 63, 94, 0.25)' : '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--rose)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🚨 Critical & Abnormal Results</span>
                {patientAbnormalResults.length > 0 && (
                  <span className="badge badge-rose" style={{ fontSize: '10px' }}>{patientAbnormalResults.length} Flagged</span>
                )}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '350px' }}>
                {patientAbnormalResults.map((alert, idx) => {
                  const isCritical = alert.flag === 'Critical';
                  return (
                    <div
                      key={idx}
                      className="critical-alert-card"
                      style={{
                        borderLeft: `4px solid ${isCritical ? 'var(--rose)' : 'var(--amber)'}`,
                        backgroundColor: isCritical ? 'rgba(244, 63, 94, 0.03)' : 'rgba(245, 158, 11, 0.03)'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{alert.testName}</strong>
                        <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', display: 'block' }}>Ref Range: {alert.refRange}</span>
                        <small style={{ color: 'var(--text-muted)' }}>Released: {alert.date}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: '800', color: isCritical ? 'var(--rose)' : 'var(--amber)', display: 'block' }}>
                          {alert.value}
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', color: isCritical ? 'var(--rose)' : 'var(--amber)' }}>
                          {alert.flag}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {patientAbnormalResults.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--emerald)' }}>
                    <span style={{ fontSize: '24px', marginBottom: '6px' }}>✓</span>
                    <strong style={{ fontSize: '12.5px' }}>Parameters Stable</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2px' }}>No abnormal high or low findings in diagnostic history.</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Section: Completed Report Access */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)', margin: 0 }}>
                📄 Completed Diagnostic Reports ({completedReports.length})
              </h3>
              {completedReports.length >= 2 && !showCompareModal && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCompareModal(true)}
                  style={{ padding: '5px 12px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📊 Compare Previous Reports
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
              {completedReports.map((report, idx) => {
                const task = report.rawTask || labTasks.find(t => t.clinicPatientId === selectedPatientId && t.status === 'Verified');
                return (
                  <div 
                    key={`${report.orderNumber}-${idx}`}
                    style={{
                      border: '1px solid var(--border-color)',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--bg-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)', display: 'block' }}>
                        Verified Date: {report.date}
                      </strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <strong>Parameters:</strong> {report.tests.join(', ')}
                      </span>
                    </div>
                    
                    <div className="report-actions-wrapper" style={{ marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                      <button 
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        onClick={() => {
                          setModalTask(task);
                          setShowReportModal(true);
                        }}
                      >
                        👁️ View Report
                      </button>
                      <button 
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        onClick={() => triggerToast("📥 PDF Download initiated successfully.")}
                      >
                        Download PDF
                      </button>
                      <button 
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        onClick={() => {
                          setModalTask(task);
                          setShowReportModal(true);
                          setTimeout(() => window.print(), 100);
                        }}
                      >
                        Print Report
                      </button>
                    </div>
                  </div>
                );
              })}
              {completedReports.length === 0 && (
                <div style={{ gridColumn: 'span 2', padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12px' }}>
                  No completed or verified diagnostic reports available.
                </div>
              )}
            </div>
          </div>

          {/* Clinical Alerts Dashboard Widget (Clinic Wide alerts) */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '12px' }}>
              🔬 Global Clinic Lab Alerts (Medically Significant)
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
              {allClinicalAlerts.map((alert, idx) => {
                const isCritical = alert.flag === 'Critical';
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      borderLeft: `4px solid ${isCritical ? 'var(--rose)' : 'var(--amber)'}`,
                      backgroundColor: 'var(--bg-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setSelectedPatientId(alert.patientId);
                      setShowCompareModal(false);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{alert.patientName}</strong>
                      <span style={{ fontSize: '8.5px', color: 'var(--text-muted)' }}>{alert.date}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <span>{alert.testName}: <strong style={{ color: isCritical ? 'var(--rose)' : 'var(--amber)' }}>{alert.value}</strong></span>
                      <span style={{ fontWeight: '800', color: isCritical ? 'var(--rose)' : 'var(--amber)', fontSize: '9px', textTransform: 'uppercase' }}>{alert.flag}</span>
                    </div>
                  </div>
                );
              })}
              {allClinicalAlerts.length === 0 && (
                <div style={{ gridColumn: 'span 2', padding: '20px 0', textAlign: 'center', color: 'var(--emerald)', fontSize: '12px', fontStyle: 'italic' }}>
                  ✓ No clinical alert flags registered in the diagnostic system.
                </div>
              )}
            </div>
          </div>

        </main>
      </div>

      {/* A4 lab report preview modal */}
      {showReportModal && modalTask && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '680px', backgroundColor: '#ffffff', color: '#1e293b', borderRadius: '16px', padding: '30px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            
            {/* Header / Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
              <span style={{ fontWeight: '800', fontSize: '14px', color: 'var(--primary)' }}>🖨️ Consolidated Lab Report Preview</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => window.print()} 
                  className="btn btn-primary btn-sm"
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '750' }}
                >
                  🖨️ Print Report
                </button>
                <button 
                  onClick={() => triggerToast("📥 PDF Download initiated successfully.")}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Download PDF
                </button>
                <button 
                  onClick={() => {
                    setShowReportModal(false);
                    setModalTask(null);
                  }} 
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* A4 Report Sheet area */}
            <div style={{ padding: '20px', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#fcfcfc', fontFamily: 'Arial, sans-serif' }}>
              
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3.5px double #0f172a', paddingBottom: '14px', marginBottom: '16px' }}>
                <div>
                  <strong style={{ fontSize: '20px', letterSpacing: '0.5px', color: '#0f172a' }}>RK CLINIC & DIAGNOSTIC CENTER</strong><br />
                  <span style={{ fontSize: '11px', color: '#475569' }}>Registered Diagnostic Lab / Clinical Chemistry, Hematology & Immunology</span><br />
                  <span style={{ fontSize: '10.5px', color: '#64748b' }}>42 Diagnostic Lane, Sector 4, Hyderabad | Phone: +91 9840123456</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#ef4444', border: '1.5px solid #ef4444', padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>LIS Report</span>
                </div>
              </div>

              {/* Patient info metadata */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
                <div>
                  <strong>Patient Name:</strong> {modalTask.patientName}<br />
                  <strong>Patient ID:</strong> {modalTask.clinicPatientId || modalTask.patientId}<br />
                  <strong>Age / Gender:</strong> {modalTask.age} Y / {modalTask.gender}<br />
                  <strong>Contact No:</strong> {modalTask.phone || '--'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>Lab Task ID:</strong> {modalTask.taskId}<br />
                  <strong>Specimen Barcode:</strong> {modalTask.specimenId}<br />
                  <strong>Ordering Physician:</strong> {modalTask.doctorName}<br />
                  <strong>Report Date & Time:</strong> {modalTask.verifiedAt || 'Pending'}
                </div>
              </div>

              {/* Investigations table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #0f172a' }}>
                    <th style={{ textAlign: 'left', padding: '8px', width: '30%' }}>Investigation Test</th>
                    <th style={{ textAlign: 'left', padding: '8px', width: '45%' }}>Result Findings Value</th>
                    <th style={{ textAlign: 'left', padding: '8px', width: '25%' }}>Biological Reference Limits</th>
                  </tr>
                </thead>
                <tbody>
                  {modalTask.orderedTests.map((test, index) => {
                    const res = modalTask.testResults ? modalTask.testResults[test] : null;
                    
                    // Simple check for abnormals in this task
                    const resultAlerts = getAbnormalResults(modalTask.clinicPatientId || modalTask.patientId);
                    const alert = resultAlerts.find(a => a.testName.toLowerCase().includes(test.toLowerCase()) || test.toLowerCase().includes(a.testName.toLowerCase()));
                    
                    let rowVal = res ? res.val : 'Processing / Pending';
                    let refVal = '--';
                    if (res && res.val) {
                      const refMatch = res.val.match(/\(Ref:\s*([^)]+)\)/);
                      if (refMatch) refVal = refMatch[1];
                      rowVal = res.val.split('(')[0].replace(new RegExp(test + '\\s*:\\s*', 'i'), '').trim();
                    }

                    return (
                      <tr key={index} style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 8px', fontWeight: '750' }}>{test}</td>
                        <td style={{ padding: '10px 8px', color: alert ? (alert.flag === 'Critical' ? 'var(--rose)' : 'var(--amber)') : 'inherit', fontWeight: alert ? '800' : 'normal' }}>
                          {rowVal} {alert && `(${alert.flag.toUpperCase()})`}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#64748b' }}>{refVal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Signoff */}
              <div style={{ borderTop: '2.5px solid #0f172a', paddingTop: '12px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '11px' }}>
                <div>
                  <strong>Verification Status:</strong> {modalTask.status}<br />
                  <strong>Remarks advice:</strong> {modalTask.remarks || 'All parameters within physiological limits.'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ height: '30px' }}></div>
                  <strong style={{ borderTop: '1px solid #475569', paddingTop: '4px', display: 'inline-block', width: '180px' }}>
                    {modalTask.verifiedBy || 'Dr. S. Vardhan, MD'}<br />
                    <span style={{ fontSize: '10px', fontWeight: '500', color: '#64748b' }}>Consulting Pathologist</span>
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
