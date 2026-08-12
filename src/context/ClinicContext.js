"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
// Supabase removed — auth uses JWT cookies via /api/auth/*

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
  const [patients, setPatients] = useState([]);

  const [queue, setQueue] = useState([]);

  const [inpatients, setInpatients] = useState([]);

  const [nursingNotes, setNursingNotes] = useState([]);

  const [inventory, setInventory] = useState([]);

  const [prescriptions, setPrescriptions] = useState([]);

  const [invoices, setInvoices] = useState([]);

  const [appointments, setAppointments] = useState([]);

  const [users, setUsers] = useState([]);

  const [backups, setBackups] = useState([]);

  const [activeRole, setActiveRole] = useState('admin'); // Default role for prototype simulation
  const [user, setUser] = useState(null);

  // New LIS System States
  const [partners, setPartners] = useState([]);

  const [editAudits, setEditAudits] = useState([]);

  const [labTestsMaster, setLabTestsMaster] = useState([
    { 
      testName: 'CBC', 
      b2cPrice: 350.00, 
      b2bPrice: 200.00, 
      department: 'Hematology', 
      machine: 'Hematology Analyzer', 
      sampleType: 'Blood',
      parameters: [
        { name: 'Hemoglobin (Hb)', val: '14.5', unit: 'g/dL', refRange: '12.0 - 16.0' },
        { name: 'WBC Count', val: '7500', unit: '/cumm', refRange: '4000 - 11000' },
        { name: 'Platelet Count', val: '2.5', unit: 'L/cumm', refRange: '1.5 - 4.5' }
      ]
    },
    { 
      testName: 'ESR', 
      b2cPrice: 150.00, 
      b2bPrice: 90.00, 
      department: 'Hematology', 
      machine: 'Hematology Analyzer', 
      sampleType: 'Blood',
      parameters: [
        { name: 'ESR', val: '12', unit: 'mm/hr', refRange: '0 - 20' }
      ]
    },
    { 
      testName: 'HbA1c', 
      b2cPrice: 450.00, 
      b2bPrice: 250.00, 
      department: 'Biochemistry', 
      machine: 'Weldon WB-150 Biochemistry Analyzer', 
      sampleType: 'Blood',
      parameters: [
        { name: 'HbA1c', val: '5.6', unit: '%', refRange: '< 5.7%' }
      ]
    },
    { 
      testName: 'Lipid Profile', 
      b2cPrice: 650.00, 
      b2bPrice: 400.00, 
      department: 'Biochemistry', 
      machine: 'Weldon WB-150 Biochemistry Analyzer', 
      sampleType: 'Blood',
      parameters: [
        { name: 'Total Cholesterol', val: '180', unit: 'mg/dL', refRange: '< 200' },
        { name: 'Triglycerides', val: '140', unit: 'mg/dL', refRange: '< 150' },
        { name: 'HDL Cholesterol', val: '45', unit: 'mg/dL', refRange: '> 40' }
      ]
    },
    { 
      testName: 'Thyroid Profile', 
      b2cPrice: 800.00, 
      b2bPrice: 500.00, 
      department: 'Immunology (CLIA)', 
      machine: 'Maglumi 800', 
      sampleType: 'Serum',
      parameters: [
        { name: 'TSH', val: '2.50', unit: 'uIU/mL', refRange: '0.45 - 4.50' },
        { name: 'Free T4', val: '1.2', unit: 'ng/dL', refRange: '0.8 - 1.8' }
      ]
    },
    { 
      testName: 'Urine Routine', 
      b2cPrice: 200.00, 
      b2bPrice: 120.00, 
      department: 'Clinical Pathology', 
      machine: 'Urine Analyzer', 
      sampleType: 'Urine',
      parameters: [
        { name: 'Urine Protein', val: 'Nil', unit: '-', refRange: 'Nil' },
        { name: 'Urine Glucose', val: 'Nil', unit: '-', refRange: 'Nil' },
        { name: 'Pus Cells', val: '2-3', unit: '/hpf', refRange: '0-5' }
      ]
    },
    { 
      testName: 'Liver Function Test (LFT)', 
      b2cPrice: 750.00, 
      b2bPrice: 450.00, 
      department: 'Biochemistry', 
      machine: 'Weldon WB-150 Biochemistry Analyzer', 
      sampleType: 'Blood',
      parameters: [
        { name: 'SGOT (AST)', val: '25', unit: 'U/L', refRange: '5 - 40' },
        { name: 'SGPT (ALT)', val: '30', unit: 'U/L', refRange: '7 - 56' },
        { name: 'Total Bilirubin', val: '0.8', unit: 'mg/dL', refRange: '0.1 - 1.2' }
      ]
    },
    { 
      testName: 'Kidney Function Test (KFT)', 
      b2cPrice: 700.00, 
      b2bPrice: 420.00, 
      department: 'Biochemistry', 
      machine: 'Weldon WB-150 Biochemistry Analyzer', 
      sampleType: 'Blood',
      parameters: [
        { name: 'Blood Urea', val: '28', unit: 'mg/dL', refRange: '15 - 45' },
        { name: 'Serum Creatinine', val: '0.9', unit: 'mg/dL', refRange: '0.6 - 1.2' }
      ]
    },
    { 
      testName: 'Electrolytes', 
      b2cPrice: 400.00, 
      b2bPrice: 250.00, 
      department: 'Clinical Chemistry', 
      machine: 'Electrolyte Analyzer', 
      sampleType: 'Serum',
      parameters: [
        { name: 'Sodium', val: '140', unit: 'mmol/L', refRange: '135 - 145' },
        { name: 'Potassium', val: '4.2', unit: 'mmol/L', refRange: '3.5 - 5.0' }
      ]
    },
    { 
      testName: 'CRP', 
      b2cPrice: 300.00, 
      b2bPrice: 180.00, 
      department: 'Serology / POCT', 
      machine: 'Rapid Test Analyzer', 
      sampleType: 'Serum',
      parameters: [
        { name: 'C-Reactive Protein (CRP)', val: '3.0', unit: 'mg/L', refRange: '< 6.0' }
      ]
    }
  ]);

  // LIS State Variables
  const [labRequests, setLabRequests] = useState([]);
  const [labOrders, setLabOrders] = useState([]);
  const [labTasks, setLabTasks] = useState([]);
  const [labActiveTab, setLabActiveTab] = useState('dashboard');
  const [ipdActiveTab, setIpdActiveTab] = useState('dashboard');

  // Doctor-Laboratory Integration: Structured Critical Alerts
  const [labAlerts, setLabAlerts] = useState([]);

  // Doctor-Laboratory Integration: LIS Analyzer Connection Metadata
  const [analyzerConnections, setAnalyzerConnections] = useState([
    { id: 'maglumi', name: 'Maglumi 800', dept: 'Immunology (CLIA)', protocol: 'TCP/IP', port: '192.168.1.101:9100', status: 'Online', lastPing: '2026-06-28 14:30:00', healthScore: 98 },
    { id: 'weldon', name: 'Weldon WB-150 Biochemistry Analyzer', dept: 'Biochemistry', protocol: 'RS-232 Serial', port: 'COM3 / 9600 baud', status: 'Online', lastPing: '2026-06-28 14:29:55', healthScore: 95 },
    { id: 'hematology', name: 'Hematology Analyzer', dept: 'Hematology', protocol: 'Ethernet', port: '192.168.1.102:8080', status: 'Online', lastPing: '2026-06-28 14:30:02', healthScore: 100 },
    { id: 'urine', name: 'Urine Analyzer', dept: 'Clinical Pathology', protocol: 'USB', port: 'USB-HID Device 0x04B4', status: 'Online', lastPing: '2026-06-28 14:28:40', healthScore: 92 },
    { id: 'electrolyte', name: 'Electrolyte Analyzer', dept: 'Clinical Chemistry', protocol: 'TCP/IP', port: '192.168.1.103:7001', status: 'Online', lastPing: '2026-06-28 14:30:01', healthScore: 97 },
    { id: 'rapid', name: 'Rapid Test Analyzer', dept: 'Serology / POCT', protocol: 'RS-232 Serial', port: 'COM5 / 19200 baud', status: 'Online', lastPing: '2026-06-28 14:29:50', healthScore: 90 }
  ]);

  // Doctor-Laboratory Integration: Barcode Tracking (moved from component state to persist across tabs)
  const [barcodeTracking, setBarcodeTracking] = useState({});
  // Shape: { [labOrderNumber]: { generated: bool, generatedAt: string, printed: bool, printedAt: string, barcodeValue: string } }

  React.useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser({
              username: data.user.full_name || data.user.fullName || data.user.email,
              role: data.user.role,
              email: data.user.email
            });
            setActiveRole(data.user.role);
          }
        }
      } catch (err) {
        console.error("Session check failed", err);
      }
    };
    checkSession();

    // Realtime subscriptions removed (Supabase-specific).
    // Poll /api/lab/alerts for critical alerts if needed.
  }, []);

  React.useEffect(() => {
    // Only open the realtime stream for an authenticated session. Opening it on
    // the login screen would hit the auth-gated endpoint, 401, and retry-loop.
    if (!user) return;

    let eventSource;
    let retryTimeout;
    let retryDelay = 5000;
    let closed = false;

    const connectSSE = () => {
      if (closed) return;
      eventSource = new EventSource('/api/lab/realtime');

      // Reset backoff once a connection is established.
      eventSource.onopen = () => { retryDelay = 5000; };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'STATUS_UPDATE') {
            const { taskId, status, machineName, barcode, timestamp } = payload.data;

            // 1. Update labTasks state
            setLabTasks(prev => prev.map(t => {
              if (t.taskId === taskId || t.specimenId === barcode) {
                return {
                  ...t,
                  status,
                  processingStatus: status,
                  machineAssigned: machineName,
                  analyzerStartedAt: timestamp
                };
              }
              return t;
            }));

            // 2. Update labOrders state
            setLabOrders(prev => prev.map(o => {
              if (o.labOrderNumber === taskId) {
                return {
                  ...o,
                  status,
                  processingStatus: status,
                  machineAssigned: machineName,
                  analyzerStartedAt: timestamp
                };
              }
              return o;
            }));

            // 3. Log to nursing notes
            setNursingNotes(prev => [
              {
                time: 'Just now',
                author: `LIS Scanner (${machineName})`,
                priority: 'Routine',
                patientId: payload.data.patientId || taskId,
                text: `Real-time scan: Specimen barcode ${barcode} read by ${machineName}. Machine run started.`
              },
              ...prev
            ]);
          }
        } catch (err) {
          console.error("Failed to parse SSE event data:", err);
        }
      };

      // SSE errors fire on transient drops and on normal close. Reconnect
      // quietly with exponential backoff instead of spamming the console.
      eventSource.onerror = () => {
        if (eventSource) eventSource.close();
        if (closed) return;
        retryTimeout = setTimeout(connectSSE, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
      };
    };

    connectSSE();

    return () => {
      closed = true;
      if (eventSource) eventSource.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [user]);

  const login = async (usernameOrEmail, password, selectedRole) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: usernameOrEmail, password })
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          username: data.user.full_name || data.user.fullName || data.user.email,
          role: data.user.role,
          email: data.user.email
        });
        setActiveRole(data.user.role);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Login failed", err);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
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

  const recordPayment = (invoiceId, mode, amountPaid = null) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        const newPaid = amountPaid !== null ? parseFloat(amountPaid) : inv.amount;
        const balance = parseFloat((inv.amount - newPaid).toFixed(2));
        const status = balance <= 0 ? 'Paid' : 'Partial';
        
        if (inv.labOrderNumber) {
          setLabOrders(orders => orders.map(o => {
            if (o.labOrderNumber === inv.labOrderNumber) {
              const updatedPaymentStatus = status === 'Paid' ? 'Fully Paid' : 'Partially Paid';
              let nextStatus = o.status;
              
              if (o.status === 'Payment Verification' && status === 'Paid') {
                nextStatus = 'Ready for Delivery';
              }
              
              return {
                ...o,
                amountPaid: newPaid,
                balance,
                paymentStatus: updatedPaymentStatus,
                status: nextStatus
              };
            }
            return o;
          }));

          setLabTasks(tasks => tasks.map(t => {
            if (t.taskId === inv.labOrderNumber) {
              const updatedPaymentStatus = status === 'Paid' ? 'Fully Paid' : 'Partially Paid';
              let nextStatus = t.status;
              
              if (t.status === 'Payment Verification' && status === 'Paid') {
                nextStatus = 'Ready for Delivery';
              }
              
              return {
                ...t,
                amountPaid: newPaid,
                balance,
                paymentStatus: updatedPaymentStatus,
                status: nextStatus
              };
            }
            return t;
          }));
        }

        return { 
          ...inv, 
          status, 
          mode, 
          amountPaid: newPaid, 
          balance 
        };
      }
      return inv;
    }));
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

  const addB2BPartner = (partnerData) => {
    const nextId = `PART-${(partners.length + 1).toString().padStart(3, '0')}`;
    const newPartner = {
      id: nextId,
      ...partnerData,
      discount: parseFloat(partnerData.discount || 0)
    };
    setPartners(prev => [...prev, newPartner]);
    return newPartner;
  };

  const deleteB2BPartner = (partnerId) => {
    setPartners(prev => prev.filter(p => p.id !== partnerId));
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

  // ============================================================================
  // DOCTOR–LABORATORY INTEGRATION: BACKEND MUTATORS
  // ============================================================================

  // Helper: Auto-detect abnormal/critical values from a result string and generate alerts
  const autoDetectAbnormals = (orderNum, patientId, patientName, testResults) => {
    if (!testResults) return;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    Object.keys(testResults).forEach(testName => {
      const resultObj = testResults[testName];
      if (!resultObj || !resultObj.val) return;

      const lines = resultObj.val.split(/,|\n/);
      lines.forEach(line => {
        const isHigh = /high/i.test(line);
        const isLow = /low/i.test(line);
        const isCritical = /critical/i.test(line) || /abnormal/i.test(line);

        if (isHigh || isLow || isCritical) {
          const paramName = line.split(':')[0]?.trim() || testName;
          const cleanVal = line.split('(')[0].replace(new RegExp(testName + '\\s*:\\s*', 'i'), '').trim();
          const refMatch = line.match(/\(Ref:\s*([^)]+)\)/);
          const refRange = refMatch ? refMatch[1] : 'n/a';
          const severity = isCritical ? 'Critical' : isHigh ? 'High' : 'Low';

          const alertId = `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          setLabAlerts(prev => {
            // Prevent duplicate alerts for same patient+test+parameter
            const exists = prev.find(a =>
              a.patientId === patientId &&
              a.testName === testName &&
              a.parameter === paramName &&
              a.orderNumber === orderNum
            );
            if (exists) return prev;

            return [...prev, {
              id: alertId,
              patientId,
              patientName,
              orderNumber: orderNum,
              testName,
              parameter: paramName,
              value: cleanVal,
              refRange,
              severity,
              acknowledged: false,
              acknowledgedBy: null,
              acknowledgedAt: null,
              createdAt: timestamp
            }];
          });
        }
      });
    });
  };

  // 1. Register Lab Sample: Sample Collected → Sample Registered
  const registerLabSample = (orderNum) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
      ...o,
      status: 'Sample Registered',
      processingStatus: 'Sample Registered',
      registeredAt: timestamp
    } : o));

    setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
      ...t,
      status: 'Sample Registered',
      processingStatus: 'Sample Registered',
      registeredAt: timestamp
    } : t));

    setLabRequests(prev => prev.map(req => {
      const order = labOrders.find(o => o.labOrderNumber === orderNum);
      if (order && req.patientId === order.patientId && req.status === 'Collected') {
        return { ...req, status: 'Sample Registered' };
      }
      return req;
    }));
  };

  // 2. Mark Analyzer Running: → Analyzer Running
  const markAnalyzerRunning = (orderNum) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
      ...o,
      status: 'Analyzer Running',
      processingStatus: 'Analyzer Running',
      analyzerStartedAt: timestamp
    } : o));

    setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
      ...t,
      status: 'Analyzer Running',
      processingStatus: 'Analyzer Running',
      analyzerStartedAt: timestamp
    } : t));
  };

  // 3. Mark QC Verification: → QC Verification
  const markQCVerification = (orderNum) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
      ...o,
      status: 'QC Verification',
      processingStatus: 'QC Verification',
      qcStartedAt: timestamp
    } : o));

    setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
      ...t,
      status: 'QC Verification',
      processingStatus: 'QC Verification',
      qcStartedAt: timestamp
    } : t));
  };

  // 4. Generate Lab Report: Verified → Report Generated (No status override)
  const generateLabReport = (orderNum) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
      ...o,
      reportGeneratedAt: timestamp
    } : o));

    setLabTasks(prev => prev.map(t => {
      if (t.taskId === orderNum) {
        return {
          ...t,
          reportGeneratedAt: timestamp
        };
      }
      return t;
    }));

    // Log nursing note for report generation
    const order = labOrders.find(o => o.labOrderNumber === orderNum);
    if (order) {
      setNursingNotes(prev => [{
        time: 'Just now',
        author: 'LIS Report Generator',
        priority: 'Routine',
        patientId: order.patientId,
        text: `Lab Report Generated for order ${orderNum}. Tests: ${order.orderedTests.join(', ')}. Report ready for delivery.`
      }, ...prev]);
    }
  };

  // 5. Deliver Lab Report: Report Generated → Report Delivered
  const deliverLabReport = (orderNum, deliveredToDoctorName) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
      ...o,
      status: 'Delivered',
      processingStatus: 'Delivered',
      reportDeliveredAt: timestamp,
      reportDeliveredTo: deliveredToDoctorName || 'Patient/Doctor'
    } : o));

    setLabTasks(prev => prev.map(t => {
      if (t.taskId === orderNum) {
        setNursingNotes(notes => [{
          time: 'Just now',
          author: 'LIS Report Delivery',
          priority: 'Routine',
          patientId: t.clinicPatientId,
          text: `Lab Report Delivered to ${deliveredToDoctorName || 'Patient/Doctor'} for order ${orderNum}. Tests: ${t.orderedTests.join(', ')}.`
        }, ...notes]);

        return {
          ...t,
          status: 'Delivered',
          processingStatus: 'Delivered',
          reportDeliveredAt: timestamp,
          reportDeliveredTo: deliveredToDoctorName || 'Patient/Doctor'
        };
      }
      return t;
    }));
  };

  // 6. Generic Lab Order Status Updater
  const updateLabOrderStatus = (orderNum, newStatus) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
      ...o,
      status: newStatus,
      processingStatus: newStatus,
      lastStatusUpdate: timestamp
    } : o));

    setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
      ...t,
      status: newStatus,
      processingStatus: newStatus,
      lastStatusUpdate: timestamp
    } : t));
  };

  // 7. Add Critical Alert (structured)
  const addCriticalAlert = (alertData) => {
    const alertId = `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabAlerts(prev => [...prev, {
      id: alertId,
      patientId: alertData.patientId,
      patientName: alertData.patientName || 'Unknown',
      orderNumber: alertData.orderNumber || '',
      testName: alertData.testName,
      parameter: alertData.parameter || alertData.testName,
      value: alertData.value,
      refRange: alertData.refRange || 'n/a',
      severity: alertData.severity || 'High',
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: timestamp
    }]);
  };

  // 8. Acknowledge Critical Alert
  const acknowledgeCriticalAlert = (alertId, acknowledgedByName) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setLabAlerts(prev => prev.map(a => a.id === alertId ? {
      ...a,
      acknowledged: true,
      acknowledgedBy: acknowledgedByName || 'Doctor',
      acknowledgedAt: timestamp
    } : a));
  };

  // 9. Get Patient Lab History (all lab tasks for a patient, sorted by date)
  const getPatientLabHistory = (patientId) => {
    const tasks = labTasks.filter(t =>
      t.clinicPatientId === patientId || t.patientId === patientId
    );

    return tasks.sort((a, b) => {
      const dateA = a.verifiedAt || a.reportGeneratedAt || a.completedAt || '1970-01-01';
      const dateB = b.verifiedAt || b.reportGeneratedAt || b.completedAt || '1970-01-01';
      return new Date(dateB) - new Date(dateA);
    });
  };

  // 10. Get Analyzer Worklist (grouped pending tasks for a specific analyzer)
  const getAnalyzerWorklist = (analyzerId) => {
    const analyzerTestMap = {
      'maglumi': ['thyroid', 'tsh'],
      'weldon': ['hba1c', 'lipid', 'lft', 'kft', 'liver', 'kidney', 'blood sugar', 'fbs'],
      'hematology': ['cbc', 'esr'],
      'urine': ['urine'],
      'electrolyte': ['electrolyte'],
      'rapid': ['crp']
    };

    const keywords = analyzerTestMap[analyzerId] || [];

    const worklist = [];
    labTasks.forEach(task => {
      if (['Sample Collected', 'Sample Registered', 'Processing', 'Assigned'].includes(task.status)) {
        const matchingTests = task.orderedTests.filter(testName => {
          const nameLower = testName.toLowerCase();
          return keywords.some(kw => nameLower.includes(kw));
        });

        if (matchingTests.length > 0) {
          worklist.push({
            taskId: task.taskId,
            patientId: task.clinicPatientId || task.patientId,
            patientName: task.patientName,
            specimenId: task.specimenId,
            tests: matchingTests,
            priority: task.priority || 'Routine',
            status: task.status,
            collectionTime: task.collectionTime || ''
          });
        }
      }
    });

    // Sort by priority (STAT > Urgent > Routine)
    const priorityOrder = { 'STAT': 0, 'Urgent': 1, 'Routine': 2 };
    return worklist.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));
  };

  // 11. Escalate Lab Order Priority
  const escalateLabOrder = (orderNum, newPriority) => {
    setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
      ...o,
      priority: newPriority
    } : o));

    setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
      ...t,
      priority: newPriority
    } : t));

    // Log nursing note for priority change
    const order = labOrders.find(o => o.labOrderNumber === orderNum);
    if (order) {
      setNursingNotes(prev => [{
        time: 'Just now',
        author: 'Lab Priority System',
        priority: newPriority === 'STAT' ? 'Critical' : 'Routine',
        patientId: order.patientId,
        text: `Lab Order ${orderNum} escalated to ${newPriority} priority. Tests: ${order.orderedTests.join(', ')}.`
      }, ...prev]);
    }
  };

  // 12. Generate Barcode for Order (persist in context)
  const generateBarcode = (orderNum) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const suffix = orderNum.split('-').pop();
    const barcodeValue = `RKLAB-${suffix}`;

    setBarcodeTracking(prev => ({
      ...prev,
      [orderNum]: {
        ...prev[orderNum],
        generated: true,
        generatedAt: timestamp,
        barcodeValue,
        printed: prev[orderNum]?.printed || false,
        printedAt: prev[orderNum]?.printedAt || null
      }
    }));

    return barcodeValue;
  };

  // 13. Mark Barcode Printed for Order
  const markBarcodePrinted = (orderNum) => {
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    setBarcodeTracking(prev => ({
      ...prev,
      [orderNum]: {
        ...prev[orderNum],
        printed: true,
        printedAt: timestamp
      }
    }));
  };

  // 14. Update Analyzer Connection Status
  const updateAnalyzerStatus = (analyzerId, status, lastPingTime) => {
    const timestamp = lastPingTime || new Date().toISOString().replace('T', ' ').split('.')[0];

    setAnalyzerConnections(prev => prev.map(a => a.id === analyzerId ? {
      ...a,
      status,
      lastPing: timestamp,
      healthScore: status === 'Online' ? Math.min(100, a.healthScore + 1) : Math.max(0, a.healthScore - 10)
    } : a));
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

      // Doctor-Laboratory Integration: New State
      labAlerts, setLabAlerts,
      analyzerConnections, setAnalyzerConnections,
      barcodeTracking, setBarcodeTracking,
      partners, setPartners,
      editAudits, setEditAudits,
      labTestsMaster, setLabTestsMaster,

      // Doctor-Laboratory Integration: New Actions
      registerLabSample,
      markAnalyzerRunning,
      markQCVerification,
      generateLabReport,
      deliverLabReport,
      updateLabOrderStatus,
      addCriticalAlert,
      acknowledgeCriticalAlert,
      getPatientLabHistory,
      getAnalyzerWorklist,
      escalateLabOrder,
      generateBarcode,
      markBarcodePrinted,
      updateAnalyzerStatus,
      
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
      createLabOrder: (patientId, tests, docName, notes, priority = 'Routine', customerType = 'Walk-in', partnerId = '') => {
        if (!tests || tests.length === 0) return null;
        const pat = patients.find(p => p.id === patientId);
        const partner = partners.find(p => p.id === partnerId);
        
        const year = new Date().getFullYear();
        const yearPrefix = `LAB-${year}-`;
        const yearOrdersCount = labOrders.filter(o => o.labOrderNumber && o.labOrderNumber.startsWith(yearPrefix)).length;
        const serialNum = (yearOrdersCount + 1).toString().padStart(4, '0');
        const orderNum = `${yearPrefix}${serialNum}`;
        const visitId = `VIS-${year}-${serialNum}`;
        const timestamp = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        // Calculate charges based on B2B/B2C selection
        let totalCharges = 0;
        const invoiceItems = [];
        
        tests.forEach(testName => {
          const master = labTestsMaster.find(t => t.testName === testName || t.testName.toLowerCase().includes(testName.toLowerCase()) || testName.toLowerCase().includes(t.testName.toLowerCase()));
          const price = master 
            ? (customerType === 'Walk-in' ? master.b2cPrice : master.b2bPrice)
            : 300.00;
          
          totalCharges += price;
          invoiceItems.push({ desc: `Lab Test: ${testName}`, price });
        });

        // Calculate partner-specific discount
        let discount = 0;
        if (customerType !== 'Walk-in' && partner) {
          discount = parseFloat(((totalCharges * partner.discount) / 100).toFixed(2));
        }

        const grandTotal = parseFloat((totalCharges - discount).toFixed(2));
        
        // Automatically create a linked invoice in the billing ledger
        const billId = `RK-INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const newInvoice = {
          id: billId,
          date: new Date().toISOString().split('T')[0],
          patientId: patientId,
          amount: grandTotal,
          mode: customerType === 'Walk-in' ? 'Cash' : 'Credit',
          status: 'Pending',
          items: invoiceItems,
          labOrderNumber: orderNum,
          customerType,
          partnerName: partner ? partner.name : ''
        };

        setInvoices(prev => [...prev, newInvoice]);

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
          collectionTime: '',
          
          // Added Fields for B2B / B2C and Billing Integration
          customerType,
          partnerId,
          totalCharges,
          discount,
          amountPaid: 0.00,
          balance: grandTotal,
          paymentStatus: 'Unpaid',
          invoiceId: billId
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
        const enhancedResults = { ...results };
        
        Object.keys(enhancedResults).forEach(testName => {
          const resObj = enhancedResults[testName];
          if (!resObj.parameters) {
            const master = labTestsMaster.find(t => t.testName === testName || t.testName.toLowerCase().includes(testName.toLowerCase()) || testName.toLowerCase().includes(t.testName.toLowerCase()));
            if (master && master.parameters) {
              const params = master.parameters.map(p => {
                const escapedName = p.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`${escapedName}:\\s*([0-9.]+|Nil|Active|Negative|Positive)`, 'i');
                const match = resObj.val ? resObj.val.match(regex) : null;
                return {
                  ...p,
                  val: match ? match[1] : p.val
                };
              });
              resObj.parameters = params;
            } else {
              resObj.parameters = [{ name: testName, val: resObj.val, unit: '-', refRange: '-' }];
            }
          }
          if (!resObj.remarks) resObj.remarks = 'Standard clinical observations verified.';
          if (!resObj.interpretation) resObj.interpretation = 'Results within expected physiological limits.';
        });

        // Set status to Draft in both order and task
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
          ...o,
          status: 'Draft',
          processingStatus: 'Draft',
          resultSource: source
        } : o));

        setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
          ...t,
          status: 'Draft',
          processingStatus: 'Draft',
          resultSource: source,
          testResults: { ...t.testResults, ...enhancedResults }
        } : t));

        setLabOrders(orders => {
          const order = orders.find(o => o.labOrderNumber === orderNum);
          if (order) {
            setLabRequests(prev => prev.map(req => {
              if (req.patientId === order.patientId && (req.status === 'Collected' || req.status === 'Ordered' || req.status === 'Pending Sample Collection' || req.status === 'Sample Registered')) {
                const testRes = enhancedResults[req.testName];
                return {
                  ...req,
                  status: 'Draft',
                  result: testRes ? testRes.val : 'Completed'
                };
              }
              return req;
            }));

            autoDetectAbnormals(orderNum, order.patientId, order.patientName, enhancedResults);
          }
          return orders;
        });
      },
      updateLabResult: (orderNum, testName, updatedParameters, remarks, interpretation, editedBy, reason) => {
        const timestamp = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        setLabTasks(prev => prev.map(t => {
          if (t.taskId === orderNum) {
            const currentTestRes = t.testResults[testName] || { val: '', machine: 'Manual Entry', completedAt: timestamp, parameters: [] };
            const oldParams = currentTestRes.parameters || [];
            
            updatedParameters.forEach(up => {
              const op = oldParams.find(p => p.name === up.name);
              if (op && String(op.val) !== String(up.val)) {
                const newAudit = {
                  id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
                  lab_order_id: orderNum,
                  test_name: testName,
                  parameter_name: up.name,
                  previous_value: op.val,
                  updated_value: up.val,
                  edited_by: editedBy || 'Technician',
                  edited_at: timestamp,
                  reason: reason || 'Manual correction'
                };
                setEditAudits(prevAudits => [...prevAudits, newAudit]);
              }
            });

            // Reconstruct the val string
            const valStr = updatedParameters.map(p => `${p.name}: ${p.val} ${p.unit} (Ref: ${p.refRange})`).join('\n');

            const updatedTestRes = {
              ...currentTestRes,
              val: valStr,
              parameters: updatedParameters,
              remarks,
              interpretation,
              completedAt: timestamp
            };

            return {
              ...t,
              testResults: {
                ...t.testResults,
                [testName]: updatedTestRes
              }
            };
          }
          return t;
        }));

        setLabOrders(orders => {
          const order = orders.find(o => o.labOrderNumber === orderNum);
          if (order) {
            setLabRequests(prev => prev.map(req => {
              if (req.patientId === order.patientId && req.testName === testName) {
                const valStr = updatedParameters.map(p => `${p.name}: ${p.val} ${p.unit}`).join(', ');
                return {
                  ...req,
                  result: valStr
                };
              }
              return req;
            }));
          }
          return orders;
        });
      },
      submitForVerification: (orderNum) => {
        setLabOrders(prev => prev.map(o => o.labOrderNumber === orderNum ? {
          ...o,
          status: 'Pending Verification',
          processingStatus: 'Pending Verification'
        } : o));

        setLabTasks(prev => prev.map(t => t.taskId === orderNum ? {
          ...t,
          status: 'Pending Verification',
          processingStatus: 'Pending Verification'
        } : t));

        setLabOrders(orders => {
          const order = orders.find(o => o.labOrderNumber === orderNum);
          if (order) {
            setLabRequests(prev => prev.map(req => {
              if (req.patientId === order.patientId && req.status === 'Draft') {
                return {
                  ...req,
                  status: 'Pending Verification'
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
        
        let isFullyPaid = false;
        
        setLabOrders(prev => {
          const order = prev.find(o => o.labOrderNumber === orderNum);
          const balance = order ? (order.balance !== undefined ? order.balance : 0) : 0;
          isFullyPaid = order ? (order.paymentStatus === 'Fully Paid' || balance <= 0) : false;
          
          const nextStatus = isFullyPaid ? 'Ready for Delivery' : 'Payment Verification';
          
          return prev.map(o => o.labOrderNumber === orderNum ? {
            ...o,
            status: nextStatus,
            processingStatus: nextStatus
          } : o);
        });

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

            const nextStatus = isFullyPaid ? 'Ready for Delivery' : 'Payment Verification';

            return {
              ...t,
              status: nextStatus,
              processingStatus: nextStatus,
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
              if (req.patientId === order.patientId && (req.status === 'Pending Verification' || req.status === 'Collected' || req.status === 'Ordered' || req.status === 'Sample Registered' || req.status === 'Draft')) {
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

        // Auto-generate report after verification
        generateLabReport(orderNum);
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
