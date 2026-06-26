"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function IpdPanel() {
  const { 
    inpatients, 
    patients, 
    invoices, 
    ipdActiveTab, 
    setIpdActiveTab, 
    admitInpatient, 
    dischargeInpatient 
  } = useClinic();

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedBed, setSelectedBed] = useState('');
  const [diagnosisInput, setDiagnosisInput] = useState('');
  const [doctorInput, setDoctorInput] = useState('Dr. Anil Sharma');

  // Simulated beds array (for allocation map)
  const beds = [
    { id: 'Ward A - Bed 1', status: 'Available' },
    { id: 'Ward A - Bed 2', status: 'Available' },
    { id: 'Ward A - Bed 3', status: 'Occupied', patientId: 'PAT-000001' },
    { id: 'Ward A - Bed 4', status: 'Available' },
    { id: 'ICU - Bed 1', status: 'Occupied', patientId: 'PAT-000002' },
    { id: 'ICU - Bed 2', status: 'Available' },
    { id: 'Semi-Private 101', status: 'Available' },
    { id: 'Deluxe Suite 201', status: 'Available' },
  ];

  // Dynamic values blended with screenshot base values
  const totalInpatientsCount = 32 + (inpatients.length - 2);
  const admittedTodayCount = 8;
  const dischargedTodayCount = 6;

  const currentlyAdmittedCount = 26 + (inpatients.length - 2);
  const malePatientsCount = 15;
  const femalePatientsCount = 11;

  const totalBedsCount = 44;
  const availableBedsCount = totalBedsCount - currentlyAdmittedCount;
  const occupancyRateVal = ((currentlyAdmittedCount / totalBedsCount) * 100).toFixed(2);

  const icuOccupiedCount = 5 + (inpatients.filter(ip => ip.bed.toLowerCase().includes('icu')).length - 1);
  const icuAvailableCount = Math.max(0, 8 - icuOccupiedCount);
  const icuTotalCount = icuOccupiedCount + icuAvailableCount;

  // Invoice calculations
  const pendingInvoices = invoices.filter(inv => inv.status === 'Pending');
  const pendingBillsCount = 21 + (pendingInvoices.length - 1);
  const pendingBillsAmount = 145230.00 + pendingInvoices.reduce((sum, inv) => sum + inv.amount, 0) - 1500;
  const overdueBillsAmount = 68750.00;

  // Format currency value helper
  const formatINR = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(val);
  };

  // Combined Inpatients Builder (Seeded mock + dynamic context)
  const getCombinedInpatients = () => {
    const mockInpatients = [
      { ipdNo: 'IPD-001', name: 'Ramesh Kumar', ageGender: '45 / Male', doctor: 'Dr. Anil Sharma', bed: '101 / B1', status: 'Stable', date: '19 May 2025', patientId: 'ON-MOCK-IP1' },
      { ipdNo: 'IPD-002', name: 'Priya Singh', ageGender: '28 / Female', doctor: 'Dr. Neha Verma', bed: '102 / A2', status: 'Stable', date: '18 May 2025', patientId: 'ON-MOCK-IP2' },
      { ipdNo: 'IPD-003', name: 'Suresh Patel', ageGender: '52 / Male', doctor: 'Dr. Rahul Mehta', bed: 'ICU-01', status: 'Critical', date: '17 May 2025', patientId: 'ON-MOCK-IP3' },
      { ipdNo: 'IPD-004', name: 'Asha Rani', ageGender: '37 / Female', doctor: 'Dr. Pooja Singh', bed: '201 / B3', status: 'Improving', date: '16 May 2025', patientId: 'ON-MOCK-IP4' },
      { ipdNo: 'IPD-005', name: 'Mohit Gupta', ageGender: '29 / Male', doctor: 'Dr. Vikram Patel', bed: '202 / A1', status: 'Stable', date: '16 May 2025', patientId: 'ON-MOCK-IP5' }
    ];

    const contextInpatients = inpatients.map((ip, idx) => {
      const pat = patients.find(p => p.id === ip.patientId);
      return {
        ipdNo: `IPD-${(idx + 6).toString().padStart(3, '0')}`,
        name: pat ? pat.name : 'Unknown Inpatient',
        ageGender: pat ? `${pat.age} / ${pat.gender}` : '-- / --',
        doctor: ip.doctor || 'Dr. Aditya Dev',
        bed: ip.bed,
        status: ip.bed.toLowerCase().includes('icu') ? 'Critical' : 'Stable',
        date: ip.date,
        patientId: ip.patientId,
        isContext: true
      };
    });

    const merged = [...contextInpatients];
    mockInpatients.forEach(item => {
      if (!merged.some(m => m.name.toLowerCase() === item.name.toLowerCase())) {
        merged.push(item);
      }
    });

    return merged.slice(0, 5);
  };

  // Dynamic Ward-wise Occupancy Calculations
  const getWardOccupancy = () => {
    const generalWardOccupied = 12 + (inpatients.filter(ip => ip.bed.toLowerCase().includes('ward')).length - 1);
    const icuOccupied = 5 + (inpatients.filter(ip => ip.bed.toLowerCase().includes('icu')).length - 1);

    return [
      { name: 'General Ward', total: 20, occupied: generalWardOccupied, available: Math.max(0, 20 - generalWardOccupied) },
      { name: 'Private Room', total: 10, occupied: 6, available: 4 },
      { name: 'Semi Private', total: 6, occupied: 3, available: 3 },
      { name: 'ICU', total: 6, occupied: icuOccupied, available: Math.max(0, 6 - icuOccupied) },
      { name: 'Pediatric Ward', total: 2, occupied: 0, available: 2 }
    ];
  };

  // Format Current Date
  const dateOptions = { day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' };
  const formattedToday = new Date().toLocaleDateString('en-US', dateOptions);

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Dynamic Hover Styles */}
      <style>{`
        .ipd-dashboard-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }
        
        .ipd-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 20px;
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          transition: transform var(--transition-fast), box-shadow var(--transition-fast);
        }
        
        .ipd-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-hover);
        }

        .ipd-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .ipd-card-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ipd-card-icon-wrapper svg {
          width: 20px;
          height: 20px;
          fill: none;
          stroke-width: 2.2;
        }

        .ipd-card-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .ipd-card-value {
          font-family: var(--font-title);
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 12px;
        }

        .ipd-card-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          border-top: 1px solid var(--border-color);
          padding-top: 10px;
        }

        .ipd-card-detail-item {
          display: flex;
          flex-direction: column;
        }

        .ipd-card-detail-label {
          font-size: 11px;
          color: var(--text-muted);
        }

        .ipd-card-detail-value {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        /* Card color themes */
        .ipd-card.indigo .ipd-card-icon-wrapper {
          background-color: rgba(79, 70, 229, 0.08);
          color: var(--primary);
        }
        .ipd-card.emerald .ipd-card-icon-wrapper {
          background-color: rgba(16, 185, 129, 0.08);
          color: var(--emerald);
        }
        .ipd-card.amber .ipd-card-icon-wrapper {
          background-color: rgba(245, 158, 11, 0.08);
          color: var(--amber);
        }
        .ipd-card.rose .ipd-card-icon-wrapper {
          background-color: rgba(244, 63, 94, 0.08);
          color: var(--rose);
        }

        .interactive-row {
          cursor: pointer;
          transition: background var(--transition-fast);
        }
        .interactive-row:hover {
          background-color: rgba(79, 70, 229, 0.05) !important;
        }
      `}</style>

      {ipdActiveTab === 'beds' ? (
        /* BEDS ALLOCATION MAP VIEW (ORIGINAL MAP) */
        <>
          <div className="welcome-section" style={{ marginBottom: '10px' }}>
            <div className="welcome-text">
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg viewBox="0 0 24 24" style={{ width: '28px', height: '28px', stroke: '#db2777', fill: 'none', strokeWidth: 2 }}><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
                Inpatient Department (IPD) Beds Map
              </h1>
              <p>Monitor admitted inpatients, manage ward occupancy, and check latest vitals. Click on a vacant bed to admit a patient.</p>
            </div>
            <div className="action-buttons-group">
              <button className="btn btn-secondary" onClick={() => setIpdActiveTab('dashboard')}>
                ← Back to IPD Dashboard
              </button>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* Ward Bed Grid Layout Map */}
            <div className="panel-card col-5">
              <div className="panel-card-header">
                <h3 className="panel-card-title">Ward Beds Allocation Map</h3>
              </div>
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)', 
                  gap: '12px',
                  marginTop: '10px'
                }}
              >
                {beds.map((bed, idx) => {
                  const ipInfo = inpatients.find(ip => ip.bed.toLowerCase().includes(bed.id.toLowerCase().replace(' private', '').replace(' suite', '')));
                  const isOccupied = ipInfo || bed.status === 'Occupied';
                  const pat = isOccupied ? patients.find(p => p.id === (ipInfo?.patientId || bed.patientId)) : null;

                  return (
                    <div 
                      key={idx}
                      style={{
                        backgroundColor: isOccupied ? 'rgba(219, 39, 119, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        border: isOccupied ? '1.5px solid rgba(219, 39, 119, 0.3)' : '1.5px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: '12px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        cursor: !isOccupied ? 'pointer' : 'default',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => {
                        if (!isOccupied) {
                          setSelectedBed(bed.id);
                          setIpdActiveTab('discharge');
                        }
                      }}
                      title={!isOccupied ? "Click to admit patient to this bed" : undefined}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{bed.id}</strong>
                        <span 
                          style={{ 
                            fontSize: '9px', 
                            fontWeight: '700', 
                            padding: '2px 6px', 
                            borderRadius: '10px',
                            backgroundColor: isOccupied ? '#db2777' : '#10b981',
                            color: '#ffffff'
                          }}
                        >
                          {isOccupied ? 'Occupied' : 'Vacant'}
                        </span>
                      </div>
                      {isOccupied && pat ? (
                        <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <span style={{ fontWeight: '600' }}>Patient:</span> {pat.name}<br/>
                          <span style={{ fontWeight: '600' }}>Vitals:</span> {ipInfo?.vitals || 'Stable'}
                        </div>
                      ) : (
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Ready for admission
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Admitted Inpatients List Table */}
            <div className="panel-card col-7">
              <div className="panel-card-header">
                <h3 className="panel-card-title">Admitted Inpatients Registry</h3>
              </div>
              <div className="table-responsive" style={{ marginTop: '10px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bed No.</th>
                      <th>Patient ID</th>
                      <th>Name</th>
                      <th>Diagnosis</th>
                      <th>Vitals</th>
                      <th>Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inpatients.map((ip, idx) => {
                      const pat = patients.find(p => p.id === ip.patientId);
                      return (
                        <tr key={idx}>
                          <td><span className="badge badge-sky" style={{ textTransform: 'none', backgroundColor: '#fce7f3', color: '#db2777', fontWeight: '700' }}>{ip.bed}</span></td>
                          <td><code>{ip.patientId}</code></td>
                          <td><strong>{pat ? pat.name : 'Unknown'}</strong></td>
                          <td style={{ fontSize: '12px' }}>{ip.diagnosis}</td>
                          <td style={{ fontSize: '11px' }}><code>{ip.vitals}</code></td>
                          <td>
                            <span className={`badge ${ip.billing.includes('Covered') ? 'badge-emerald' : 'badge-amber'}`} style={{ fontSize: '10px' }}>
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
        </>
      ) : ipdActiveTab === 'discharge' ? (
        /* ADMISSIONS & DISCHARGES VIEW */
        <>
          <div className="welcome-section" style={{ marginBottom: '10px' }}>
            <div className="welcome-text">
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg viewBox="0 0 24 24" style={{ width: '28px', height: '28px', stroke: '#db2777', fill: 'none', strokeWidth: 2 }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>
                Admissions & Discharges Queue
              </h1>
              <p>Manage patient admission forms, allocate vacant beds, and process discharge checklists.</p>
            </div>
            <div className="action-buttons-group">
              <button className="btn btn-secondary" onClick={() => setIpdActiveTab('dashboard')}>
                ← Back to IPD Dashboard
              </button>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* Admissions Form */}
            <div className="panel-card col-5" style={{ padding: '20px' }}>
              <div className="panel-card-header" style={{ marginBottom: '16px' }}>
                <h3 className="panel-card-title">Admit New Inpatient</h3>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedPatientId || !selectedBed || !diagnosisInput) {
                    alert("Please fill in all fields (Patient, Bed, and Diagnosis).");
                    return;
                  }
                  admitInpatient(selectedPatientId, selectedBed, diagnosisInput, doctorInput);
                  setSelectedPatientId('');
                  setSelectedBed('');
                  setDiagnosisInput('');
                  alert("Patient admitted successfully!");
                }} 
                style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Select Patient</label>
                  <select 
                    value={selectedPatientId} 
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  >
                    <option value="">-- Choose Patient --</option>
                    {patients
                      .filter(p => !inpatients.some(ip => ip.patientId === p.id))
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id}) - Age: {p.age}
                        </option>
                      ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Allocate Bed</label>
                  <select 
                    value={selectedBed} 
                    onChange={(e) => setSelectedBed(e.target.value)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  >
                    <option value="">-- Choose Bed --</option>
                    {beds
                      .filter(b => b.id === selectedBed || !inpatients.some(ip => ip.bed === b.id))
                      .map(b => (
                        <option key={b.id} value={b.id}>
                          {b.id} {inpatients.some(ip => ip.bed === b.id) ? '(Occupied)' : '(Vacant)'}
                        </option>
                      ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Diagnosis</label>
                  <input 
                    type="text"
                    placeholder="e.g. Acute Gastroenteritis"
                    value={diagnosisInput}
                    onChange={(e) => setDiagnosisInput(e.target.value)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Attending Doctor</label>
                  <select
                    value={doctorInput}
                    onChange={(e) => setDoctorInput(e.target.value)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  >
                    <option value="Dr. Anil Sharma">Dr. Anil Sharma</option>
                    <option value="Dr. Neha Verma">Dr. Neha Verma</option>
                    <option value="Dr. Rahul Mehta">Dr. Rahul Mehta</option>
                    <option value="Dr. Pooja Singh">Dr. Pooja Singh</option>
                    <option value="Dr. Vikram Patel">Dr. Vikram Patel</option>
                  </select>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{
                    marginTop: '10px',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: '700'
                  }}
                >
                  Confirm Bed Admission
                </button>
              </form>
            </div>

            {/* Inpatients Discharges List */}
            <div className="panel-card col-7" style={{ padding: '20px' }}>
              <div className="panel-card-header" style={{ marginBottom: '16px' }}>
                <h3 className="panel-card-title">Currently Admitted Inpatients</h3>
              </div>
              <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bed</th>
                      <th>Patient</th>
                      <th>Diagnosis</th>
                      <th>Admission Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inpatients.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                          No patients currently admitted.
                        </td>
                      </tr>
                    ) : (
                      inpatients.map((ip, idx) => {
                        const pat = patients.find(p => p.id === ip.patientId);
                        return (
                          <tr key={idx}>
                            <td>
                              <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#fce7f3', color: '#db2777', fontSize: '11px', fontWeight: '700' }}>
                                {ip.bed}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: '600' }}>{pat ? pat.name : 'Unknown'}</div>
                              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{ip.patientId}</div>
                            </td>
                            <td style={{ fontSize: '12px' }}>{ip.diagnosis}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ip.date}</td>
                            <td>
                              <button 
                                onClick={() => {
                                  if (confirm(`Are you sure you want to discharge ${pat ? pat.name : 'this patient'}?`)) {
                                    dischargeInpatient(ip.patientId);
                                    alert("Patient discharged successfully!");
                                  }
                                }}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                                  border: '1px solid rgba(244, 63, 94, 0.3)',
                                  borderRadius: '6px',
                                  color: 'var(--rose)',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                Discharge
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* DASHBOARD VIEW */
        <>
          {/* HEADER SECTION */}
          <div className="welcome-section">
            <div className="welcome-text">
              <h1>IPD Dashboard</h1>
              <p>Dashboard / IPD</p>
            </div>
            <div className="action-buttons-group">
              <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {formattedToday}
              </button>
            </div>
          </div>

          {/* 8 Metric Cards Grid */}
          <div className="ipd-dashboard-grid">
            
            {/* Card 1: Total Inpatients */}
            <div className="ipd-card indigo">
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
                </div>
                <span className="ipd-card-title">Total Inpatients</span>
              </div>
              <span className="ipd-card-value">{totalInpatientsCount}</span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Admitted Today</span>
                  <span className="ipd-card-detail-value">0{admittedTodayCount}</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Discharged Today</span>
                  <span className="ipd-card-detail-value">0{dischargedTodayCount}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Currently Admitted */}
            <div className="ipd-card emerald">
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
                </div>
                <span className="ipd-card-title">Currently Admitted</span>
              </div>
              <span className="ipd-card-value">{currentlyAdmittedCount}</span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Male Patients</span>
                  <span className="ipd-card-detail-value">{malePatientsCount}</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Female Patients</span>
                  <span className="ipd-card-detail-value">{femalePatientsCount}</span>
                </div>
              </div>
            </div>

            {/* Card 3: Available Beds */}
            <div className="ipd-card amber" style={{ cursor: 'pointer' }} onClick={() => setIpdActiveTab('beds')}>
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
                </div>
                <span className="ipd-card-title">Available Beds</span>
              </div>
              <span className="ipd-card-value">{availableBedsCount}</span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Total Beds</span>
                  <span className="ipd-card-detail-value">{totalBedsCount}</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Occupancy Rate</span>
                  <span className="ipd-card-detail-value" style={{ color: 'var(--primary)', fontWeight: '700' }}>{occupancyRateVal}%</span>
                </div>
              </div>
            </div>

            {/* Card 4: ICU Patients */}
            <div className="ipd-card rose">
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </div>
                <span className="ipd-card-title">ICU Patients</span>
              </div>
              <span className="ipd-card-value">0{icuOccupiedCount}</span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">ICU Occupied</span>
                  <span className="ipd-card-detail-value">0{icuOccupiedCount}</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">ICU Available</span>
                  <span className="ipd-card-detail-value">0{icuAvailableCount}</span>
                </div>
              </div>
            </div>

            {/* Card 5: Discharges (This Month) */}
            <div className="ipd-card rose" style={{ cursor: 'pointer' }} onClick={() => setIpdActiveTab('discharge')}>
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </div>
                <span className="ipd-card-title">Discharges (This Month)</span>
              </div>
              <span className="ipd-card-value">28</span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Discharges (This Week)</span>
                  <span className="opd-card-detail-value">12</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Discharges (Yesterday)</span>
                  <span className="opd-card-detail-value">06</span>
                </div>
              </div>
            </div>

            {/* Card 6: Average Length of Stay */}
            <div className="ipd-card indigo">
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <span className="ipd-card-title">Average Length of Stay</span>
              </div>
              <span className="ipd-card-value">3.6 <span style={{ fontSize: '13px', fontWeight: '500' }}>days</span></span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">This Month</span>
                  <span className="opd-card-detail-value">3.6 days</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Last Month</span>
                  <span className="opd-card-detail-value">3.2 days</span>
                </div>
              </div>
            </div>

            {/* Card 7: IPD Revenue (Today) */}
            <div className="ipd-card emerald">
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><path d="M8 10a2 2 0 0 1 2-2h4a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2"/></svg>
                </div>
                <span className="ipd-card-title">IPD Revenue (Today)</span>
              </div>
              <span className="ipd-card-value" style={{ fontSize: '22px' }}>₹ 32,450.00</span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">This Month</span>
                  <span className="opd-card-detail-value" style={{ fontSize: '12px', fontWeight: '700' }}>₹ 8,75,230.00</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Last Month</span>
                  <span className="opd-card-detail-value" style={{ fontSize: '12px' }}>₹ 7,15,400.00</span>
                </div>
              </div>
            </div>

            {/* Card 8: Pending Bills */}
            <div className="ipd-card amber">
              <div className="ipd-card-header">
                <div className="ipd-card-icon-wrapper">
                  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <span className="ipd-card-title">Pending Bills</span>
              </div>
              <span className="ipd-card-value">{pendingBillsCount}</span>
              <div className="ipd-card-details">
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Pending Amount</span>
                  <span className="opd-card-detail-value" style={{ color: 'var(--rose)', fontSize: '11px', fontWeight: '700' }}>{formatINR(pendingBillsAmount)}</span>
                </div>
                <div className="ipd-card-detail-item">
                  <span className="ipd-card-detail-label">Overdue Amount</span>
                  <span className="opd-card-detail-value" style={{ color: 'var(--rose)', fontSize: '11px' }}>{formatINR(overdueBillsAmount)}</span>
                </div>
              </div>
            </div>

          </div>

          {/* LOWER GRID: CURRENT INPATIENTS, WARD-WISE OCCUPANCY */}
          <div className="dashboard-grid" style={{ marginTop: '0px', marginBottom: '24px' }}>
            
            {/* COLUMN 1: Current Inpatients */}
            <div className="panel-card" style={{ gridColumn: 'span 7', padding: '20px', minHeight: '380px' }}>
              <div className="panel-card-header" style={{ marginBottom: '14px' }}>
                <h3 className="panel-card-title" style={{ fontSize: '15px' }}>
                  <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', stroke: 'var(--primary)', fill: 'none' }}><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
                  Current Inpatients
                </h3>
                <span onClick={() => setIpdActiveTab('beds')} style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}>View All</span>
              </div>

              <div className="table-responsive" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '8px 4px' }}>IPD No.</th>
                      <th style={{ padding: '8px 4px' }}>Patient Name</th>
                      <th style={{ padding: '8px 4px' }}>Age / Gender</th>
                      <th style={{ padding: '8px 4px' }}>Doctor</th>
                      <th style={{ padding: '8px 4px' }}>Room / Bed</th>
                      <th style={{ padding: '8px 4px' }}>Status</th>
                      <th style={{ padding: '8px 4px' }}>Admission Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCombinedInpatients().map((item, idx) => (
                      <tr 
                        key={idx} 
                        className="interactive-row"
                        onClick={() => setIpdActiveTab('beds')}
                        style={{ borderBottom: '1px solid var(--border-color)' }}
                        title="Click to view bed allocation map"
                      >
                        <td style={{ padding: '10px 4px', color: 'var(--primary)', fontWeight: '700' }}>{item.ipdNo}</td>
                        <td style={{ padding: '10px 4px', fontWeight: '600' }}>{item.name}</td>
                        <td style={{ padding: '10px 4px', color: 'var(--text-secondary)' }}>{item.ageGender}</td>
                        <td style={{ padding: '10px 4px', color: 'var(--text-secondary)' }}>{item.doctor}</td>
                        <td style={{ padding: '10px 4px', fontWeight: '600' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#fce7f3', color: '#db2777', fontSize: '11px', fontWeight: '700' }}>
                            {item.bed}
                          </span>
                        </td>
                        <td style={{ padding: '10px 4px' }}>
                          <span className={`badge ${
                            item.status === 'Critical' ? 'badge-rose' : 
                            (item.status === 'Improving' ? 'badge-sky' : 'badge-emerald')
                          }`} style={{ padding: '3px 8px', fontSize: '10px' }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 4px', color: 'var(--text-secondary)' }}>{item.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
                <span 
                  onClick={() => setIpdActiveTab('beds')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--primary)', fontWeight: '700', cursor: 'pointer' }}
                >
                  View Full List →
                </span>
              </div>
            </div>

            {/* COLUMN 2: Ward-wise Occupancy */}
            <div className="panel-card" style={{ gridColumn: 'span 5', padding: '20px', minHeight: '380px' }}>
              <div className="panel-card-header" style={{ marginBottom: '14px' }}>
                <h3 className="panel-card-title" style={{ fontSize: '15px' }}>
                  <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', stroke: 'var(--primary)', fill: 'none' }}><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
                  Ward-wise Occupancy
                </h3>
                <span onClick={() => setIpdActiveTab('beds')} style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}>View All</span>
              </div>

              <div className="table-responsive" style={{ overflowX: 'auto', marginTop: '10px' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '8px 4px' }}>Ward</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center' }}>Total Beds</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center' }}>Occupied</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center' }}>Available</th>
                      <th style={{ padding: '8px 4px', width: '140px' }}>Occupancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getWardOccupancy().map((ward, idx) => {
                      const pct = ((ward.occupied / ward.total) * 100).toFixed(2);
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '12px 4px', fontWeight: '600' }}>{ward.name}</td>
                          <td style={{ padding: '12px 4px', textAlign: 'center', fontWeight: '600' }}>{ward.total}</td>
                          <td style={{ padding: '12px 4px', textAlign: 'center', color: 'var(--primary)', fontWeight: '700' }}>{ward.occupied.toString().padStart(2, '0')}</td>
                          <td style={{ padding: '12px 4px', textAlign: 'center', color: 'var(--text-secondary)' }}>{ward.available.toString().padStart(2, '0')}</td>
                          <td style={{ padding: '12px 4px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                <span>{pct}%</span>
                              </div>
                              <div style={{ width: '100%', height: '6px', borderRadius: '3px', backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '3px', transition: 'width 0.4s' }}></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
