"use client";
import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function DashboardPanel({ onOpenPatientProfile, onEditPatient, onNavigateToTab }) {
  const {
    patients,
    queue,
    invoices,
    inventory,
    appointments,
    inpatients,
    currency,
    activeRole,
    nursingNotes,
    labRequests,
    labTasks,
    labOrders
  } = useClinic();

  const [docPerfData, setDocPerfData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (activeRole === 'admin') {
      const fetchReports = async () => {
        try {
          setReportLoading(true);
          const res = await fetch('/api/admin/reports');
          if (res.ok) {
            const data = await res.json();
            setDocPerfData(data.doctorPerformance || []);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setReportLoading(false);
        }
      };
      fetchReports();
    }
  }, [activeRole]);

  // Dynamic values blended with screenshot base values to keep data interactive
  const totalPatientsToday = 125 + (patients.length - 5);
  const patientAdmission = 86 + (inpatients.length - 2);
  const newPatients = 39 + (patients.length - 5);
  const underTreatment = 18;
  const dischargedPatients = 68;

  const totalOpdToday = 96 + (queue.length - 3);
  const opdCompleted = 78 + queue.filter(q => q.status === 'Completed').length;
  const opdInConsultation = 18 + (queue.filter(q => q.status === 'In-Consultation').length - 1);
  const opdWaiting = 12 + (queue.filter(q => q.status === 'Waiting').length - 2);
  const opdCancelled = 6;

  const totalIpdToday = 32 + (inpatients.length - 2);
  const ipdAdmitted = 32 + (inpatients.length - 2);
  const ipdDischarged = 7;
  
  // Available Beds = Total Beds - Occupied Beds
  const totalBedsCount = 44;
  const ipdOccupiedBeds = 26 + (inpatients.length - 2);
  const ipdAvailableBeds = totalBedsCount - ipdOccupiedBeds;

  // Revenue Today
  const newPaidToday = invoices
    .filter(inv => inv.status === 'Paid' && inv.date === new Date().toISOString().split('T')[0])
    .reduce((sum, inv) => sum + inv.amount, 0);
  const revenueTotal = 45230 + newPaidToday;
  const revenueOpd = 18120 + newPaidToday * 0.7;
  const revenuePharmacy = 8750 + newPaidToday * 0.3;
  const revenueLaboratory = 15340;

  // Lab Overview
  const labTotal = 68;
  const labTestsOrdered = 68;
  const labSampleCollection = 34;
  const labProcessing = 24;
  const labCompleted = 38;
  const labCriticalReports = 3;

  // Pharmacy Overview
  const pharmTotal = 542 + (inventory.length - 5);
  const pharmLowStock = 16 + (inventory.filter(i => i.stock <= i.threshold).length - 2);
  const pharmOutOfStock = 5;
  const pharmExpirySoon = 9;

  // Billing Overview
  const newPendingCount = invoices.filter(inv => inv.status === 'Pending').length;
  const newPendingAmount = invoices
    .filter(inv => inv.status === 'Pending')
    .reduce((sum, inv) => sum + inv.amount, 0);

  const billingTotal = 73 + (invoices.length - 3);
  const billingGenerated = 73 + (invoices.length - 3);
  const billingPaid = 52 + (invoices.filter(i => i.status === 'Paid').length - 2);
  const billingPendingBills = 21 + (newPendingCount - 1);
  const billingPendingAmount = 28650 + (newPendingAmount - 1500);

  // Pending Payments
  const pendingTotal = 21 + (newPendingCount - 1);
  const pendingPatientDue = 15;
  const pendingInsuranceDue = 6;
  const pendingOutstanding = 28650 + (newPendingAmount - 1500);

  // Appointments Today
  const apptsTotal = 58 + (appointments.length - 4);
  const apptsScheduled = 58 + (appointments.length - 4);
  const apptsCompleted = 38;
  const apptsUpcoming = 12;
  const apptsNoShow = 8;

  // Doctor Availability
  const docTotal = 12;
  const docOnDuty = 8;
  const docOnLeave = 2;
  const docOnBreak = 1;
  const docOffDuty = 1;

  // Sample Collection Center
  const sampleCenters = 3;
  const sampleActive = 3;
  const sampleCollected = 92;
  const samplePendingPickups = 8;
  const sampleTransferred = 12;

  // Alerts & Notifications
  const alertsTotal = 7 + (inventory.filter(i => i.stock <= i.threshold).length - 2);
  const alertLowStock = 5 + (inventory.filter(i => i.stock <= i.threshold).length - 2);
  const alertCriticalLab = 3;
  const alertExpiringSoon = 2;
  const alertInsurancePending = 2;

  // LIS Samples stats
  const samplesCollectedToday = 92 + (labRequests ? labRequests.filter(r => ['Collected', 'Processing', 'Pending Verification', 'Verified'].includes(r.status)).length - 4 : 0);
  const samplesProcessingToday = 35 + (labRequests ? labRequests.filter(r => r.status === 'Processing').length - 1 : 0);
  const samplesCompletedToday = 78 + (labRequests ? labRequests.filter(r => r.status === 'Verified').length - 1 : 0);

  // Redesigned dashboard variables (From image)
  const pending = labTasks ? labTasks.filter(t => t.status === 'Sample Collected').length : 5;
  const sampleCollection = labTasks ? labTasks.filter(t => t.status === 'Sample Registered').length : 6;
  const processing = labTasks ? labTasks.filter(t => ['Processing', 'Analyzer Running'].includes(t.status)).length : 8;
  const completed = labTasks ? labTasks.filter(t => t.status === 'Verified').length : 6;
  const delivered = labTasks ? labTasks.filter(t => t.status === 'Delivered').length : 15;
  const totalReports = pending + sampleCollection + processing + completed + delivered;

  const cabin = 2;
  const bed = 3;
  const totalBeds = cabin + bed;

  // Format currency value helper
  const formatVal = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(val);
  };

  // Render Dashboard Cards based on Active User Role
  const renderDashboardCards = () => {
    switch (activeRole) {
      case 'doctor':
        return (
          <>
            {/* Card 1: Today's Appointments */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#7c3aed' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className="erp-card-header-title">Today&apos;s Appointments</span>
              </div>
              <span className="erp-card-large-number">{apptsTotal}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label">Scheduled</span>
                  <span className="erp-card-detail-value">{apptsScheduled}</span>
                </div>
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label">Upcoming</span>
                  <span className="erp-card-detail-value">{apptsUpcoming}</span>
                </div>
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label">Completed</span>
                  <span className="erp-card-detail-value">{apptsCompleted}</span>
                </div>
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label">No Show</span>
                  <span className="erp-card-detail-value">{apptsNoShow.toString().padStart(2, '0')}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Waiting Patients */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#3b82f6' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <span className="erp-card-header-title">Waiting Patients</span>
              </div>
              <span className="erp-card-large-number">{opdWaiting}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">OPD Queue</span>
                  <span className="erp-card-detail-value">{opdWaiting} Awaiting Call</span>
                </div>
              </div>
            </div>

            {/* Card 3: Active Consultations */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#a855f7' }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                <span className="erp-card-header-title">Active Consultations</span>
              </div>
              <span className="erp-card-large-number">{opdInConsultation}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Status</span>
                  <span className="erp-card-detail-value">In Consultation Cabin</span>
                </div>
              </div>
            </div>

            {/* Card 4: Recent Lab Reports */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#059669' }}><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
                <span className="erp-card-header-title">Recent Lab Reports</span>
              </div>
              <span className="erp-card-large-number">{labCompleted}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Ready for Review</span>
                  <span className="erp-card-detail-value">{labCompleted} Completed Today</span>
                </div>
              </div>
            </div>

            {/* Card 5: Recent Prescriptions */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#e11d48' }}><path d="M20.5 7.5a4.95 4.95 0 0 1 0 7l-6 6a4.95 4.95 0 0 1-7 0 4.95 4.95 0 0 1 0-7l6-6a4.95 4.95 0 0 1 7 0z"/><line x1="8.5" y1="15.5" x2="15.5" y2="8.5"/></svg>
                <span className="erp-card-header-title">Recent Prescriptions</span>
              </div>
              <span className="erp-card-large-number">12</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Fulfillment</span>
                  <span className="erp-card-detail-value">Sent to Pharmacy</span>
                </div>
              </div>
            </div>
          </>
        );

      case 'nurse_pharmacy':
        return (
          <>
            {/* Card 1: Registrations Today */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#3b82f6' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <span className="erp-card-header-title">Registrations Today</span>
              </div>
              <span className="erp-card-large-number">{newPatients}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Total Registered Today</span>
                  <span className="erp-card-detail-value">{newPatients} Patients</span>
                </div>
              </div>
            </div>

            {/* Card 2: OPD Queue */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#a855f7' }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                <span className="erp-card-header-title">OPD Queue</span>
              </div>
              <span className="erp-card-large-number">{opdWaiting}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Waiting in Queue</span>
                  <span className="erp-card-detail-value">{opdWaiting} Patients</span>
                </div>
              </div>
            </div>

            {/* Card 3: IPD Admissions */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#10b981' }}><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
                <span className="erp-card-header-title">IPD Admissions</span>
              </div>
              <span className="erp-card-large-number">{ipdAdmitted}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Admissions Today</span>
                  <span className="erp-card-detail-value">{ipdAdmitted} Patients Admitted</span>
                </div>
              </div>
            </div>

            {/* Card 4: Available Beds */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#0d9488' }}><path d="M2 4v16M2 14h20M22 14v6M2 18h20"/></svg>
                <span className="erp-card-header-title">Available Beds</span>
              </div>
              <span className="erp-card-large-number">{ipdAvailableBeds}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label">Total Beds</span>
                  <span className="erp-card-detail-value">{totalBedsCount}</span>
                </div>
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label">Occupied</span>
                  <span className="erp-card-detail-value">{ipdOccupiedBeds}</span>
                </div>
              </div>
            </div>

            {/* Card 5: Medicine Stock Alerts */}
            <div className="erp-dashboard-card" style={{ padding: '16px', border: '1.5px solid rgba(244, 63, 94, 0.2)' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#dc2626' }}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span className="erp-card-header-title" style={{ color: '#dc2626' }}>Medicine Stock Alerts</span>
              </div>
              <span className="erp-card-large-number" style={{ color: '#dc2626' }}>{pharmLowStock}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label" style={{ color: '#b45309' }}>Low Stock</span>
                  <span className="erp-card-detail-value" style={{ color: '#b45309' }}>{pharmLowStock} Items</span>
                </div>
                <div className="erp-card-detail-item">
                  <span className="erp-card-detail-label" style={{ color: '#b45309' }}>Out of Stock</span>
                  <span className="erp-card-detail-value" style={{ color: '#b45309' }}>{pharmOutOfStock} Items</span>
                </div>
              </div>
            </div>

            {/* Card 6: Discharges Pending */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#f59e0b' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>
                <span className="erp-card-header-title">Discharges Pending</span>
              </div>
              <span className="erp-card-large-number">{ipdDischarged}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Status</span>
                  <span className="erp-card-detail-value">Awaiting Billing Clearance</span>
                </div>
              </div>
            </div>
          </>
        );

      case 'technician':
        return (
          <>
            {/* Card 1: Samples Received */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#10b981' }}><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
                <span className="erp-card-header-title">Samples Received</span>
              </div>
              <span className="erp-card-large-number">{samplesCollectedToday}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Total Collected Today</span>
                  <span className="erp-card-detail-value">{samplesCollectedToday} Specimens</span>
                </div>
              </div>
            </div>

            {/* Card 2: Samples Processing */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#3b82f6' }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82"/></svg>
                <span className="erp-card-header-title">Samples Processing</span>
              </div>
              <span className="erp-card-large-number">{samplesProcessingToday}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Active Analyzer Runs</span>
                  <span className="erp-card-detail-value">In-Progress on Machines</span>
                </div>
              </div>
            </div>

            {/* Card 3: Samples Completed */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#a855f7' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/></svg>
                <span className="erp-card-header-title">Samples Completed</span>
              </div>
              <span className="erp-card-large-number">{samplesCompletedToday}</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Results Filled</span>
                  <span className="erp-card-detail-value">Pending Verification</span>
                </div>
              </div>
            </div>

            {/* Card 4: Reports Delivered */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#06b6d4' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
                <span className="erp-card-header-title">Reports Delivered</span>
              </div>
              <span className="erp-card-large-number">65</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Pushed to EMR</span>
                  <span className="erp-card-detail-value">Available to CMO/Practitioner</span>
                </div>
              </div>
            </div>

            {/* Card 5: Machine Status */}
            <div className="erp-dashboard-card" style={{ padding: '16px' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#4b5563' }}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
                <span className="erp-card-header-title">Machine Status</span>
              </div>
              <span className="erp-card-large-number" style={{ fontSize: '20px', paddingTop: '8px', paddingBottom: '8px' }}>7 Online, 1 Maint.</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label">Analyzers Online</span>
                  <span className="erp-card-detail-value">ESR under Calibration</span>
                </div>
              </div>
            </div>

            {/* Card 6: Pending Verification */}
            <div className="erp-dashboard-card" style={{ padding: '16px', border: '1.5px solid rgba(244, 63, 94, 0.2)' }}>
              <div className="erp-card-header-flex">
                <svg viewBox="0 0 24 24" style={{ stroke: '#e11d48' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span className="erp-card-header-title" style={{ color: '#e11d48' }}>Pending Verification</span>
              </div>
              <span className="erp-card-large-number" style={{ color: '#e11d48' }}>3</span>
              <div className="erp-card-details-grid">
                <div className="erp-card-detail-item" style={{ gridColumn: 'span 2' }}>
                  <span className="erp-card-detail-label" style={{ color: '#b45309' }}>Validation Queue</span>
                  <span className="erp-card-detail-value" style={{ color: '#b45309' }}>Awaiting Signoff</span>
                </div>
              </div>
            </div>
          </>
        );

      case 'admin':
      default:
        return (
          <>
            {/* Card 1: Patients Today */}
            <div className="erp-dashboard-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '190px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.03)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', textAlign: 'center', color: '#475569', margin: 0 }}>Patients Today</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '42px', fontWeight: '900', color: '#1e293b', lineHeight: '1' }}>{patientAdmission.toString().padStart(2, '0')}</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', marginTop: '6px' }}>Patient Admission</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569', borderBottom: '1px dashed rgba(0,0,0,0.06)', paddingBottom: '4px' }}>
                    <span>Patient Under Treatment</span>
                    <span style={{ color: '#0f172a' }}>{underTreatment.toString().padStart(2, '0')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569' }}>
                    <span>Patient Discharge</span>
                    <span style={{ color: '#0f172a' }}>{dischargedPatients.toString().padStart(2, '0')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Expense Today */}
            <div className="erp-dashboard-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '190px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.03)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', textAlign: 'center', color: '#475569', margin: 0 }}>Expense Today</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr', alignItems: 'center', marginTop: '10px', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', lineHeight: '1' }}>4270.00</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', marginTop: '6px' }}>Expense</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width="50" height="24" viewBox="0 0 50 24" style={{ overflow: 'visible' }}>
                    <path d="M0,18 Q12.5,2 25,14 T50,8" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M0,18 Q12.5,2 25,14 T50,8 L50,24 L0,24 Z" fill="rgba(239, 68, 68, 0.08)" />
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', lineHeight: '1' }}>80430.00</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', marginTop: '6px' }}>This Month</span>
                </div>
              </div>
            </div>

            {/* Card 3: Collection Today */}
            <div className="erp-dashboard-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '190px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.03)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', textAlign: 'center', color: '#475569', margin: 0 }}>Collection Today</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '130px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569', borderBottom: '1px dashed rgba(0,0,0,0.06)', paddingBottom: '4px' }}>
                    <span>Clinic</span>
                    <span style={{ color: '#0f172a' }}>6200.00</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569' }}>
                    <span>Lab</span>
                    <span style={{ color: '#0f172a' }}>4500.00</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', lineHeight: '1' }}>10700.00</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', marginTop: '6px' }}>Total</span>
                </div>
              </div>
            </div>

            {/* Card 4: Due (Not Collected) */}
            <div className="erp-dashboard-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '190px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.03)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', textAlign: 'center', color: '#475569', margin: 0 }}>Due (Not Collected)</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '130px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569', borderBottom: '1px dashed rgba(0,0,0,0.06)', paddingBottom: '4px' }}>
                    <span>Clinic</span>
                    <span style={{ color: '#0f172a' }}>60200.00</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569' }}>
                    <span>Lab</span>
                    <span style={{ color: '#0f172a' }}>72910.00</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', lineHeight: '1' }}>133110.00</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', marginTop: '6px' }}>Total</span>
                </div>
              </div>
            </div>

            {/* Card 5: Lab Reports Today */}
            <div className="erp-dashboard-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '190px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.03)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', textAlign: 'center', color: '#475569', margin: 0 }}>Lab Reports Today</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px', fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(0,0,0,0.04)' }}>
                    <span>Pending</span>
                    <span>{pending.toString().padStart(2, '0')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(0,0,0,0.04)' }}>
                    <span>Sample collection</span>
                    <span>{sampleCollection.toString().padStart(2, '0')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(0,0,0,0.04)' }}>
                    <span>Processing</span>
                    <span>{processing.toString().padStart(2, '0')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(0,0,0,0.04)' }}>
                    <span>Completed</span>
                    <span>{completed.toString().padStart(2, '0')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Delivered</span>
                    <span>{delivered.toString().padStart(2, '0')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '42px', fontWeight: '900', color: '#1e293b', lineHeight: '1' }}>{totalReports}</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', marginTop: '6px' }}>Total</span>
                </div>
              </div>
            </div>

            {/* Card 6: Available Bed */}
            <div className="erp-dashboard-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '190px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.03)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', textAlign: 'center', color: '#475569', margin: 0 }}>Available Bed</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569', borderBottom: '1px dashed rgba(0,0,0,0.06)', paddingBottom: '4px' }}>
                    <span>Cabin</span>
                    <span style={{ color: '#0f172a' }}>{cabin.toString().padStart(2, '0')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '700', color: '#475569' }}>
                    <span>Bed</span>
                    <span style={{ color: '#0f172a' }}>{bed.toString().padStart(2, '0')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '42px', fontWeight: '900', color: '#1e293b', lineHeight: '1' }}>{totalBeds.toString().padStart(2, '0')}</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', marginTop: '6px' }}>Total</span>
                </div>
              </div>
            </div>
          </>
        );
    }
  };

  // Check which widgets to show at the bottom
  const showPatientTrend = ['admin', 'doctor', 'nurse_pharmacy'].includes(activeRole);
  const showRevenueTrend = ['admin'].includes(activeRole);
  const showTopTests = ['admin', 'doctor', 'technician'].includes(activeRole);
  const showTopMeds = ['admin', 'nurse_pharmacy'].includes(activeRole);

  // Calculate dynamic grid column layout for widgets based on active role
  const getWidgetsGridTemplate = () => {
    let count = 0;
    if (showPatientTrend) count++;
    if (showRevenueTrend) count++;
    if (showTopTests) count++;
    if (showTopMeds) count++;

    if (count === 4) return '2.8fr 2.8fr 2.2fr 2.2fr';
    if (count === 3) return '1.5fr 1fr 1fr';
    if (count === 2) return '1fr 1fr';
    return '1fr';
  };

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Dynamic Cards Grid */}
      <div className="erp-cards-grid" style={{ 
        padding: '0 32px 20px 32px', 
        gridTemplateColumns: activeRole === 'admin' ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)'
      }}>
        {renderDashboardCards()}
      </div>

      {/* Bottom Trends and Lists Grid */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: getWidgetsGridTemplate(), 
          gap: '20px', 
          padding: '0 32px 32px 32px', 
          width: '100%',
          alignItems: 'start'
        }}
      >
        
        {/* Patient Trend Line Chart Widget */}
        {showPatientTrend && (
          <div className="panel-card" style={{ padding: '16px', borderRadius: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Patient Trend (This Week)
            </h4>
            <div style={{ position: 'relative', height: '140px' }}>
              <svg width="100%" height="100%" viewBox="0 0 240 120" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="patientAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {/* Grid lines */}
                <line x1="20" y1="20" x2="220" y2="20" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                <line x1="20" y1="60" x2="220" y2="60" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                <line x1="20" y1="100" x2="220" y2="100" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                
                {/* Axis labels left */}
                <text x="12" y="23" fill="var(--text-muted)" fontSize="8" textAnchor="end">150</text>
                <text x="12" y="63" fill="var(--text-muted)" fontSize="8" textAnchor="end">100</text>
                <text x="12" y="103" fill="var(--text-muted)" fontSize="8" textAnchor="end">50</text>
                <text x="12" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="end">0</text>

                {/* Area & Line */}
                <path d="M 20 100 L 20 77 L 53 69 L 86 61 L 119 56 L 152 66 L 185 72 L 218 74 L 218 100 Z" fill="url(#patientAreaGrad)" />
                <path d="M 20 77 L 53 69 L 86 61 L 119 56 L 152 66 L 185 72 L 218 74" fill="none" stroke="#3b82f6" strokeWidth="2.5" />
                
                {/* Dots and Labels */}
                <circle cx="20" cy="77" r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                <text x="20" y="70" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">80</text>
                
                <circle cx="53" cy="69" r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                <text x="53" y="62" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">95</text>
                
                <circle cx="86" cy="61" r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                <text x="86" y="54" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">110</text>
                
                <circle cx="119" cy="56" r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                <text x="119" y="49" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">120</text>
                
                <circle cx="152" cy="66" r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                <text x="152" y="59" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">100</text>
                
                <circle cx="185" cy="72" r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                <text x="185" y="65" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">90</text>
                
                <circle cx="218" cy="74" r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                <text x="218" y="67" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">85</text>

                {/* Days labels */}
                <text x="20" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Mon</text>
                <text x="53" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Tue</text>
                <text x="86" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Wed</text>
                <text x="119" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Thu</text>
                <text x="152" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Fri</text>
                <text x="185" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Sat</text>
                <text x="218" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Sun</text>
              </svg>
            </div>
          </div>
        )}

        {/* Revenue Trend Line Chart Widget */}
        {showRevenueTrend && (
          <div className="panel-card" style={{ padding: '16px', borderRadius: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Revenue Trend (This Week)
            </h4>
            <div style={{ position: 'relative', height: '140px' }}>
              <svg width="100%" height="100%" viewBox="0 0 240 120" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {/* Grid lines */}
                <line x1="20" y1="20" x2="220" y2="20" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                <line x1="20" y1="60" x2="220" y2="60" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                <line x1="20" y1="100" x2="220" y2="100" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                
                {/* Axis labels left */}
                <text x="12" y="23" fill="var(--text-muted)" fontSize="8" textAnchor="end">60K</text>
                <text x="12" y="63" fill="var(--text-muted)" fontSize="8" textAnchor="end">40K</text>
                <text x="12" y="103" fill="var(--text-muted)" fontSize="8" textAnchor="end">20K</text>
                <text x="12" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="end">0</text>

                {/* Area & Line */}
                <path d="M 20 100 L 20 89 L 53 80 L 86 70 L 119 62 L 152 71 L 185 79 L 218 84 L 218 100 Z" fill="url(#revenueAreaGrad)" />
                <path d="M 20 89 L 53 80 L 86 70 L 119 62 L 152 71 L 185 79 L 218 84" fill="none" stroke="#10b981" strokeWidth="2.5" />
                
                {/* Dots and Labels */}
                <circle cx="20" cy="89" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                <text x="20" y="82" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">28K</text>
                
                <circle cx="53" cy="80" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                <text x="53" y="73" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">35K</text>
                
                <circle cx="86" cy="70" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                <text x="86" y="63" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">42K</text>
                
                <circle cx="119" cy="62" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                <text x="119" y="55" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">48K</text>
                
                <circle cx="152" cy="71" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                <text x="152" y="64" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">41K</text>
                
                <circle cx="185" cy="79" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                <text x="185" y="72" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">36K</text>
                
                <circle cx="218" cy="84" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                <text x="218" y="77" fill="#1e293b" fontSize="8" fontWeight="700" textAnchor="middle">32K</text>

                {/* Days labels */}
                <text x="20" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Mon</text>
                <text x="53" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Tue</text>
                <text x="86" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Wed</text>
                <text x="119" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Thu</text>
                <text x="152" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Fri</text>
                <text x="185" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Sat</text>
                <text x="218" y="118" fill="var(--text-muted)" fontSize="8" textAnchor="middle">Sun</text>
              </svg>
            </div>
          </div>
        )}

        {/* Top 5 Tests Today Widget */}
        {showTopTests && (
          <div className="panel-card" style={{ padding: '16px', borderRadius: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Top 5 Tests Today
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { name: 'CBC', count: 18 },
                { name: 'Lipid Profile', count: 12 },
                { name: 'Thyroid Profile', count: 10 },
                { name: 'Blood Sugar (F)', count: 8 },
                { name: 'Urine Routine', count: 7 }
              ].map((test, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    fontSize: '11px',
                    borderBottom: '1px solid rgba(0,0,0,0.03)',
                    paddingBottom: '6px'
                  }}
                >
                  <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>{test.name}</span>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{test.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top 5 Medicines Dispensed Widget */}
        {showTopMeds && (
          <div className="panel-card" style={{ padding: '16px', borderRadius: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Top 5 Medicines Dispensed
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { name: 'Paracetamol', count: 32 },
                { name: 'Amoxicillin', count: 18 },
                { name: 'Pantoprazole', count: 15 },
                { name: 'Cetirizine', count: 14 },
                { name: 'Vitamin D3', count: 12 }
              ].map((med, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    fontSize: '11px',
                    borderBottom: '1px solid rgba(0,0,0,0.03)',
                    paddingBottom: '6px'
                  }}
                >
                  <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>{med.name}</span>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{med.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clinician Performance Metrics (Admin Only) */}
        {activeRole === 'admin' && (
          <div className="panel-card col-12" style={{ padding: '20px', borderRadius: '16px', marginTop: '10px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '12px' }}>
              🩺 Clinician Performance & Consultations Ledger
            </h4>
            {reportLoading ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading clinician statistics...</div>
            ) : docPerfData.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No clinician data recorded today.</div>
            ) : (
              <div className="table-responsive">
                <table className="data-table" style={{ margin: 0, fontSize: '11.5px' }}>
                  <thead>
                    <tr>
                      <th>Doctor Profile</th>
                      <th style={{ textAlign: 'center' }}>OPD Tokens Issued</th>
                      <th style={{ textAlign: 'center' }}>Consultations Completed</th>
                      <th style={{ textAlign: 'center' }}>Prescriptions Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docPerfData.map((d, index) => (
                      <tr key={index}>
                        <td><strong>{d.doctorName}</strong></td>
                        <td style={{ textAlign: 'center', fontWeight: '600' }}>{d.opdCount}</td>
                        <td style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: '700' }}>{d.completedCount}</td>
                        <td style={{ textAlign: 'center' }}>{d.rxCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
