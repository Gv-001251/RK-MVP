"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function ReportsPanel() {
  const {
    invoices,
    patients,
    inventory,
    prescriptions,
    queue,
    currency
  } = useClinic();

  const [reportRange, setReportRange] = useState('Month');

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

  // 1. Daily Statistics
  const dailyRevenue = invoices
    .filter(inv => inv.date === todayStr && inv.status === 'Paid')
    .reduce((sum, inv) => sum + inv.amount, 0);

  const dailyConsultations = queue.length; // Active/Completed consultations today

  // 2. Monthly Statistics
  const monthlyRevenue = invoices
    .filter(inv => inv.date.startsWith(currentMonthStr) && inv.status === 'Paid')
    .reduce((sum, inv) => sum + inv.amount, 0);

  const totalPatients = patients.length;
  
  // Outstanding Due
  const totalOutstanding = invoices
    .filter(inv => inv.status === 'Pending' || inv.status === 'Partial')
    .reduce((sum, inv) => sum + inv.amount, 0);

  // 3. Dynamic Medicine Usage Calculation
  const medCounts = {};
  prescriptions.forEach(rx => {
    rx.meds.forEach(m => {
      // Calculate units dispensed roughly as duration (days) * 2
      const units = (parseInt(m.duration) || 5) * 2;
      medCounts[m.name] = (medCounts[m.name] || 0) + units;
    });
  });

  // Fallback seed data if no prescriptions written yet
  const defaultTopMeds = [
    { name: 'Metoprolol 50mg', count: 124, color: 'var(--primary)' },
    { name: 'Amlodipine 5mg', count: 98, color: '#3b82f6' },
    { name: 'Amoxicillin 500mg', count: 86, color: '#ec4899' },
    { name: 'Atorvastatin 20mg', count: 64, color: '#f59e0b' },
    { name: 'Albuterol Inhaler', count: 42, color: '#ef4444' }
  ];

  const topMedicines = Object.keys(medCounts).length > 0
    ? Object.keys(medCounts).map((name, idx) => {
        const colors = ['var(--primary)', '#3b82f6', '#ec4899', '#f59e0b', '#ef4444'];
        return {
          name,
          count: medCounts[name],
          color: colors[idx % colors.length]
        };
      }).sort((a, b) => b.count - a.count).slice(0, 5)
    : defaultTopMeds;

  // Export mock raw data
  const handleExportData = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Invoice ID,Date,Patient ID,Amount,Payment Mode,Status\n";
    invoices.forEach(inv => {
      csvContent += `${inv.id},${inv.date},${inv.patientId},${inv.amount},${inv.mode},${inv.status}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `RK_Clinic_Financial_Report_${reportRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert("Mock CSV Report exported successfully.");
  };

  return (
    <div className="content-panel active">
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Clinical Analytics & Reports</h1>
          <p>Analyze revenue growth, monitor patient intake counts, and inspect pharmacy medicine logs.</p>
        </div>
        <div className="action-buttons-group">
          <select 
            className="form-control" 
            value={reportRange}
            onChange={(e) => setReportRange(e.target.value)}
            style={{ width: '150px', padding: '6px 12px', display: 'inline-block', margin: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
          >
            <option value="Week">This Week</option>
            <option value="Month">This Month</option>
            <option value="Year">This Year</option>
          </select>
          <button className="btn btn-secondary" onClick={handleExportData}>
            <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: 'currentColor' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Export Raw CSV</span>
          </button>
        </div>
      </div>

      {/* KPI STATISTICS CARDS ROW */}
      <div className="stats-cards-grid">
        <div className="stats-card sky">
          <div className="stats-card-icon-wrapper">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          </div>
          <span className="stats-card-label">Patients (Intake / Queue)</span>
          <span className="stats-card-value">{totalPatients} registered</span>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Today&apos;s Consultations: <strong>{dailyConsultations} patients</strong>
          </div>
        </div>
        
        <div className="stats-card emerald">
          <div className="stats-card-icon-wrapper">
            <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <span className="stats-card-label">Revenue Collected (Today)</span>
          <span className="stats-card-value">{currency}{dailyRevenue.toFixed(0)}</span>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Current Month Gross: <strong>{currency}{monthlyRevenue.toFixed(0)}</strong>
          </div>
        </div>

        <div className="stats-card teal">
          <div className="stats-card-icon-wrapper">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          </div>
          <span className="stats-card-label">Outstanding Due (Bills)</span>
          <span className="stats-card-value" style={{ color: totalOutstanding > 0 ? 'var(--rose)' : 'inherit' }}>
            {currency}{totalOutstanding.toFixed(0)}
          </span>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Status: Pending Insurance/Partial pay
          </div>
        </div>

        <div className="stats-card rose">
          <div className="stats-card-icon-wrapper">
            <svg viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.25-2.5 3-2.5 4.5h20c0-1.5-1-3.25-2.5-4.5"/><ellipse cx="12" cy="10" rx="7" ry="6"/><path d="M12 4v12"/></svg>
          </div>
          <span className="stats-card-label">Pharmacy Catalog</span>
          <span className="stats-card-value">{inventory.length} Stock SKUs</span>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Low stock items: <strong style={{ color: 'var(--rose)' }}>{inventory.filter(i => i.stock <= i.threshold).length}</strong>
          </div>
        </div>
      </div>

      {/* DETAILED STATS CHARTS PANELS */}
      <div className="dashboard-grid">
        {/* LINE AREA CHART: MONTHLY REVENUE */}
        <div className="panel-card col-6">
          <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-primary)' }}>Monthly Income Growth (Gross Billed)</h3>
          
          <div style={{ height: '240px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="100%" height="220" viewBox="0 0 400 220" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="40" x2="400" y2="40" stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="400" y2="90" stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1="140" x2="400" y2="140" stroke="var(--border-color)" strokeWidth="1" strokeDasharray="3 3" />
              
              {/* Path */}
              <path d="M 10 180 Q 80 160 150 100 T 290 50 T 390 30 L 390 190 L 10 190 Z" fill="url(#areaGrad)" />
              <path d="M 10 180 Q 80 160 150 100 T 290 50 T 390 30" fill="none" stroke="var(--primary)" strokeWidth="3.5" />
              
              <circle cx="10" cy="180" r="5" fill="var(--primary)" stroke="white" strokeWidth="2" />
              <circle cx="150" cy="100" r="5" fill="var(--primary)" stroke="white" strokeWidth="2" />
              <circle cx="290" cy="50" r="5" fill="var(--primary)" stroke="white" strokeWidth="2" />
              <circle cx="390" cy="30" r="5" fill="var(--primary)" stroke="white" strokeWidth="2" />
              
              <text x="10" y="210" fill="var(--text-muted)" fontSize="10" textAnchor="middle">Mar</text>
              <text x="150" y="210" fill="var(--text-muted)" fontSize="10" textAnchor="middle">Apr</text>
              <text x="290" y="210" fill="var(--text-muted)" fontSize="10" textAnchor="middle">May</text>
              <text x="390" y="210" fill="var(--text-muted)" fontSize="10" textAnchor="middle">Jun</text>
            </svg>
          </div>
        </div>

        {/* HORIZONTAL BAR CHART: TOP DRUG USAGE */}
        <div className="panel-card col-6">
          <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-primary)' }}>Top Medicines Prescribed (Units Dispensed)</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '240px', justifyContent: 'center' }}>
            {topMedicines.map((med, index) => {
              const percentage = Math.min(100, (med.count / 150) * 100);
              return (
                <div key={index} style={{ fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <span>{med.name}</span>
                    <span>{med.count} units</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', backgroundColor: 'var(--bg-primary)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${percentage}%`, 
                        height: '100%', 
                        backgroundColor: med.color, 
                        borderRadius: '5px',
                        transition: 'width 1s ease-in-out'
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
