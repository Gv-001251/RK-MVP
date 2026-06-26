"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const ClinicContext = createContext();

export function useClinic() {
  return useContext(ClinicContext);
}

export function ClinicProvider({ children }) {
  // Config state
  const [currency, setCurrency] = useState('$');
  const [doctorName, setDoctorName] = useState('Dr. R. Kumar');
  const [doctorRole, setDoctorRole] = useState('Managing Director & CMO');
  const [clinicName, setClinicName] = useState('RK Clinic');
  
  // Theme state
  const [darkMode, setDarkMode] = useState(false);

  // Initial Seed Data
  const [patients, setPatients] = useState([
    {
      id: 'PAT-000001',
      name: 'Al Amin',
      age: 32,
      gender: 'Male',
      phone: '9440183421',
      email: 'al.amin@mail.com',
      blood: 'O-',
      allergies: 'None',
      address: 'Riyadh',
      emergencyContact: 'Ahmad Amin (+966-501234567)',
      visitStatus: 'Waiting',
      lastConsultation: 'Routine Dental scaling',
      dob: '02/12/1990',
      createdDate: '10/08/2023',
      visitTime: '10:00 AM',
      type: 'UPNC',
      status: 'Pending'
    },
    {
      id: 'PAT-000002',
      name: 'Faraj Bin Ahmad',
      age: 23,
      gender: 'Male',
      phone: '8220019234',
      email: 'faraj.b@mail.com',
      blood: 'A+',
      allergies: 'None',
      address: 'Jeddah',
      emergencyContact: 'Ahmad Bin Faraj (+966-502345678)',
      visitStatus: 'In-Consultation',
      lastConsultation: 'Cardiology Checkup',
      dob: '10/08/2000',
      createdDate: '26/07/2023',
      visitTime: '08:20 PM',
      type: 'FNXX',
      status: 'Confirmed'
    },
    {
      id: 'PAT-000003',
      name: 'Fayruz Husniya',
      age: 42,
      gender: 'Female',
      phone: '7200177890',
      email: 'fayruz@mail.com',
      blood: 'AB+',
      allergies: 'None',
      address: 'Dammam',
      emergencyContact: 'Husniya Jameel (+966-503456789)',
      visitStatus: 'Completed',
      lastConsultation: 'Cardiovascular Stress Test',
      dob: '11/11/1980',
      createdDate: '13/07/2023',
      visitTime: '07:11 AM',
      type: 'FPA+CCN',
      status: 'Confirmed'
    },
    {
      id: 'PAT-000004',
      name: 'Muammar Ghazzawi',
      age: 20,
      gender: 'Male',
      phone: '9000156723',
      email: 'muammar@mail.com',
      blood: 'O+',
      allergies: 'Sulfa Drugs',
      address: 'Makkah',
      emergencyContact: 'Ghazzawi Ali (+966-504567890)',
      visitStatus: 'Waiting',
      lastConsultation: 'Minor Chest Bruising',
      dob: '07/04/2003',
      createdDate: '01/07/2023',
      visitTime: '05:13 PM',
      type: 'AUN',
      status: 'Pending'
    },
    {
      id: 'PAT-000005',
      name: 'Aaliyah Bin Salih',
      age: 20,
      gender: 'Female',
      phone: '9840123456',
      email: 'aaliyah@mail.com',
      blood: 'AB-',
      allergies: 'None',
      address: 'Medina',
      emergencyContact: 'Salih Bin Yusuf (+966-505678901)',
      visitStatus: 'Scheduled',
      lastConsultation: 'Annual General Vitals',
      dob: '28/07/2020',
      createdDate: '10/06/2023',
      visitTime: '10:45 AM',
      type: 'DCP',
      status: 'Confirmed'
    }
  ]);

  const [queue, setQueue] = useState([
    { token: '101', patientId: 'PAT-000002', doctor: 'Dr. Abdul Kareem', specialty: 'Cardiology', status: 'In-Consultation', checkin: '09:15 AM' },
    { token: '102', patientId: 'PAT-000001', doctor: 'Dr. Abdul Kareem', specialty: 'Cardiology', status: 'Waiting', checkin: '09:30 AM' },
    { token: '103', patientId: 'PAT-000004', doctor: 'Dr. Abdul Kareem', specialty: 'Cardiology', status: 'Waiting', checkin: '10:00 AM' }
  ]);

  const [inpatients, setInpatients] = useState([
    { bed: 'Ward A - Bed 3', patientId: 'PAT-000001', diagnosis: 'Acute Myocardial Infarction', date: '2026-06-02', doctor: 'Dr. Abdul Kareem', vitals: 'Pulse: 72, BP: 125/82', billing: 'Pending' },
    { bed: 'ICU - Bed 1', patientId: 'PAT-000002', diagnosis: 'Severe Cardiac Arrhythmia', date: '2026-06-03', doctor: 'Dr. Abdul Kareem', vitals: 'Pulse: 98, BP: 140/90', billing: 'Covered (Insurance)' }
  ]);

  const [nursingNotes, setNursingNotes] = useState([
    { time: '10 mins ago', author: 'Nurse Emily Smith, RN', priority: 'Critical', patientId: 'PAT-000001', text: 'Administered 50mg Metoprolol. Patient pulse stabilized at 72bpm. Monitoring BP every 15 mins.' },
    { time: '1 hour ago', author: 'Nurse Jessica Taylor', priority: 'Routine', patientId: 'PAT-000002', text: 'Normal ECG run. Inpatient resting comfortably. Oxygen levels stable at 98% on room air.' }
  ]);

  const [inventory, setInventory] = useState([
    { id: 1, name: 'Metoprolol 50mg', category: 'Beta-blocker', stock: 12, threshold: 30, price: 1.20, expiry: '2027-08-30', batchNumber: 'B-MET908' },
    { id: 2, name: 'Amlodipine 5mg', category: 'Beta-blocker', stock: 120, threshold: 25, price: 0.85, expiry: '2026-12-15', batchNumber: 'B-AML231' },
    { id: 3, name: 'Amoxicillin 500mg', category: 'Antibiotic', stock: 24, threshold: 40, price: 2.10, expiry: '2027-04-18', batchNumber: 'B-AMX402' },
    { id: 4, name: 'Atorvastatin 20mg', category: 'Anticoagulant', stock: 350, threshold: 50, price: 1.50, expiry: '2028-02-22', batchNumber: 'B-ATO112' },
    { id: 5, name: 'Albuterol Inhaler', category: 'Inhaler', stock: 8, threshold: 10, price: 22.00, expiry: '2027-11-05', batchNumber: 'B-ALB984' },
    { id: 6, name: 'Paracetamol 650mg', category: 'Analgesic', stock: 150, threshold: 30, price: 15.00, expiry: '2027-09-30', batchNumber: 'B-PAR701' },
    { id: 7, name: 'Metformin 500mg', category: 'Antidiabetic', stock: 200, threshold: 40, price: 18.00, expiry: '2028-01-15', batchNumber: 'B-MET500' },
    { id: 8, name: 'Pantoprazole 40mg', category: 'Antacid', stock: 80, threshold: 20, price: 45.00, expiry: '2027-11-20', batchNumber: 'B-PAN040' },
    { id: 9, name: 'Insulin Glargine', category: 'Hormone', stock: 25, threshold: 5, price: 420.00, expiry: '2026-12-05', batchNumber: 'B-INS100' },
    { id: 10, name: 'Cetirizine 10mg', category: 'Antihistamine', stock: 120, threshold: 25, price: 14.00, expiry: '2027-06-30', batchNumber: 'B-CET010' }
  ]);

  const [prescriptions, setPrescriptions] = useState([
    {
      id: 'RK-RX-701',
      date: '2026-06-04',
      patientId: 'PAT-000003',
      diagnosis: 'Hypertensive Heart Disease',
      meds: [
        { name: 'Amlodipine 5mg', dose: '1-0-0 (after breakfast)', duration: '30 Days' },
        { name: 'Atorvastatin 20mg', dose: '0-0-1 (before bed)', duration: '30 Days' }
      ],
      symptoms: 'Mild chest heaviness, elevated BP 145/95 during last physical.',
      status: 'Fulfilled'
    }
  ]);

  const [invoices, setInvoices] = useState([
    { id: 'RK-INV-2026-01', date: '2026-06-04', patientId: 'PAT-000003', amount: 350.00, mode: 'Card', status: 'Paid', items: [{ desc: 'Cardiovascular Stress Test', price: 250 }, { desc: 'Specialist Consultation', price: 100 }] },
    { id: 'RK-INV-2026-02', date: '2026-06-04', patientId: 'PAT-000001', amount: 1500.00, mode: 'Insurance', status: 'Pending', items: [{ desc: 'Emergency Ward Admission Fee', price: 1000 }, { desc: 'ECG + Cardiac Diagnostics', price: 500 }] },
    { id: 'RK-INV-2026-03', date: '2026-06-04', patientId: 'PAT-000002', amount: 480.00, mode: 'Cash', status: 'Paid', items: [{ desc: 'Consultation Fee', price: 150 }, { desc: 'ECG Diagnostics', price: 250 }, { desc: 'Pharmacy Dispense', price: 80 }] }
  ]);

  const [appointments, setAppointments] = useState([
    { date: '2026-06-04', time: '04:30 PM', patientId: 'PAT-000001', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'procedure', title: 'Dental scaling and polishing', hospital: 'Al-Sheikh Bin Jalal Dental Hospital' },
    { date: '2026-06-08', time: '10:00 AM', patientId: 'PAT-000002', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'appointment', title: 'Cardiology Checkup', hospital: 'RK Specialty Clinic' },
    { date: '2026-06-15', time: '02:00 PM', patientId: 'PAT-000003', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'meeting', title: 'Clinical Review Session', hospital: 'RK Specialty Clinic' },
    { date: '2026-06-23', time: '11:00 AM', patientId: 'PAT-000004', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'procedure', title: 'Minor Surgery Follow-up', hospital: 'Al-Sheikh Bin Jalal Dental Hospital' }
  ]);

  const [users, setUsers] = useState([
    { username: 'admin@rkclinic.com', fullName: 'Administrator', role: 'admin', email: 'admin@rkclinic.com', cabin: 'Administration Block' },
    { username: 'doc@rkclinic.com', fullName: 'Doctor (MD)', role: 'doctor', email: 'doc@rkclinic.com', cabin: 'Cabin A - First Floor' },
    { username: 'medic@rkclinic.com', fullName: 'Nurse & Pharmacy', role: 'nurse_pharmacy', email: 'medic@rkclinic.com', cabin: 'Nursing Station & Pharmacy' },
    { username: 'lab@rkclinic.com', fullName: 'Laboratory Technician', role: 'technician', email: 'lab@rkclinic.com', cabin: 'Pathology Lab' }
  ]);

  const [backups, setBackups] = useState([
    { filename: 'rk_clinic_backup_20260601.sql', date: '2026-06-01 10:00 AM', size: '2.4 MB', type: 'Scheduled' },
    { filename: 'rk_clinic_backup_20260603.sql', date: '2026-06-03 11:30 PM', size: '2.5 MB', type: 'Manual' }
  ]);

  const [activeRole, setActiveRole] = useState('admin'); // Default role for prototype simulation
  const [user, setUser] = useState(null);

  // LIS State Variables
  const [labRequests, setLabRequests] = useState([
    { id: 'SMP-000001', specimenId: 'SPM-000001', patientId: 'PAT-000001', patientName: 'Al Amin', testName: 'Complete Blood Count (CBC)', status: 'Verified', result: 'Hb: 14.5 g/dL, WBC: 7,500/cumm', collectedAt: '2026-06-16 09:30 AM', verifiedAt: '2026-06-16 10:15 AM' },
    { id: 'SMP-000002', specimenId: 'SPM-000002', patientId: 'PAT-000002', patientName: 'Faraj Bin Ahmad', testName: 'Lipid Profile', status: 'Pending Verification', result: 'Cholesterol: 240 mg/dL (High)', collectedAt: '2026-06-16 10:00 AM', verifiedAt: null },
    { id: 'SMP-000003', specimenId: 'SPM-000003', patientId: 'PAT-000004', patientName: 'Muammar Ghazzawi', testName: 'Thyroid Profile (TSH)', status: 'Processing', result: null, collectedAt: '2026-06-16 10:30 AM', verifiedAt: null },
    { id: 'SMP-000004', specimenId: 'SPM-000004', patientId: 'PAT-000003', patientName: 'Fayruz Husniya', testName: 'Blood Sugar Fasting (FBS)', status: 'Collected', result: null, collectedAt: '2026-06-16 11:00 AM', verifiedAt: null },
  ]);
  const [labOrders, setLabOrders] = useState([
    {
      labOrderNumber: 'LAB-000001',
      patientId: 'PAT-000001',
      patientName: 'Al Amin',
      visitId: 'VIS-000001',
      status: 'Pending Sample Collection',
      orderTime: '16/06/2026 09:15 AM',
      orderedTests: ['CBC', 'HbA1c', 'Lipid Profile'],
      doctorName: 'Dr. Aditya Dev'
    },
    {
      labOrderNumber: 'LAB-000002',
      patientId: 'PAT-000002',
      patientName: 'Faraj Bin Ahmad',
      visitId: 'VIS-000002',
      status: 'Pending Sample Collection',
      orderTime: '17/06/2026 09:30 AM',
      orderedTests: ['Lipid Profile', 'Kidney Function Test (KFT)'],
      doctorName: 'Dr. R. Kumar'
    }
  ]);
  const [labTasks, setLabTasks] = useState([
    {
      taskId: 'LAB-2026-0001',
      patientId: 'RK-0001',
      clinicPatientId: 'PAT-000001',
      patientName: 'Al Amin',
      age: 32,
      gender: 'Male',
      phone: '9440183421',
      doctorName: 'Dr. Aditya Dev',
      opdNumber: 'Token 102',
      specimenId: 'RKLAB-0001',
      status: 'Verified',
      orderedTests: ['CBC', 'HbA1c', 'Lipid Profile'],
      testResults: {
        'CBC': { val: 'Hemoglobin (Hb): 14.5 g/dL (Ref: 12-16), WBC: 7,500/cumm (Ref: 4000-11000), Platelet Count: 2.8 L/cumm', machine: 'Hematology Analyzer', completedAt: '2026-06-16 10:15 AM' },
        'HbA1c': { val: 'HbA1c: 5.6 % (Normal) (Ref: < 5.7%)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-06-16 10:20 AM' },
        'Lipid Profile': { val: 'Total Cholesterol: 180 mg/dL (Ref: < 200), HDL: 45 mg/dL (Ref: > 40), Triglycerides: 140 mg/dL (Ref: < 150)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-06-16 10:25 AM' }
      },
      verifiedBy: 'Dr. S. Vardhan, MD',
      verifiedAt: '2026-06-16 11:00 AM',
      remarks: 'All parameters within physiological limits.'
    },
    {
      taskId: 'LAB-2026-0001-H1',
      patientId: 'RK-0001',
      clinicPatientId: 'PAT-000001',
      patientName: 'Al Amin',
      age: 32,
      gender: 'Male',
      phone: '9440183421',
      doctorName: 'Dr. Aditya Dev',
      opdNumber: 'Token 45',
      specimenId: 'RKLAB-0001-H1',
      status: 'Verified',
      orderedTests: ['CBC', 'HbA1c', 'Lipid Profile'],
      testResults: {
        'CBC': { val: 'Hemoglobin (Hb): 13.2 g/dL (Ref: 12-16), WBC: 8,200/cumm, Platelet Count: 2.5 L/cumm', machine: 'Hematology Analyzer', completedAt: '2026-05-15 10:15 AM' },
        'HbA1c': { val: 'HbA1c: 6.4 % (High) (Ref: < 5.7%)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-05-15 10:20 AM' },
        'Lipid Profile': { val: 'Total Cholesterol: 220 mg/dL (High) (Ref: < 200), HDL: 40 mg/dL (Ref: > 40), Triglycerides: 160 mg/dL (High) (Ref: < 150)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-05-15 10:25 AM' }
      },
      verifiedBy: 'Dr. S. Vardhan, MD',
      verifiedAt: '2026-05-15 11:00 AM',
      remarks: 'HbA1c and Lipids elevated. Patient advised diet modifications.'
    },
    {
      taskId: 'LAB-2026-0001-H2',
      patientId: 'RK-0001',
      clinicPatientId: 'PAT-000001',
      patientName: 'Al Amin',
      age: 32,
      gender: 'Male',
      phone: '9440183421',
      doctorName: 'Dr. Aditya Dev',
      opdNumber: 'Token 82',
      specimenId: 'RKLAB-0001-H2',
      status: 'Verified',
      orderedTests: ['CBC', 'HbA1c', 'Lipid Profile'],
      testResults: {
        'CBC': { val: 'Hemoglobin (Hb): 13.9 g/dL (Ref: 12-16), WBC: 7,900/cumm, Platelet Count: 2.7 L/cumm', machine: 'Hematology Analyzer', completedAt: '2026-06-01 10:15 AM' },
        'HbA1c': { val: 'HbA1c: 5.9 % (High) (Ref: < 5.7%)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-06-01 10:20 AM' },
        'Lipid Profile': { val: 'Total Cholesterol: 195 mg/dL (Normal) (Ref: < 200), HDL: 43 mg/dL (Ref: > 40), Triglycerides: 145 mg/dL (Normal) (Ref: < 150)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-06-01 10:25 AM' }
      },
      verifiedBy: 'Dr. S. Vardhan, MD',
      verifiedAt: '2026-06-01 11:00 AM',
      remarks: 'HbA1c showing improvement. Continue medications.'
    },
    {
      taskId: 'LAB-2026-0002',
      patientId: 'RK-0002',
      clinicPatientId: 'PAT-000002',
      patientName: 'Faraj Bin Ahmad',
      age: 23,
      gender: 'Male',
      phone: '8220019234',
      doctorName: 'Dr. R. Kumar',
      opdNumber: 'Token 101',
      specimenId: 'RKLAB-0002',
      status: 'Pending Verification',
      orderedTests: ['Lipid Profile', 'Kidney Function Test (KFT)'],
      testResults: {
        'Lipid Profile': { val: 'Total Cholesterol: 240 mg/dL (High) (Ref: < 200), HDL: 38 mg/dL (Low) (Ref: > 40), Triglycerides: 165 mg/dL (High) (Ref: < 150)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-06-17 09:45 AM' },
        'Kidney Function Test (KFT)': { val: 'Blood Urea: 28 mg/dL (Ref: 15-45), Serum Creatinine: 1.4 mg/dL (High) (Ref: 0.6-1.2)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-06-17 09:50 AM' }
      },
      verifiedBy: null,
      verifiedAt: null,
      remarks: ''
    },
    {
      taskId: 'LAB-2026-0002-H1',
      patientId: 'RK-0002',
      clinicPatientId: 'PAT-000002',
      patientName: 'Faraj Bin Ahmad',
      age: 23,
      gender: 'Male',
      phone: '8220019234',
      doctorName: 'Dr. R. Kumar',
      opdNumber: 'Token 12',
      specimenId: 'RKLAB-0002-H1',
      status: 'Verified',
      orderedTests: ['Lipid Profile', 'Kidney Function Test (KFT)'],
      testResults: {
        'Lipid Profile': { val: 'Total Cholesterol: 260 mg/dL (High) (Ref: < 200), HDL: 35 mg/dL (Low) (Ref: > 40), Triglycerides: 180 mg/dL (High) (Ref: < 150)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-05-10 10:45 AM' },
        'Kidney Function Test (KFT)': { val: 'Blood Urea: 35 mg/dL (Ref: 15-45), Serum Creatinine: 1.6 mg/dL (High) (Ref: 0.6-1.2)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-05-10 10:50 AM' }
      },
      verifiedBy: 'Dr. S. Vardhan, MD',
      verifiedAt: '2026-05-10 11:30 AM',
      remarks: 'Elevated creatinine and lipids. Recommend metabolic evaluation.'
    },
    {
      taskId: 'LAB-2026-0002-H2',
      patientId: 'RK-0002',
      clinicPatientId: 'PAT-000002',
      patientName: 'Faraj Bin Ahmad',
      age: 23,
      gender: 'Male',
      phone: '8220019234',
      doctorName: 'Dr. R. Kumar',
      opdNumber: 'Token 66',
      specimenId: 'RKLAB-0002-H2',
      status: 'Verified',
      orderedTests: ['Lipid Profile', 'Kidney Function Test (KFT)'],
      testResults: {
        'Lipid Profile': { val: 'Total Cholesterol: 250 mg/dL (High) (Ref: < 200), HDL: 37 mg/dL (Low) (Ref: > 40), Triglycerides: 170 mg/dL (High) (Ref: < 150)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-05-25 09:45 AM' },
        'Kidney Function Test (KFT)': { val: 'Blood Urea: 32 mg/dL (Ref: 15-45), Serum Creatinine: 1.5 mg/dL (High) (Ref: 0.6-1.2)', machine: 'Weldon WB-150 Biochemistry Analyzer', completedAt: '2026-05-25 09:50 AM' }
      },
      verifiedBy: 'Dr. S. Vardhan, MD',
      verifiedAt: '2026-05-25 10:30 AM',
      remarks: 'Creatinine remains border high. Monitor hydration status.'
    },
    {
      taskId: 'LAB-2026-0003',
      patientId: 'RK-0003',
      clinicPatientId: 'PAT-000004',
      patientName: 'Muammar Ghazzawi',
      age: 55,
      gender: 'Male',
      phone: '9884029348',
      doctorName: 'Dr. Aditya Dev',
      opdNumber: 'Token 103',
      specimenId: 'RKLAB-0003',
      status: 'Processing',
      orderedTests: ['Thyroid Profile', 'Electrolytes'],
      testResults: {
        'Thyroid Profile': { val: 'TSH: 6.2 uIU/mL (High) (Ref: 0.45 - 4.50), Free T4: 1.1 ng/dL (Ref: 0.8 - 1.8)', machine: 'Maglumi 800', completedAt: '2026-06-17 11:30 AM' }
      },
      verifiedBy: null,
      verifiedAt: null,
      remarks: ''
    }
  ]);
  const [labActiveTab, setLabActiveTab] = useState('dashboard');
  const [ipdActiveTab, setIpdActiveTab] = useState('dashboard');

  const login = (usernameOrEmail, password, selectedRole) => {
    const trimmed = usernameOrEmail.trim().toLowerCase();
    let resolvedRole = selectedRole || 'admin';
    let resolvedName = '';

    if (trimmed === 'admin@rkclinic.com' && password === 'admin@123') {
      resolvedRole = 'admin';
      resolvedName = 'Administrator';
    } else if (trimmed === 'doc@rkclinic.com' && password === 'doc@123') {
      resolvedRole = 'doctor';
      resolvedName = 'Dr. Aditya Dev';
    } else if (trimmed === 'medic@rkclinic.com' && password === 'medic@123') {
      resolvedRole = 'nurse_pharmacy';
      resolvedName = 'Nurse & Pharmacy';
    } else if (trimmed === 'lab@rkclinic.com' && password === 'lab@123') {
      resolvedRole = 'technician';
      resolvedName = 'Lab Technician';
    } else {
      // Compatibility fallback for development/testing
      if (trimmed === 'admin' || trimmed === 'admin_kareem') {
        resolvedRole = 'admin';
        resolvedName = 'Administrator';
      } else if (trimmed === 'doctor' || trimmed === 'doctor_aditya') {
        resolvedRole = 'doctor';
        resolvedName = 'Dr. Aditya Dev';
      } else if (trimmed === 'medic' || trimmed === 'pharmacy_suresh') {
        resolvedRole = 'nurse_pharmacy';
        resolvedName = 'Nurse & Pharmacy';
      } else if (trimmed === 'lab' || trimmed === 'tech_suresh') {
        resolvedRole = 'technician';
        resolvedName = 'Lab Technician';
      } else {
        return false;
      }
    }

    const mockUser = {
      username: resolvedName,
      role: resolvedRole,
      email: trimmed
    };

    setUser(mockUser);
    setActiveRole(mockUser.role);
    return true;
  };

  const logout = () => {
    setUser(null);
    setActiveRole('admin');
  };

  // Sync theme
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // MUTATORS
  
  // 1. Patient CRUD
  const registerPatient = (patientData) => {
    const pId = `PAT-${Math.floor(100000 + Math.random() * 900000)}`;
    const currentYr = new Date().getFullYear();
    const birthYr = currentYr - parseInt(patientData.age);
    const dob = `15/06/${birthYr}`;

    const newPatient = {
      id: pId,
      name: patientData.name,
      age: parseInt(patientData.age),
      gender: patientData.gender,
      phone: patientData.phone,
      email: patientData.email || 'n/a',
      blood: patientData.blood || 'O+',
      allergies: patientData.allergies || 'None',
      address: patientData.address || 'n/a',
      emergencyContact: patientData.emergencyContact || 'n/a',
      visitStatus: 'Waiting',
      lastConsultation: 'Awaiting Examination',
      dob: dob,
      createdDate: new Date().toLocaleDateString('en-GB'),
      visitTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      type: 'UPNC',
      status: 'Confirmed'
    };

    setPatients(prev => [...prev, newPatient]);

    // Push patient automatically to the OPD Consultation Queue
    const nextToken = (queue.length + 101).toString();
    setQueue(prev => [...prev, {
      token: nextToken,
      patientId: pId,
      doctor: `Dr. ${doctorName}`,
      specialty: 'General Consultation',
      status: 'Waiting',
      checkin: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }]);

    // Insert patient log history
    setNursingNotes(prev => [
      {
        time: 'Just now',
        author: 'Frontdesk Clerk',
        priority: 'Routine',
        patientId: pId,
        text: `Patient registered to clinic records. Status assigned: OPD Waiting. Token: ${nextToken}`
      },
      ...prev
    ]);

    return { patientId: pId, token: nextToken };
  };

  const updatePatient = (pId, updatedFields) => {
    setPatients(prev => prev.map(p => p.id === pId ? { ...p, ...updatedFields } : p));
  };

  const deletePatient = (pId) => {
    setPatients(prev => prev.filter(p => p.id !== pId));
    setQueue(prev => prev.filter(q => q.patientId !== pId));
    setInpatients(prev => prev.filter(i => i.patientId !== pId));
  };

  // 2. OPD Queue Flow
  const callNextPatient = () => {
    // 1. Find and complete current active consultation
    let updated = false;
    let nextWaitingToken = null;
    let nextWaitingName = '';

    setQueue(prev => {
      const nextQueue = prev.map(q => {
        if (q.status === 'In-Consultation') {
          q.status = 'Completed';
          updated = true;
          // Set patient visit status
          setPatients(pList => pList.map(p => p.id === q.patientId ? { ...p, visitStatus: 'Completed' } : p));
        }
        return q;
      });

      // 2. Call next waiting patient
      const waitItem = nextQueue.find(q => q.status === 'Waiting');
      if (waitItem) {
        waitItem.status = 'In-Consultation';
        nextWaitingToken = waitItem.token;
        
        setPatients(pList => pList.map(p => {
          if (p.id === waitItem.patientId) {
            nextWaitingName = p.name;
            // Log nursing note
            setNursingNotes(notes => [
              {
                time: 'Just now',
                author: `Dr. ${doctorName}`,
                priority: 'Routine',
                patientId: p.id,
                text: `Patient ${p.name} called into examination room. Token: ${waitItem.token}.`
              },
              ...notes
            ]);
            return { ...p, visitStatus: 'In-Consultation' };
          }
          return p;
        }));
      }

      return nextQueue;
    });

    return { called: !!nextWaitingToken, token: nextWaitingToken, name: nextWaitingName };
  };

  const submitConsultation = (patientId, consultationData) => {
    const rxId = `RK-RX-${Math.floor(100 + Math.random() * 900)}`;
    const billId = `RK-INV-2026-${Math.floor(100 + Math.random() * 900)}`;
    const dateToday = new Date().toISOString().split('T')[0];

    // Create prescription
    const newRx = {
      id: rxId,
      date: dateToday,
      patientId: patientId,
      diagnosis: consultationData.diagnosis,
      meds: consultationData.meds || [],
      symptoms: consultationData.symptoms || 'General weakness',
      status: 'Pending',
      rxHandwriting: consultationData.rxHandwriting || null
    };

    setPrescriptions(prev => [...prev, newRx]);

    // Auto-calculate bill items
    const billingItems = [{ desc: 'Doctor Specialist Consultation', price: 100 }];
    consultationData.meds.forEach(med => {
      const invItem = inventory.find(i => i.name === med.name);
      const qty = parseInt(med.duration) * 2; // general dosage count
      if (invItem) {
        billingItems.push({ desc: `${med.name} (${qty} units)`, price: invItem.price * qty });
      }
    });

    const subtotal = billingItems.reduce((sum, item) => sum + item.price, 0);
    const newInvoice = {
      id: billId,
      date: dateToday,
      patientId: patientId,
      amount: parseFloat(subtotal.toFixed(2)),
      mode: 'Cash',
      status: 'Pending',
      items: billingItems
    };

    setInvoices(prev => [...prev, newInvoice]);

    // Update patient status
    setPatients(prev => prev.map(p => {
      if (p.id === patientId) {
        return {
          ...p,
          visitStatus: 'Completed',
          lastConsultation: consultationData.diagnosis
        };
      }
      return p;
    }));

    // Update queue status
    setQueue(prev => prev.map(q => q.patientId === patientId ? { ...q, status: 'Completed' } : q));

    // Log nursing/clinical note
    setNursingNotes(prev => [
      {
        time: 'Just now',
        author: `Dr. ${doctorName}`,
        priority: 'Routine',
        patientId: patientId,
        text: `Completed consultation for ${consultationData.diagnosis}. Prescription ${rxId} & Invoice ${billId} generated.`
      },
      ...prev
    ]);

    return { rxId, billId };
  };

  // 3. Pharmacy Inventory & Fulfillment
  const dispensePrescription = (rxId) => {
    let success = true;

    setPrescriptions(prev => prev.map(rx => {
      if (rx.id === rxId) {
        // Decrement inventory stock
        rx.meds.forEach(med => {
          setInventory(invList => invList.map(item => {
            if (item.name === med.name) {
              const dispenseQty = (parseInt(med.duration) || 5) * 2;
              const newStock = Math.max(0, item.stock - dispenseQty);
              return { ...item, stock: newStock };
            }
            return item;
          }));
        });

        // Add note
        setNursingNotes(notes => [
          {
            time: 'Just now',
            author: 'Pharmacist Fulfillment',
            priority: 'Routine',
            patientId: rx.patientId,
            text: `Prescription ${rx.id} items fully dispensed to patient.`
          },
          ...notes
        ]);

        return { ...rx, status: 'Fulfilled' };
      }
      return rx;
    }));

    // Find and update billing invoice related to this prescription to Paid (if paid on counter)
    return success;
  };

  const addMedicine = (medData) => {
    setInventory(prev => {
      const existing = prev.find(i => i.name.toLowerCase() === medData.name.toLowerCase());
      if (existing) {
        return prev.map(i => i.name.toLowerCase() === medData.name.toLowerCase() ? { ...i, stock: i.stock + parseInt(medData.stock), expiry: medData.expiry } : i);
      } else {
        const nextId = prev.length > 0 ? Math.max(...prev.map(i => i.id)) + 1 : 1;
        const newItem = {
          id: nextId,
          name: medData.name,
          category: medData.category,
          stock: parseInt(medData.stock),
          threshold: parseInt(medData.threshold || 20),
          price: parseFloat(medData.price),
          expiry: medData.expiry,
          batchNumber: medData.batchNumber || `B-${medData.name.slice(0,3).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`
        };
        return [...prev, newItem];
      }
    });
  };

  const updateMedicine = (id, updatedFields) => {
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...updatedFields } : i));
  };

  const deleteMedicine = (id) => {
    setInventory(prev => prev.filter(i => i.id !== id));
  };

  // 4. Billing Operations
  const recordPayment = (invoiceId, mode) => {
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'Paid', mode } : inv));
  };

  const createInvoice = (patientId, items, paymentMode, status) => {
    const billId = `RK-INV-2026-${Math.floor(100 + Math.random() * 900)}`;
    const subtotal = items.reduce((sum, i) => sum + i.price, 0);
    const newInvoice = {
      id: billId,
      date: new Date().toISOString().split('T')[0],
      patientId,
      amount: parseFloat(subtotal.toFixed(2)),
      mode: paymentMode,
      status: status || (paymentMode === 'Insurance' ? 'Pending' : 'Paid'),
      items
    };

    setInvoices(prev => [...prev, newInvoice]);
    return billId;
  };

  // 5. User management
  const addUser = (userData) => {
    setUsers(prev => [...prev, userData]);
  };

  const deleteUser = (username) => {
    setUsers(prev => prev.filter(u => u.username !== username));
  };

  // 6. Backups
  const runBackup = () => {
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const nextBackup = {
      filename: `rk_clinic_backup_${dateStr}_${Math.floor(1000 + Math.random() * 9000)}.sql`,
      date: `${new Date().toISOString().split('T')[0]} ${timeStr}`,
      size: '2.5 MB',
      type: 'Manual'
    };
    setBackups(prev => [nextBackup, ...prev]);
  };

  return (
    <ClinicContext.Provider value={{
      currency, setCurrency,
      doctorName, setDoctorName,
      doctorRole, setDoctorRole,
      clinicName, setClinicName,
      darkMode, setDarkMode,
      
      patients,
      queue, setQueue,
      inpatients,
      nursingNotes, setNursingNotes,
      inventory,
      prescriptions,
      invoices,
      appointments,
      users,
      backups,
      activeRole, setActiveRole,
      user, setUser,
      
      // LIS State
      labRequests, setLabRequests,
      labOrders, setLabOrders,
      labTasks, setLabTasks,
      labActiveTab, setLabActiveTab,
      ipdActiveTab, setIpdActiveTab,
      
      // Actions
      login,
      logout,
      registerPatient,
      updatePatient,
      deletePatient,
      callNextPatient,
      submitConsultation,
      dispensePrescription,
      addMedicine,
      updateMedicine,
      deleteMedicine,
      recordPayment,
      createInvoice,
      addUser,
      deleteUser,
      runBackup,
      
      // LIS Actions
      // LIS Actions
      createLabOrder: (patientId, tests, docName, notes, priority = 'Routine') => {
        if (!tests || tests.length === 0) return null;
        const pat = patients.find(p => p.id === patientId);
        
        const year = new Date().getFullYear();
        const yearPrefix = `LAB-${year}-`;
        const yearOrdersCount = labOrders.filter(o => o.labOrderNumber && o.labOrderNumber.startsWith(yearPrefix)).length;
        const serialNum = (yearOrdersCount + 1).toString().padStart(4, '0');
        const orderNum = `${yearPrefix}${serialNum}`;
        const visitId = `VIS-${year}-${serialNum}`;
        const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        const newOrder = {
          labOrderNumber: orderNum,
          patientId: patientId,
          patientName: pat ? pat.name : 'Unknown Patient',
          visitId: visitId,
          status: 'Ordered',
          orderTime: timestamp,
          orderedTests: tests,
          doctorName: docName || `Dr. ${doctorName}`,
          notes: notes || '',
          priority: priority,
          machineAssigned: '',
          machineStatus: 'Offline',
          processingStatus: 'Pending',
          resultSource: 'Manual Entry',
          sampleType: '',
          collectedBy: '',
          collectionTime: ''
        };

        setLabOrders(prev => {
          const filtered = prev.filter(o => o.labOrderNumber !== orderNum);
          return [...filtered, newOrder];
        });

        // Add individual lab requests to support LIS analyzers/pathologist reports
        tests.forEach(testName => {
          setLabRequests(prev => {
            const exists = prev.find(r => r.patientId === patientId && r.testName === testName && r.status !== 'Verified');
            if (exists) return prev;
            
            const nextId = (prev.length + 1).toString().padStart(6, '0');
            const newReq = {
              id: `SMP-${nextId}`,
              specimenId: `SPM-${nextId}`,
              patientId: patientId,
              patientName: pat ? pat.name : 'Unknown Patient',
              testName: testName,
              status: 'Ordered',
              result: null,
              collectedAt: null,
              verifiedAt: null
            };
            return [...prev, newReq];
          });
        });

        return newOrder;
      },
      acceptLabOrder: (orderNum) => {
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? { ...o, status: 'Accepted' } : o));
      },
      collectLabSample: (orderNum, sampleType, collectedBy, collectionTime) => {
        const timestamp = collectionTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
          ...o,
          status: 'Sample Collected',
          sampleType,
          collectedBy,
          collectionTime: timestamp
        } : o));

        setLabOrders(orders => {
          const order = orders.find(o => o.labOrderNumber === orderNum);
          if (order) {
            const pat = patients.find(p => p.id === order.patientId);
            const suffix = orderNum.split('-').pop(); // e.g. 0001
            const specimenId = `RKLAB-${suffix}`;

            const newTask = {
              taskId: orderNum,
              patientId: `RK-${suffix}`,
              clinicPatientId: order.patientId,
              patientName: order.patientName,
              age: pat ? pat.age : 32,
              gender: pat ? pat.gender : 'Male',
              phone: pat ? pat.phone : '9440183421',
              doctorName: order.doctorName,
              opdNumber: `Token ${suffix}`,
              specimenId: specimenId,
              status: 'Sample Collected',
              orderedTests: order.orderedTests,
              testResults: {},
              verifiedBy: null,
              verifiedAt: null,
              remarks: '',
              machineAssigned: order.machineAssigned || '',
              machineStatus: order.machineStatus || 'Offline',
              processingStatus: 'Assigned',
              resultSource: order.resultSource || 'Manual Entry',
              sampleType,
              collectedBy,
              collectionTime: timestamp
            };

            setLabTasks(prev => {
              const filtered = prev.filter(t => t.taskId !== orderNum);
              return [...filtered, newTask];
            });

            setLabRequests(prev => prev.map(req => {
              if (req.patientId === order.patientId && req.status === 'Ordered') {
                return { ...req, status: 'Collected', specimenId: specimenId, collectedAt: timestamp };
              }
              return req;
            }));
          }
          return orders;
        });
      },
      assignLabMachine: (orderNum, machineName) => {
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
          ...o,
          status: 'Assigned',
          machineAssigned: machineName,
          machineStatus: 'Online',
          processingStatus: 'Assigned'
        } : o));

        setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
          ...t,
          status: 'Assigned',
          machineAssigned: machineName,
          machineStatus: 'Online',
          processingStatus: 'Assigned'
        } : t));
      },
      startMachineRun: (orderNum) => {
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
          ...o,
          status: 'Processing',
          processingStatus: 'Processing'
        } : o));

        setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
          ...t,
          status: 'Processing',
          processingStatus: 'Processing'
        } : t));
      },
      saveLabResult: (orderNum, results, source) => {
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
          ...o,
          status: 'Completed',
          processingStatus: 'Completed',
          resultSource: source
        } : o));

        setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
          ...t,
          status: 'Completed',
          processingStatus: 'Completed',
          resultSource: source,
          testResults: { ...t.testResults, ...results }
        } : t));

        setLabOrders(orders => {
          const order = orders.find(o => o.labOrderNumber === orderNum);
          if (order) {
            setLabRequests(prev => prev.map(req => {
              if (req.patientId === order.patientId && (req.status === 'Collected' || req.status === 'Ordered' || req.status === 'Pending Sample Collection')) {
                const testRes = results[req.testName];
                return {
                  ...req,
                  status: 'Pending Verification',
                  result: testRes ? testRes.val : 'Completed'
                };
              }
              return req;
            }));
          }
          return orders;
        });
      },
      verifyLabOrder: (orderNum, remarks, pathologistName) => {
        const timestamp = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
          ...o,
          status: 'Verified',
          processingStatus: 'Verified'
        } : o));

        setLabTasks(prev => prev.map(t => {
          if (t.taskId === orderNum) {
            setNursingNotes(notes => [
              {
                time: 'Just now',
                author: pathologistName || 'Pathologist Verification',
                priority: 'Routine',
                patientId: t.clinicPatientId,
                text: `Lab Report Verified: ${t.orderedTests.join(', ')} (${orderNum}). Results released to EMR. Remarks: ${remarks}`
              },
              ...notes
            ]);

            return {
              ...t,
              status: 'Verified',
              processingStatus: 'Verified',
              verifiedBy: pathologistName || 'Dr. S. Vardhan, MD',
              verifiedAt: timestamp,
              remarks: remarks
            };
          }
          return t;
        }));

        setLabOrders(orders => {
          const order = orders.find(o => o.labOrderNumber === orderNum);
          if (order) {
            setLabRequests(prev => prev.map(req => {
              if (req.patientId === order.patientId && (req.status === 'Pending Verification' || req.status === 'Collected' || req.status === 'Ordered')) {
                return {
                  ...req,
                  status: 'Verified',
                  verifiedAt: timestamp
                };
              }
              return req;
            }));
          }
          return orders;
        });
      },
      addLabRequest: (patientId, testName) => {
        const pat = patients.find(p => p.id === patientId);
        const nextId = (labRequests.length + 1).toString().padStart(6, '0');
        const newReq = {
          id: `SMP-${nextId}`,
          specimenId: `SPM-${nextId}`,
          patientId: patientId,
          patientName: pat ? pat.name : 'Unknown Patient',
          testName: testName,
          status: 'Ordered',
          result: null,
          collectedAt: null,
          verifiedAt: null
        };
        setLabRequests(prev => [...prev, newReq]);
        return newReq;
      },
      collectSpecimen: (specimenId) => {
        setLabRequests(prev => prev.map(req => {
          if (req.specimenId === specimenId) {
            return { 
              ...req, 
              status: 'Collected', 
              collectedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
            };
          }
          return req;
        }));
      },
      sendToMachine: (specimenId) => {
        setLabRequests(prev => prev.map(req => {
          if (req.specimenId === specimenId) {
            return { ...req, status: 'Processing' };
          }
          return req;
        }));
      },
      enterLabResult: (specimenId, resultText) => {
        setLabRequests(prev => prev.map(req => {
          if (req.specimenId === specimenId) {
            return { ...req, status: 'Pending Verification', result: resultText };
          }
          return req;
        }));
      },
      verifyLabReport: (specimenId) => {
        setLabRequests(prev => prev.map(req => {
          if (req.specimenId === specimenId) {
            const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            setNursingNotes(notes => [
              {
                time: 'Just now',
                author: 'LIS Machine Verification',
                priority: 'Routine',
                patientId: req.patientId,
                text: `Lab Report Verified: ${req.testName}. Results: ${req.result}`
              },
              ...notes
            ]);
            return { ...req, status: 'Verified', verifiedAt: timeStr };
          }
          return req;
        }));
      },
      admitInpatient: (patientId, bed, diagnosis, doctor) => {
        const pat = patients.find(p => p.id === patientId);
        const newInpatient = {
          bed,
          patientId,
          diagnosis,
          date: new Date().toISOString().split('T')[0],
          doctor: doctor || 'Dr. Abdul Kareem',
          vitals: 'Pulse: 72, BP: 120/80',
          billing: 'Pending'
        };
        setInpatients(prev => [...prev, newInpatient]);
        setPatients(prev => prev.map(p => p.id === patientId ? { ...p, visitStatus: 'Admitted' } : p));
        setNursingNotes(notes => [
          {
            time: 'Just now',
            author: 'Admissions Coordinator',
            priority: 'Routine',
            patientId: patientId,
            text: `Patient ${pat ? pat.name : 'Unknown'} admitted to ${bed}. Diagnosis: ${diagnosis}.`
          },
          ...notes
        ]);
      },
      dischargeInpatient: (patientId) => {
        const pat = patients.find(p => p.id === patientId);
        setInpatients(prev => prev.filter(ip => ip.patientId !== patientId));
        setPatients(prev => prev.map(p => p.id === patientId ? { ...p, visitStatus: 'Discharged' } : p));
        setNursingNotes(notes => [
          {
            time: 'Just now',
            author: 'Ward Discharge Coordinator',
            priority: 'Routine',
            patientId: patientId,
            text: `Patient ${pat ? pat.name : 'Unknown'} has been discharged. Bed is now vacant.`
          },
          ...notes
        ]);
      }
    }}>
      {children}
    </ClinicContext.Provider>
  );
}
