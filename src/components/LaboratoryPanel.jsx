"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';
import DoctorLaboratoryPanel from './DoctorLaboratoryPanel';
import LabInventoryTab from './LabInventoryTab';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

const ANALYZERS_METADATA = [
  { id: 'maglumi', name: 'Maglumi 800', dept: 'Immunology (CLIA)' },
  { id: 'weldon', name: 'Weldon WB-150 Biochemistry Analyzer', dept: 'Biochemistry' },
  { id: 'hematology', name: 'Hematology Analyzer', dept: 'Hematology' },
  { id: 'urine', name: 'Urine Analyzer', dept: 'Clinical Pathology' },
  { id: 'electrolyte', name: 'Electrolyte Analyzer', dept: 'Clinical Chemistry' },
  { id: 'rapid', name: 'Rapid Test Analyzer', dept: 'Serology / POCT' }
];

const getMachineForTest = (testName) => {
  const nameLower = testName.toLowerCase();
  if (nameLower.includes('cbc') || nameLower.includes('esr')) return ANALYZERS_METADATA.find(a => a.id === 'hematology');
  if (nameLower.includes('hba1c') || nameLower.includes('lipid') || nameLower.includes('lft') || nameLower.includes('kft') || nameLower.includes('liver') || nameLower.includes('kidney')) return ANALYZERS_METADATA.find(a => a.id === 'weldon');
  if (nameLower.includes('thyroid') || nameLower.includes('tsh')) return ANALYZERS_METADATA.find(a => a.id === 'maglumi');
  if (nameLower.includes('urine')) return ANALYZERS_METADATA.find(a => a.id === 'urine');
  if (nameLower.includes('electrolyte')) return ANALYZERS_METADATA.find(a => a.id === 'electrolyte');
  if (nameLower.includes('crp')) return ANALYZERS_METADATA.find(a => a.id === 'rapid');
  return ANALYZERS_METADATA.find(a => a.id === 'rapid'); // fallback
};

const SpecimenQRCode = ({ value }) => {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, { width: 50, margin: 1 }, (err) => {
        if (err) console.error(err);
      });
    }
  }, [value]);

  return <canvas ref={canvasRef} style={{ width: '50px', height: '50px', borderRadius: '4px' }} />;
};

export default function LaboratoryPanel() {
  const { 
    currency,
    labOrders,
    setLabOrders,
    prescriptions,
    activeRole,
    labTasks,
    setLabTasks,
    acceptLabOrder,
    collectLabSample,
    assignLabMachine,
    startMachineRun,
    saveLabResult,
    verifyLabOrder,
    labRequests,
    setLabRequests,
    labActiveTab,
    setLabActiveTab,
    patients,
    // Doctor-Laboratory Integration: New context values
    barcodeTracking,
    generateBarcode: contextGenerateBarcode,
    markBarcodePrinted: contextMarkBarcodePrinted,
    analyzerConnections,
    updateAnalyzerStatus,
    registerLabSample,
    markAnalyzerRunning,
    markQCVerification,
    generateLabReport,
    deliverLabReport,
    updateLabOrderStatus,
    escalateLabOrder,
    getAnalyzerWorklist,
    labAlerts
  } = useClinic();

  // State variables for Incoming Queue & Sample Collection matching
  const [activeOrderForCollection, setActiveOrderForCollection] = useState(null);
  // Barcode tracking now uses context-based state for persistence
  const barcodeGeneratedForOrder = Object.fromEntries(
    Object.entries(barcodeTracking || {}).map(([k, v]) => [k, v?.generated || false])
  );
  const barcodePrintedForOrder = Object.fromEntries(
    Object.entries(barcodeTracking || {}).map(([k, v]) => [k, v?.printed || false])
  );
  const setBarcodeGeneratedForOrder = (updater) => {
    // Compatibility wrapper: intercept local set calls and redirect to context
    if (typeof updater === 'function') {
      const result = updater(barcodeGeneratedForOrder);
      Object.keys(result).forEach(orderNum => {
        if (result[orderNum] && !barcodeGeneratedForOrder[orderNum]) {
          contextGenerateBarcode(orderNum);
        }
      });
    }
  };
  const setBarcodePrintedForOrder = (updater) => {
    if (typeof updater === 'function') {
      const result = updater(barcodePrintedForOrder);
      Object.keys(result).forEach(orderNum => {
        if (result[orderNum] && !barcodePrintedForOrder[orderNum]) {
          contextMarkBarcodePrinted(orderNum);
        }
      });
    }
  };
  const [collectionSampleType, setCollectionSampleType] = useState('Blood');
  const [collectionBy, setCollectionBy] = useState('Lab Tech Suresh');
  const [collectionTime, setCollectionTime] = useState('');
  
  // Manual result entry state
  const [manualEntryMode, setManualEntryMode] = useState(false);
  const [manualResultsObj, setManualResultsObj] = useState({}); // maps testName to result text

  // Connected LIS Analyzers state
  const [analyzers, setAnalyzers] = useState([
    { id: 'maglumi', name: 'Maglumi 800', dept: 'Immunology (CLIA)', status: 'Online', workState: 'Ready', currentSample: '-', waitingCount: 0, completedCount: 12 },
    { id: 'weldon', name: 'Weldon WB-150 Biochemistry Analyzer', dept: 'Biochemistry', status: 'Online', workState: 'Ready', currentSample: '-', waitingCount: 0, completedCount: 25 },
    { id: 'hematology', name: 'Hematology Analyzer', dept: 'Hematology', status: 'Online', workState: 'Ready', currentSample: '-', waitingCount: 0, completedCount: 18 },
    { id: 'urine', name: 'Urine Analyzer', dept: 'Clinical Pathology', status: 'Online', workState: 'Ready', currentSample: '-', waitingCount: 0, completedCount: 8 },
    { id: 'electrolyte', name: 'Electrolyte Analyzer', dept: 'Clinical Chemistry', status: 'Online', workState: 'Ready', currentSample: '-', waitingCount: 0, completedCount: 14 },
    { id: 'rapid', name: 'Rapid Test Analyzer', dept: 'Serology / POCT', status: 'Online', workState: 'Ready', currentSample: '-', waitingCount: 0, completedCount: 6 }
  ]);

  // Barcode Workstation Interactive states
  const [scannedPatientId, setScannedPatientId] = useState('');
  const [scannedSpecimenId, setScannedSpecimenId] = useState('');
  const [assistantActivePatient, setAssistantActivePatient] = useState(null);
  const [assistantSelectedTests, setAssistantSelectedTests] = useState([]);
  const [validationAlert, setValidationAlert] = useState(null); // { text, severity }

  // Search & Filter state for Dashboard
  const [searchTerm, setSearchTerm] = useState('');

  // Analyzer simulator state
  const [selectedTaskForRun, setSelectedTaskForRun] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedAnalyzerId, setSelectedAnalyzerId] = useState('');

  const downloadReportPDF = () => {
    const input = document.getElementById('lab-report-sheet');
    if (!input) return;
    html2canvas(input, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`lab-report-${printedTaskData?.specimenId || 'specimen'}.pdf`);
    });
  };

  // Pathologist Verification states
  const [activeTaskForQC, setActiveTaskForQC] = useState(null);
  const [qcRemarks, setQcRemarks] = useState('');
  const [showPrintReportModal, setShowPrintReportModal] = useState(false);
  const [printedTaskData, setPrintedTaskData] = useState(null);

  // LIS Feed terminal logs
  const [lisLogs, setLisLogs] = useState([
    { id: 1, time: '14:45:12', text: 'System: CLIA immunology interface calibrated successfully.', type: 'sys' },
    { id: 2, time: '14:32:04', text: 'LAB-2026-0001: Chemistry reports auto-transmitted to Pathologist review.', type: 'info' },
    { id: 3, time: '13:10:45', text: 'Biochemistry 400: Daily QC controls verified.', type: 'success' },
    { id: 4, time: '11:15:30', text: 'LAB-2026-0003: Swiped & registered for specimen containership.', type: 'sys' }
  ]);

  // Sync analyzers state with context analyzerConnections
  useEffect(() => {
    if (analyzerConnections) {
      setAnalyzers(prev => prev.map(a => {
        const conn = analyzerConnections.find(c => c.id === a.id);
        if (conn) {
          return {
            ...a,
            status: conn.status,
            protocol: conn.protocol,
            port: conn.port,
            healthScore: conn.healthScore
          };
        }
        return a;
      }));
    }
  }, [analyzerConnections]);

  // Sync waiting queue count for analyzers
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnalyzers(prev => prev.map(mac => {
        let waiting = 0;
        labTasks.forEach(task => {
          if (['Sample Collected', 'Sample Registered', 'Processing', 'Analyzer Running'].includes(task.status)) {
            task.orderedTests.forEach(t => {
              const dest = getMachineForTest(t);
              if (dest && dest.id === mac.id && !task.testResults[t]) {
                waiting++;
              }
            });
          }
        });
        return { ...mac, waitingCount: waiting };
      }));
    }, 0);
    return () => clearTimeout(timer);
  }, [labTasks]);

  // Log logger
  const addLisLog = (text, type = 'info') => {
    const time = new Date().toTimeString().split(' ')[0];
    setLisLogs(prev => [{ id: Date.now(), time, text, type }, ...prev.slice(0, 15)]);
  };

  // Helper mappings
  const getPatientBarcodeId = (clinicId) => {
    if (!clinicId) return '';
    const num = clinicId.replace('PAT-', '');
    return `RK-${num.slice(-4)}`;
  };

  const getSpecimenBarcodeId = (clinicId) => {
    if (!clinicId) return '';
    const num = clinicId.replace('PAT-', '');
    return `RKLAB-${num.slice(-4)}`;
  };

  const getNumericSuffix = (barcode) => {
    if (!barcode) return '';
    const match = barcode.match(/\d+/);
    return match ? match[0] : '';
  };



  // Helper to parse pre-ordered clinic requests
  const getPreorderedClinicRequests = () => {
    const grouped = {};
    labRequests.forEach(req => {
      if (req.status === 'Ordered' || req.status === 'Pending Sample Collection') {
        if (!grouped[req.patientId]) {
          const pat = patients.find(p => p.id === req.patientId);
          grouped[req.patientId] = {
            patientId: req.patientId,
            patientBarcode: getPatientBarcodeId(req.patientId),
            patientName: req.patientName,
            age: pat ? pat.age : 30,
            gender: pat ? pat.gender : 'Male',
            phone: pat ? pat.phone : '9988443322',
            tests: []
          };
        }
        if (!grouped[req.patientId].tests.includes(req.testName)) {
          grouped[req.patientId].tests.push(req.testName);
        }
      }
    });
    return Object.values(grouped);
  };

  // Automated simulated output generator
  const generateSimulatedResults = (testNames) => {
    const results = {};
    const timestamp = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    testNames.forEach(test => {
      const nameLower = test.toLowerCase();
      if (nameLower.includes('cbc')) {
        const hb = (11.8 + Math.random() * 5).toFixed(1);
        const wbc = Math.floor(4200 + Math.random() * 7500).toLocaleString();
        const platelets = (1.6 + Math.random() * 2.8).toFixed(1);
        results['CBC'] = {
          val: `Hemoglobin (Hb): ${hb} g/dL (Ref: 12.0 - 16.0), WBC Count: ${wbc} /cumm (Ref: 4,000 - 11,000), Platelet Count: ${platelets} L/cumm (Ref: 1.5 - 4.5)`,
          machine: 'Hematology Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('esr')) {
        const esr = Math.floor(5 + Math.random() * 25);
        results['ESR'] = {
          val: `ESR: ${esr} mm/hr (Ref: 0 - 20)`,
          machine: 'Hematology Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('hba1c')) {
        const isDiabetic = Math.random() > 0.6;
        const hba1c = (isDiabetic ? 6.8 + Math.random() * 4 : 5.0 + Math.random() * 1.3).toFixed(1);
        const flag = hba1c >= 6.5 ? ' (Diabetic)' : hba1c >= 5.7 ? ' (Prediabetic)' : ' (Normal)';
        results['HbA1c'] = {
          val: `HbA1c: ${hba1c} %${flag} (Ref: < 5.7% Normal, 5.7-6.4% Prediabetes, >=6.5% Diabetes)`,
          machine: 'Weldon WB-150 Biochemistry Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('thyroid') || nameLower.includes('tsh')) {
        const isHypo = Math.random() > 0.6;
        const tsh = (isHypo ? 5.2 + Math.random() * 8 : 0.8 + Math.random() * 3.2).toFixed(2);
        const ft4 = (isHypo ? 0.6 + Math.random() * 0.4 : 0.9 + Math.random() * 0.7).toFixed(1);
        const flag = tsh > 4.5 ? ' (High TSH - Hypothyroidism)' : '';
        results['Thyroid Profile'] = {
          val: `TSH: ${tsh} uIU/mL${flag} (Ref: 0.45 - 4.50), Free T4: ${ft4} ng/dL (Ref: 0.8 - 1.8)`,
          machine: 'Maglumi 800',
          completedAt: timestamp
        };
      } else if (nameLower.includes('urine')) {
        results['Urine Routine'] = {
          val: `Urine Protein: Nil (Ref: Nil), Urine Glucose: Nil (Ref: Nil), Pus Cells: 2-3 /hpf (Ref: 0-5)`,
          machine: 'Urine Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('lipid')) {
        const isHigh = Math.random() > 0.5;
        const chol = isHigh ? Math.floor(210 + Math.random() * 80) : Math.floor(150 + Math.random() * 48);
        const tg = isHigh ? Math.floor(160 + Math.random() * 100) : Math.floor(90 + Math.random() * 58);
        const hdl = Math.floor(35 + Math.random() * 25);
        results['Lipid Profile'] = {
          val: `Total Cholesterol: ${chol} mg/dL (Ref: < 200), Triglycerides: ${tg} mg/dL (Ref: < 150), HDL Cholesterol: ${hdl} mg/dL (Ref: > 40)`,
          machine: 'Weldon WB-150 Biochemistry Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('liver') || nameLower.includes('lft')) {
        const sgot = Math.floor(15 + Math.random() * 40);
        const sgpt = Math.floor(15 + Math.random() * 50);
        const bil = (0.2 + Math.random() * 1.5).toFixed(1);
        results['Liver Function Test (LFT)'] = {
          val: `SGOT (AST): ${sgot} U/L (Ref: 5 - 40), SGPT (ALT): ${sgpt} U/L (Ref: 7 - 56), Total Bilirubin: ${bil} mg/dL (Ref: 0.1 - 1.2)`,
          machine: 'Weldon WB-150 Biochemistry Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('kidney') || nameLower.includes('kft')) {
        const urea = Math.floor(18 + Math.random() * 35);
        const creat = (0.7 + Math.random() * 0.9).toFixed(1);
        results['Kidney Function Test (KFT)'] = {
          val: `Blood Urea: ${urea} mg/dL (Ref: 15 - 45), Serum Creatinine: ${creat} mg/dL (Ref: 0.6 - 1.2)`,
          machine: 'Weldon WB-150 Biochemistry Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('electrolyte')) {
        const sod = Math.floor(136 + Math.random() * 8);
        const pot = (3.6 + Math.random() * 1.3).toFixed(1);
        results['Electrolytes'] = {
          val: `Serum Sodium: ${sod} mEq/L (Ref: 135 - 145), Serum Potassium: ${pot} mEq/L (Ref: 3.5 - 5.1)`,
          machine: 'Electrolyte Analyzer',
          completedAt: timestamp
        };
      } else if (nameLower.includes('crp')) {
        const crp = (0.5 + Math.random() * 15.0).toFixed(1);
        const flag = crp >= 6.0 ? ' (High - Inflammation)' : '';
        results['CRP'] = {
          val: `C-Reactive Protein (CRP): ${crp} mg/L${flag} (Ref: < 6.0)`,
          machine: 'Rapid Test Analyzer',
          completedAt: timestamp
        };
      } else {
        results[test] = {
          val: 'Standard observation values verified normal.',
          machine: 'Rapid Test Analyzer',
          completedAt: timestamp
        };
      }
    });
    
    return results;
  };

  // Critical Warnings Generator
  const getCriticalAlerts = () => {
    const alerts = [];
    labTasks.forEach(task => {
      if (task.testResults) {
        Object.entries(task.testResults).forEach(([testName, res]) => {
          if (res.val && (res.val.includes('High') || res.val.includes('Low') || res.val.includes('Diabetic'))) {
            const matches = res.val.match(/([a-zA-Z\s()]+):\s*([0-9.]+)\s*([a-zA-Z/%<>\s]+)?\(High\)|\(Low\)|\(Diabetic\)/i);
            const detail = matches ? `${matches[1]}: ${matches[2]}` : res.val.split(',')[0];
            alerts.push({
              id: `${task.taskId}-${testName}`,
              taskId: task.taskId,
              patientName: task.patientName,
              testName: testName,
              value: detail,
              severity: res.val.includes('High') || res.val.includes('Diabetic') ? 'danger' : 'warning'
            });
          }
        });
      }
    });
    return alerts;
  };

  // Step 1: Scan Patient
  const handleScanPatient = (barcodeInput) => {
    setValidationAlert(null);
    const cleanBarcode = barcodeInput.trim().toUpperCase();
    setScannedPatientId(cleanBarcode);

    if (!cleanBarcode) {
      setAssistantActivePatient(null);
      return;
    }

    // Find in pre-orders or patient database
    const preorder = getPreorderedClinicRequests().find(p => p.patientBarcode === cleanBarcode);
    if (preorder) {
      setAssistantActivePatient({
        id: preorder.patientBarcode,
        clinicPatientId: preorder.patientId,
        name: preorder.patientName,
        age: preorder.age,
        gender: preorder.gender,
        phone: preorder.phone,
        doctorName: 'Dr. Aditya Dev',
        opdNumber: 'OPD Token',
        orderedTests: preorder.tests
      });
      setAssistantSelectedTests(preorder.tests);
      addLisLog(`Patient Barcode ${cleanBarcode} read success. Pre-ordered tests loaded.`, 'success');
      return;
    }

    // Try standard patient ID
    const pat = patients.find(p => p.id === cleanBarcode || getPatientBarcodeId(p.id) === cleanBarcode);
    if (pat) {
      const barcode = getPatientBarcodeId(pat.id);
      setScannedPatientId(barcode);
      setAssistantActivePatient({
        id: barcode,
        clinicPatientId: pat.id,
        name: pat.name,
        age: pat.age,
        gender: pat.gender,
        phone: pat.phone,
        doctorName: 'Dr. R. Kumar',
        opdNumber: 'OPD Walk-in',
        orderedTests: ['CBC'] // default suggested
      });
      setAssistantSelectedTests(['CBC']);
      addLisLog(`Patient Profile ${pat.id} mapped to barcode ${barcode}.`, 'info');
    } else {
      setAssistantActivePatient(null);
      setValidationAlert({ text: `⚠️ Patient Barcode "${cleanBarcode}" not recognized in clinic database.`, severity: 'danger' });
    }
  };

  // Step 3: Verify Specimen Barcode Suffix Linkage
  const handleVerifySpecimen = (specimenInput) => {
    setValidationAlert(null);
    const cleanSpecimen = specimenInput.trim().toUpperCase();
    setScannedSpecimenId(cleanSpecimen);

    if (!assistantActivePatient) {
      setValidationAlert({ text: '⚠️ Please scan and verify a patient barcode first.', severity: 'danger' });
      return;
    }

    if (!cleanSpecimen) return;

    // Suffix linkage validation
    const patSuffix = getNumericSuffix(assistantActivePatient.id);
    const specSuffix = getNumericSuffix(cleanSpecimen);

    if (!patSuffix || !specSuffix || patSuffix !== specSuffix) {
      setValidationAlert({
        text: `⚠️ Barcode Mismatch Warning! Specimen container ID "${cleanSpecimen}" is not linked to Patient barcode "${assistantActivePatient.id}".`,
        severity: 'danger'
      });
      addLisLog(`Mismatch: Linkage failed between ${assistantActivePatient.id} and ${cleanSpecimen}.`, 'warning');
      return;
    }

    // Check duplicate specimen processing
    const duplicate = labTasks.find(t => t.specimenId === cleanSpecimen && t.status !== 'Delivered');
    if (duplicate) {
      setValidationAlert({
        text: `⚠️ Duplicate Specimen Alert! Specimen container "${cleanSpecimen}" is already active under Task ${duplicate.taskId}.`,
        severity: 'danger'
      });
      return;
    }

    // Green verification
    setValidationAlert({
      text: `✓ Linkage Verified: Patient ${assistantActivePatient.id} ↔ Specimen Container ${cleanSpecimen} matched.`,
      severity: 'success'
    });
    addLisLog(`Verification Linkage Success: ${assistantActivePatient.id} ↔ ${cleanSpecimen}.`, 'success');
  };

  // Step 5: Save/Create Consolidated Lab Task
  const handleCreateLabTask = () => {
    if (!assistantActivePatient || !scannedSpecimenId) {
      alert("Invalid Workstation State: Patient and Specimen verification required.");
      return;
    }

    const patSuffix = getNumericSuffix(assistantActivePatient.id);
    const specSuffix = getNumericSuffix(scannedSpecimenId);
    if (patSuffix !== specSuffix) {
      alert("Validation Failed: Specimen mismatch. Linking is locked.");
      return;
    }

    if (assistantSelectedTests.length === 0) {
      alert("Please select at least one laboratory test panel.");
      return;
    }

    const nextTaskId = `LAB-2026-${patSuffix.padStart(4, '0')}`;

    const newTask = {
      taskId: nextTaskId,
      patientId: assistantActivePatient.id,
      clinicPatientId: assistantActivePatient.clinicPatientId,
      patientName: assistantActivePatient.name,
      age: assistantActivePatient.age,
      gender: assistantActivePatient.gender,
      phone: assistantActivePatient.phone,
      doctorName: assistantActivePatient.doctorName,
      opdNumber: assistantActivePatient.opdNumber,
      specimenId: scannedSpecimenId,
      status: 'Sample Collected',
      orderedTests: [...assistantSelectedTests],
      testResults: {},
      verifiedBy: null,
      verifiedAt: null,
      remarks: ''
    };

    setLabTasks(prev => {
      // Remove any old incomplete tasks with same ID to prevent duplicates
      const filtered = prev.filter(t => t.taskId !== nextTaskId);
      return [...filtered, newTask];
    });

    // Update EMR queue state in clinic context
    setLabRequests(prev => prev.map(req => {
      if (req.patientId === assistantActivePatient.clinicPatientId && (req.status === 'Ordered' || req.status === 'Pending Sample Collection')) {
        return { ...req, status: 'Collected', specimenId: scannedSpecimenId };
      }
      return req;
    }));

    // Update Lab Orders status in context
    setLabOrders(prev => prev.map(order => {
      if (order.patientId === assistantActivePatient.clinicPatientId) {
        return { ...order, status: 'Sample Collected' };
      }
      return order;
    }));

    const patientBarcode = assistantActivePatient.id;
    const suffix = getNumericSuffix(patientBarcode);
    const labOrderId = `LAB-${suffix.padStart(6, '0')}`;
    const visitId = `VIS-${suffix.padStart(6, '0')}`;
    // Find today's prescription for this patient (if any)
    const todayPresc = prescriptions.find(p => p.patientId === assistantActivePatient.clinicPatientId);
    const rxId = todayPresc ? todayPresc.id : 'N/A';

    addLisLog(`Verification Linkage Success:`, 'success');
    addLisLog(`• Patient ID: ${patientBarcode} (${assistantActivePatient.clinicPatientId})`, 'success');
    addLisLog(`• Visit ID: ${visitId}`, 'success');
    addLisLog(`• Lab Order Number: ${labOrderId}`, 'success');
    addLisLog(`• Prescription ID: ${rxId}`, 'success');
    addLisLog(`• Lab Sample ID: ${scannedSpecimenId}`, 'success');
    addLisLog(`• Linked Tests: ${assistantSelectedTests.join(', ')}`, 'success');

    alert(`Success: Laboratory Task #${nextTaskId} generated.\n\n` +
          `Linked Entities:\n` +
          `• Patient: ${assistantActivePatient.name} (${patientBarcode})\n` +
          `• Visit ID: ${visitId}\n` +
          `• Lab Order Number: ${labOrderId}\n` +
          `• Prescription: ${rxId}\n` +
          `• Sample Barcode (ID): ${scannedSpecimenId}\n` +
          `• Ordered Tests: ${assistantSelectedTests.join(', ')}`);
    
    // Clear Workstation
    setScannedPatientId('');
    setScannedSpecimenId('');
    setAssistantActivePatient(null);
    setAssistantSelectedTests([]);
    setValidationAlert(null);

    // Switch tab to analyzer port
    setLabActiveTab('results');
  };

  // Run analyzer simulator cycle
  const handleLaunchAnalyzer = () => {
    if (!selectedTaskForRun || !selectedAnalyzerId) {
      alert("Select a specimen task and target analyzer port.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    const machine = analyzers.find(a => a.id === selectedAnalyzerId);

    // Update machine status in telemetry grid
    setAnalyzers(prev => prev.map(a => a.id === selectedAnalyzerId ? { ...a, workState: 'Processing', currentSample: selectedTaskForRun.specimenId } : a));
    addLisLog(`Centrifuge Spin running on ${machine.name} for sample ${selectedTaskForRun.specimenId}.`, 'warning');

    // Notify backend analyzer running
    if (markAnalyzerRunning) {
      markAnalyzerRunning(selectedTaskForRun.taskId);
    }

    const interval = setInterval(() => {
      setAnalysisProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            // Map which tests of the task belong to this analyzer
            const testsToRun = selectedTaskForRun.orderedTests.filter(t => {
              const dest = getMachineForTest(t);
              return dest && dest.id === selectedAnalyzerId;
            });

            // Generate output values
            const generatedOutputs = generateSimulatedResults(testsToRun);

            // Call backend context to save results and update EMR/Alerts
            saveLabResult(selectedTaskForRun.taskId, generatedOutputs, machine.name);
            
            // Advance task status to QC Verification
            if (markQCVerification) {
              markQCVerification(selectedTaskForRun.taskId);
            }

            addLisLog(`LIS Task ${selectedTaskForRun.taskId}: Machine Completed. Pushed to QC verification.`, 'success');

            // Reset machine workstate
            setAnalyzers(prev => prev.map(a => a.id === selectedAnalyzerId ? { ...a, workState: 'Ready', currentSample: '-', completedCount: a.completedCount + 1 } : a));
            setIsAnalyzing(false);
            setSelectedTaskForRun(null);
            alert(`Analyzer spin complete for sample ${selectedTaskForRun.specimenId}.`);
          }, 300);
          return 100;
        }
        return p + 20;
      });
    }, 250);
  };

  // Pathologist qc verification submit
  const handleQCVerify = () => {
    if (!activeTaskForQC) return;

    verifyLabOrder(activeTaskForQC.taskId, qcRemarks || 'All parameters within physiological limits.', 'Dr. S. Vardhan, MD');

    addLisLog(`Verified consolidates for ${activeTaskForQC.patientName} (Task: ${activeTaskForQC.taskId}).`, 'success');
    alert(`Consolidated Diagnostic Report Verified for Task ${activeTaskForQC.taskId}. Released to EMR.`);
    
    // Set for printing
    const updatedTask = {
      ...activeTaskForQC,
      status: 'Verified',
      verifiedBy: 'Dr. S. Vardhan, MD',
      verifiedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      remarks: qcRemarks || 'All parameters within physiological limits.'
    };
    setPrintedTaskData(updatedTask);
    setActiveTaskForQC(null);
    setQcRemarks('');
  };

  // Main UI Tab Content router
  const renderTabContent = () => {
    switch (labActiveTab) {
      case 'registration': // Incoming Queue & Sample Collection
        const incomingOrders = labOrders.filter(o => ['Ordered', 'Accepted'].includes(o.status));
        return (
          <div className="dashboard-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
            {/* Incoming Test Orders Queue */}
            <div className="panel-card" style={{ padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-card-title" style={{ marginBottom: '16px', fontSize: '15px', fontWeight: '800', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                📥 Incoming Lab Test Orders Queue
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '500px' }}>
                {incomingOrders.map(order => {
                  const barcodeGen = barcodeGeneratedForOrder[order.labOrderNumber];
                  const barcodePrn = barcodePrintedForOrder[order.labOrderNumber];
                  const suffix = order.labOrderNumber.split('-').pop();
                  const patientBarcode = `RK-${suffix}`;
                  const specimenBarcode = `RKLAB-${suffix}`;

                  return (
                    <div 
                      key={order.labOrderNumber} 
                      style={{ 
                        padding: '14px', 
                        border: '1.5px solid var(--border-color)', 
                        borderRadius: '10px', 
                        backgroundColor: activeOrderForCollection?.labOrderNumber === order.labOrderNumber ? 'rgba(79, 70, 229, 0.04)' : 'var(--bg-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '13px' }}>{order.labOrderNumber}</span>
                          <span className={`badge ${order.priority === 'Emergency' ? 'badge-rose' : order.priority === 'Urgent' ? 'badge-amber' : 'badge-sky'}`} style={{ fontSize: '9px', marginLeft: '6px' }}>
                            {order.priority}
                          </span>
                        </div>
                        <span className="badge badge-secondary" style={{ fontSize: '9.5px' }}>{order.status}</span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        <div><strong>Patient ID:</strong> {order.patientId}</div>
                        <div><strong>Patient Name:</strong> {order.patientName}</div>
                        <div><strong>Visit ID:</strong> {order.visitId}</div>
                        <div><strong>Doctor Name:</strong> {order.doctorName}</div>
                        <div><strong>Order Time:</strong> {order.orderTime}</div>
                      </div>

                      <div style={{ fontSize: '11.5px', color: 'var(--primary)', fontWeight: '700', margin: '2px 0' }}>
                        📋 Ordered Tests: {order.orderedTests.join(', ')}
                      </div>

                      {barcodeGen && (
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '8px', border: '1.5px dashed var(--border-color)', margin: '4px 0' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '2px' }}>PATIENT ID</span>
                              <span style={{ letterSpacing: '2px', fontWeight: 'bold', fontFamily: 'monospace', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#1e293b', fontSize: '10.5px' }}>
                                ||| {patientBarcode} |||
                              </span>
                            </div>
                            <SpecimenQRCode value={patientBarcode} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '2px' }}>SPECIMEN ID</span>
                              <span style={{ letterSpacing: '2px', fontWeight: 'bold', fontFamily: 'monospace', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#1e293b', fontSize: '10.5px' }}>
                                ||| {specimenBarcode} |||
                              </span>
                            </div>
                            <SpecimenQRCode value={specimenBarcode} />
                          </div>
                          {barcodePrn && <span style={{ fontSize: '11px', color: 'var(--emerald)', fontWeight: 'bold', marginLeft: 'auto' }}>✓ Printed</span>}
                        </div>
                      )}

                      {/* Workflow buttons */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                        {order.status === 'Ordered' && (
                          <button 
                            type="button" 
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              acceptLabOrder(order.labOrderNumber);
                              addLisLog(`Accepted order ${order.labOrderNumber} for ${order.patientName}`, 'success');
                            }}
                          >
                            Accept Order
                          </button>
                        )}
                        
                        {order.status === 'Accepted' && !barcodeGen && (
                          <button 
                            type="button" 
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setBarcodeGeneratedForOrder(prev => ({ ...prev, [order.labOrderNumber]: true }));
                              addLisLog(`Generated barcodes for ${order.labOrderNumber}`, 'info');
                            }}
                          >
                            Generate Barcode
                          </button>
                        )}

                        {barcodeGen && !barcodePrn && (
                          <button 
                            type="button" 
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setBarcodePrintedForOrder(prev => ({ ...prev, [order.labOrderNumber]: true }));
                              alert(`Mock Print: Labels printed for ${patientBarcode} & ${specimenBarcode}`);
                              addLisLog(`Printed barcodes for ${order.labOrderNumber}`, 'success');
                            }}
                          >
                            Print Barcode
                          </button>
                        )}

                        {barcodePrn && (
                          <button 
                            type="button" 
                            className="btn btn-indigo btn-sm"
                            onClick={() => {
                              setActiveOrderForCollection(order);
                              setCollectionSampleType(order.orderedTests[0]?.toLowerCase().includes('urine') ? 'Urine' : 'Blood');
                              setCollectionTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
                            }}
                          >
                            Collect Sample
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {incomingOrders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                    No pending incoming test orders.
                  </div>
                )}
              </div>
            </div>

            {/* Right Box: Sample Collection Workstation Form */}
            <div className="panel-card" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
              <h3 className="panel-card-title" style={{ marginBottom: '16px', fontSize: '15px', fontWeight: '800', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                🧪 Sample Collection Workstation
              </h3>

              {activeOrderForCollection ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', animation: 'fadeIn 0.2s ease-out' }}>
                  <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.02)', padding: '12px', border: '1px solid var(--primary-light)', borderRadius: '8px', fontSize: '12.5px' }}>
                    <strong>Active Case:</strong> {activeOrderForCollection.patientName} (Order: {activeOrderForCollection.labOrderNumber})<br />
                    <strong>Visit ID:</strong> {activeOrderForCollection.visitId} | <strong>Doctor Name:</strong> {activeOrderForCollection.doctorName}<br />
                    <strong>Tests Requested:</strong> {activeOrderForCollection.orderedTests.join(', ')}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="input-label-style">Sample Type Required</label>
                    <select 
                      value={collectionSampleType}
                      onChange={(e) => setCollectionSampleType(e.target.value)}
                      className="select-input-style"
                    >
                      <option value="Blood">Blood</option>
                      <option value="Serum">Serum</option>
                      <option value="Plasma">Plasma</option>
                      <option value="Urine">Urine</option>
                      <option value="Stool">Stool</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="input-label-style">Collected By (Phlebotomist)</label>
                    <input 
                      type="text" 
                      value={collectionBy}
                      onChange={(e) => setCollectionBy(e.target.value)}
                      className="select-input-style"
                      placeholder="e.g. Lab Tech Suresh"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="input-label-style">Collection Time</label>
                    <input 
                      type="text" 
                      value={collectionTime}
                      onChange={(e) => setCollectionTime(e.target.value)}
                      className="select-input-style"
                    />
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-indigo"
                    style={{ height: '42px', fontWeight: '800', marginTop: '10px' }}
                    onClick={() => {
                      collectLabSample(activeOrderForCollection.labOrderNumber, collectionSampleType, collectionBy, collectionTime);
                      alert(`Success: Sample collected and registered under container ID RKLAB-${activeOrderForCollection.labOrderNumber.split('-').pop()}. Pushed to Analyzer Port.`);
                      addLisLog(`Collected ${collectionSampleType} sample for order ${activeOrderForCollection.labOrderNumber}`, 'success');
                      setActiveOrderForCollection(null);
                      setLabActiveTab('results');
                    }}
                  >
                    ⚡ Submit Sample Collection & Register Vial
                  </button>

                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setActiveOrderForCollection(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                  Select an order with printed barcodes from the left Incoming Queue to start the sample collection workflow.
                </div>
              )}
            </div>
          </div>
        );

      case 'results': // Analyzer Port Tab
        const activeVials = labTasks.filter(t => [
          'Sample Collected', 
          'Sample Registered', 
          'Assigned', 
          'Processing', 
          'Analyzer Running', 
          'QC Verification', 
          'Pending Verification', 
          'Completed'
        ].includes(t.status));
        
        return (
          <div className="dashboard-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
            {/* Left Column: Analyzer Station & Result Entry */}
            <div className="panel-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <h3 className="panel-card-title" style={{ marginBottom: '18px', fontSize: '15px', fontWeight: '800', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                🔬 LIS Analyzer Assignment & Result Entry
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="input-label-style">Select Active Specimen Container</label>
                  <select 
                    value={selectedTaskForRun ? selectedTaskForRun.taskId : ''}
                    onChange={(e) => {
                      const task = labTasks.find(t => t.taskId === e.target.value);
                      setSelectedTaskForRun(task);
                      setSelectedAnalyzerId('');
                      setManualEntryMode(false);
                      if (task) {
                        const initObj = {};
                        task.orderedTests.forEach(test => {
                          initObj[test] = task.testResults[test]?.val || '';
                        });
                        setManualResultsObj(initObj);
                      }
                    }}
                    className="select-input-style"
                  >
                    <option value="">-- Choose Container in Laboratory Queue --</option>
                    {activeVials.map(t => (
                      <option key={t.taskId} value={t.taskId}>
                        {t.taskId} - {t.patientName} (Specimen: {t.specimenId} | Status: {t.status})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTaskForRun && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.01)', fontSize: '12.5px' }}>
                      <strong>Active Specimen:</strong> <code>{selectedTaskForRun.specimenId}</code><br />
                      <strong>Patient Name:</strong> {selectedTaskForRun.patientName} (Age: {selectedTaskForRun.age})<br />
                      <strong>Tests Requested:</strong> {selectedTaskForRun.orderedTests.join(', ')}<br />
                      <strong>Machine Assigned:</strong> {selectedTaskForRun.machineAssigned || 'None'}
                    </div>

                    {selectedTaskForRun.status === 'Sample Collected' && (
                      <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px', margin: '4px 0' }}>
                        <span style={{ fontSize: '12px', color: 'var(--amber)', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          ⚠️ Specimen container must be registered at the Pathology desk before processing.
                        </span>
                        <button
                          type="button"
                          className="btn btn-amber btn-sm"
                          style={{ width: '100%', height: '36px', fontWeight: 'bold' }}
                          onClick={() => {
                            registerLabSample(selectedTaskForRun.taskId);
                            // Update selection reference status locally
                            setSelectedTaskForRun(prev => ({ ...prev, status: 'Sample Registered' }));
                            addLisLog(`Specimen ${selectedTaskForRun.specimenId} registered at Pathology Lab.`, 'success');
                          }}
                        >
                          📥 Register Specimen Container
                        </button>
                      </div>
                    )}

                    {selectedTaskForRun.status !== 'Sample Collected' ? (
                      <>
                        <div style={{ display: 'flex', gap: '10px', margin: '4px 0' }}>
                          <button 
                            type="button" 
                            className={`btn ${!manualEntryMode ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setManualEntryMode(false)}
                            style={{ flex: 1, fontSize: '12px' }}
                          >
                            🔬 LIS Analyzer Import
                          </button>
                          <button 
                            type="button" 
                            className={`btn ${manualEntryMode ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setManualEntryMode(true)}
                            style={{ flex: 1, fontSize: '12px' }}
                          >
                            ✍️ Manual Result Entry
                          </button>
                        </div>

                        {!manualEntryMode ? (
                          /* LIS Analyzer Mode */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label className="input-label-style">Select Connected Analyzer Port</label>
                              <select 
                                value={selectedAnalyzerId}
                                onChange={(e) => {
                                  setSelectedAnalyzerId(e.target.value);
                                }}
                                className="select-input-style"
                              >
                                <option value="">-- Choose Target Analyzer Machine --</option>
                                {analyzers.map(mac => {
                                  const isCompatible = selectedTaskForRun.orderedTests.some(t => {
                                    const dest = getMachineForTest(t);
                                    return dest && dest.id === mac.id;
                                  });
                                  return (
                                    <option key={mac.id} value={mac.id}>
                                      {mac.name} - {mac.dept} {isCompatible ? '★ (Recommended)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {selectedAnalyzerId && (
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                  type="button" 
                                  className="btn btn-indigo"
                                  style={{ flex: 1, height: '40px', fontWeight: '750' }}
                                  onClick={() => {
                                    assignLabMachine(selectedTaskForRun.taskId, analyzers.find(a => a.id === selectedAnalyzerId)?.name);
                                    addLisLog(`Assigned ${selectedTaskForRun.taskId} to analyzer ${selectedAnalyzerId}`, 'info');
                                    handleLaunchAnalyzer();
                                  }}
                                  disabled={isAnalyzing}
                                >
                                  🚀 Assign & Run Analyzer Cycle
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Manual Entry Mode */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                              Manual Observations:
                            </strong>
                            {selectedTaskForRun.orderedTests.map(testName => (
                              <div key={testName} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <label style={{ fontSize: '11.5px', fontWeight: '700' }}>{testName} Results</label>
                                  <button 
                                    type="button" 
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '2px 6px', fontSize: '9.5px' }}
                                    onClick={() => {
                                      const defaults = generateSimulatedResults([testName]);
                                      setManualResultsObj(prev => ({
                                        ...prev,
                                        [testName]: defaults[testName]?.val || ''
                                      }));
                                    }}
                                  >
                                    Load Template
                                  </button>
                                </div>
                                <textarea 
                                  rows="2"
                                  value={manualResultsObj[testName] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setManualResultsObj(prev => ({ ...prev, [testName]: val }));
                                  }}
                                  className="clinical-textarea"
                                  placeholder={`Enter observations for ${testName}...`}
                                  style={{ minHeight: '60px', fontSize: '12px' }}
                                />
                              </div>
                            ))}

                            <button 
                              type="button" 
                              className="btn btn-indigo"
                              style={{ height: '40px', fontWeight: '800', marginTop: '6px' }}
                              onClick={() => {
                                const resultsPayload = {};
                                const timestamp = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                selectedTaskForRun.orderedTests.forEach(test => {
                                  resultsPayload[test] = {
                                    val: manualResultsObj[test] || 'Standard observation values verified normal.',
                                    machine: 'Manual Entry',
                                    completedAt: timestamp
                                  };
                                });

                                saveLabResult(selectedTaskForRun.taskId, resultsPayload, 'Manual Entry');
                                if (markQCVerification) {
                                  markQCVerification(selectedTaskForRun.taskId);
                                }
                                alert(`Success: Results saved manually for specimen ${selectedTaskForRun.specimenId}. Pushed to Pathology Verification QC.`);
                                addLisLog(`Manual result entry completed for task ${selectedTaskForRun.taskId}`, 'success');
                                setSelectedTaskForRun(null);
                                setManualEntryMode(false);
                                setLabActiveTab('reports');
                              }}
                            >
                              ✓ Save Results & Mark Completed
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12.5px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                        🔒 Please register the specimen container to unlock LIS Analyzer Assignment & result entry panels.
                      </div>
                    )}
                  </div>
                )}

                {isAnalyzing && (
                  <div style={{ border: '1px solid rgba(79, 70, 229, 0.2)', borderRadius: '8px', padding: '16px', backgroundColor: 'rgba(79, 70, 229, 0.02)', animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '800', color: 'var(--primary)', marginBottom: '8px' }}>
                      <span>{analyzers.find(a => a.id === selectedAnalyzerId)?.name.toUpperCase()} RUNNING</span>
                      <span>{analysisProgress}%</span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${analysisProgress}%`, backgroundColor: 'var(--primary)', transition: 'width 0.3s ease' }} />
                    </div>
                    <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic', textAlign: 'center' }}>
                      Spinning container tray, scanning specimen barcode & transmitting biochemistry assays...
                    </span>
                  </div>
                )}

              </div>
            </div>

            {/* Right Column: Active Queue list */}
            <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
              <h3 className="panel-card-title" style={{ marginBottom: '14px', fontSize: '14px', fontWeight: '800' }}>
                ⏳ Specimen Processing Queue ({activeVials.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '420px' }}>
                {activeVials.map(v => (
                  <div key={v.taskId} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{v.patientName}</strong>
                      <span className={`badge ${v.status === 'Processing' ? 'badge-amber' : v.status === 'Completed' ? 'badge-emerald' : 'badge-sky'}`} style={{ fontSize: '10px' }}>{v.status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Task ID: <code>{v.taskId}</code> | Specimen: <code>{v.specimenId}</code>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--primary)', marginTop: '6px', fontWeight: 600 }}>
                      Tests: {v.orderedTests.map(t => `${t}${v.testResults[t] ? ' (✓)' : ''}`).join(', ')}
                    </div>
                  </div>
                ))}

                {activeVials.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No specimens waiting for machine run.
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'reports': // Pathologist QC Tab
        const verificationTasks = labTasks.filter(t => [
          'QC Verification',
          'Pending Verification', 
          'Machine Completed', 
          'Completed', 
          'Verified',
          'Report Generated',
          'Report Delivered'
        ].includes(t.status));
        
        return (
          <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Left side: Queue of reports */}
            <div className="panel-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <h3 className="panel-card-title" style={{ marginBottom: '16px', fontSize: '15px', fontWeight: '800', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                🛡️ Pathologist verification & QC Queue ({verificationTasks.filter(t => !['Verified', 'Report Generated', 'Report Delivered'].includes(t.status)).length})
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '420px' }}>
                {verificationTasks.map(t => (
                  <div key={t.taskId} style={{ padding: '14px', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '13.5px' }}>{t.patientName}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Task ID: <code>{t.taskId}</code> | Specimen: <code>{t.specimenId}</code>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--primary)', marginTop: '4px' }}>
                        Tests: {t.orderedTests.join(', ')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button 
                        className={`btn ${['Verified', 'Report Generated', 'Report Delivered'].includes(t.status) ? 'btn-secondary' : 'btn-indigo'} btn-sm`}
                        onClick={() => {
                          setActiveTaskForQC(t);
                          setQcRemarks(t.remarks);
                          setPrintedTaskData(null);
                        }}
                        style={{ padding: '6px 12px', fontSize: '11.5px' }}
                      >
                        {['Verified', 'Report Generated', 'Report Delivered'].includes(t.status) ? '👁️ View Report' : '🛡️ Verify QC'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side: QC Panel Card */}
            <div className="panel-card" style={{ padding: '24px', borderRadius: '16px' }}>
              {activeTaskForQC ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', animation: 'fadeIn 0.2s ease-out' }}>
                  <h3 style={{ fontSize: '14.5px', fontWeight: '800', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', margin: 0 }}>
                    🔬 Consolidated Laboratory Report Review
                  </h3>
                  
                  <div style={{ fontSize: '12.5px' }}>
                    <strong>Patient Name:</strong> {activeTaskForQC.patientName} ({activeTaskForQC.gender}) | <strong>Age:</strong> {activeTaskForQC.age}<br />
                    <strong>Vial ID:</strong> <code>{activeTaskForQC.specimenId}</code> | <strong>Ref Doctor:</strong> {activeTaskForQC.doctorName}
                  </div>

                  {/* Consolidated Results List */}
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Parameter</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Observed Result</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Source Analyzer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTaskForQC.orderedTests.map(testName => {
                          const res = activeTaskForQC.testResults[testName];
                          const hasAbnormal = res?.val && (res.val.includes('High') || res.val.includes('Low') || res.val.includes('Diabetic') || res.val.includes('Elevated') || res.val.includes('Hypothyroidism'));
                          return (
                            <tr key={testName} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px' }}><strong>{testName}</strong></td>
                              <td style={{ padding: '8px', color: hasAbnormal ? 'var(--rose)' : 'inherit', fontWeight: hasAbnormal ? '700' : 'normal', whiteSpace: 'pre-line' }}>
                                {res ? res.val : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Pending result...</span>}
                              </td>
                              <td style={{ padding: '8px', fontSize: '10.5px' }}>{res ? res.machine : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!['Verified', 'Report Generated', 'Report Delivered'].includes(activeTaskForQC.status) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label className="input-label-style">Technician/Pathologist Remarks</label>
                      <textarea 
                        rows="2"
                        placeholder="Enter pathologist diagnosis remarks or guidelines..."
                        value={qcRemarks}
                        onChange={(e) => setQcRemarks(e.target.value)}
                        className="select-input-style"
                        style={{ minHeight: '60px', padding: '8px', fontSize: '12px' }}
                      />
                      <button 
                        type="button" 
                        onClick={handleQCVerify}
                        className="btn btn-indigo"
                        style={{ height: '40px', fontWeight: '800', width: '100%' }}
                      >
                        ✓ Verify & Release Consolidated Report
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', marginTop: '10px' }}>
                      <div className="badge badge-emerald" style={{ padding: '8px 16px', fontSize: '12px', display: 'inline-block', marginBottom: '14px', borderRadius: '8px' }}>
                        ✓ Consolidated Diagnostic Report Verified
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          setPrintedTaskData(activeTaskForQC);
                          setShowPrintReportModal(true);
                        }}
                        className="btn btn-indigo"
                        style={{ height: '42px', fontWeight: '800', width: '100%' }}
                      >
                        🖨️ Generate Final A4 Report
                      </button>
                    </div>
                  )}

                </div>
              ) : printedTaskData ? (
                <div style={{ textAlign: 'center', padding: '60px 0', animation: 'fadeIn 0.2s ease-out' }}>
                  <span style={{ fontSize: '32px' }}>🖨️</span>
                  <h4 style={{ margin: '12px 0 6px 0', fontSize: '14px', fontWeight: '800' }}>Report Verified for {printedTaskData.patientName}</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>Verified reports are instantly routed to Doctor Dashboards & EMRs.</p>
                  <button 
                    type="button"
                    onClick={() => setShowPrintReportModal(true)}
                    className="btn btn-indigo"
                    style={{ padding: '8px 24px', fontWeight: '700' }}
                  >
                    Generate Final Report
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Select a specimen record from the left verification queue.
                </div>
              )}
            </div>
          </div>
        );

      case 'dashboard': // Upgraded LIS Dashboard View
      default:
        const criticalAlerts = getCriticalAlerts();
        
        return (
          <>
            {/* LIS Dashboard Counters */}
            <div className="lab-dashboard-grid-6">
              
              {/* Card 1: Samples Received */}
              <div className="lab-card indigo">
                <div className="lab-card-header">
                  <div className="lab-card-icon-wrapper">
                    <svg viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><path d="M8 10a2 2 0 0 1 2-2h4a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2"/></svg>
                  </div>
                  <span className="lab-card-title">Samples Received Today</span>
                </div>
                <span className="lab-card-value">
                  {labTasks.filter(t => t.status !== 'Pending').length}
                </span>
                <div className="lab-card-details">
                  <div className="lab-card-detail-row">
                    <span className="lab-card-detail-label">Total Volume</span>
                    <span className="lab-card-detail-value">{labTasks.length} Cases</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Samples Processing */}
              <div className="lab-card emerald" onClick={() => setLabActiveTab('results')} style={{ cursor: 'pointer' }}>
                <div className="lab-card-header">
                  <div className="lab-card-icon-wrapper">
                    <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
                  </div>
                  <span className="lab-card-title">Samples Processing</span>
                </div>
                <span className="lab-card-value">
                  {labTasks.filter(t => t.status === 'Processing').length}
                </span>
                <div className="lab-card-details">
                  <div className="lab-card-detail-row">
                    <span className="lab-card-detail-label">In Centrifuge</span>
                    <span className="lab-card-detail-value">{labTasks.filter(t => t.status === 'Processing').length} Vials</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Completed Reports */}
              <div className="lab-card indigo" onClick={() => setLabActiveTab('reports')} style={{ cursor: 'pointer' }}>
                <div className="lab-card-header">
                  <div className="lab-card-icon-wrapper">
                    <svg viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="7" r="4"/><path d="M2 21v-2a8 8 0 0 1 15-4"/></svg>
                  </div>
                  <span className="lab-card-title">Completed Reports</span>
                </div>
                <span className="lab-card-value">
                  {labTasks.filter(t => t.status === 'Verified').length}
                </span>
                <div className="lab-card-details">
                  <div className="lab-card-detail-row">
                    <span className="lab-card-detail-label">Total Verified</span>
                    <span className="lab-card-detail-value">{labTasks.filter(t => t.status === 'Verified').length}</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Pending Verification */}
              <div className="lab-card amber" onClick={() => setLabActiveTab('reports')} style={{ cursor: 'pointer' }}>
                <div className="lab-card-header">
                  <div className="lab-card-icon-wrapper">
                    <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <span className="lab-card-title">Pending Verification</span>
                </div>
                <span className="lab-card-value">
                  {labTasks.filter(t => t.status === 'Pending Verification' || t.status === 'Machine Completed').length}
                </span>
                <div className="lab-card-details">
                  <div className="lab-card-detail-row">
                    <span className="lab-card-detail-label">QC Review</span>
                    <span className="lab-card-detail-value">{labTasks.filter(t => t.status === 'Pending Verification').length} Queue</span>
                  </div>
                </div>
              </div>

              {/* Card 5: Delivered Reports */}
              <div className="lab-card cyan">
                <div className="lab-card-header">
                  <div className="lab-card-icon-wrapper">
                    <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
                  </div>
                  <span className="lab-card-title">Delivered Reports</span>
                </div>
                <span className="lab-card-value">
                  {labTasks.filter(t => t.status === 'Verified').length + 42}
                </span>
                <div className="lab-card-details">
                  <div className="lab-card-detail-row">
                    <span className="lab-card-detail-label">EMR Dispatched</span>
                    <span className="lab-card-detail-value">Continuous Sync</span>
                  </div>
                </div>
              </div>

              {/* Card 6: Connected Machines */}
              <div className="lab-card rose">
                <div className="lab-card-header">
                  <div className="lab-card-icon-wrapper">
                    <svg viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <span className="lab-card-title">Connected Machines</span>
                </div>
                <span className="lab-card-value">
                  {analyzers.filter(a => a.status === 'Online').length}
                </span>
                <div className="lab-card-details">
                  <div className="lab-card-detail-row">
                    <span className="lab-card-detail-label">Active Ports</span>
                    <span className="lab-card-detail-value">{analyzers.filter(a => a.status === 'Online').length} Online</span>
                  </div>
                </div>
              </div>

            </div>

            {/* ROW 2: MACHINE OVERVIEW, ACTIVE QUEUE, CRITICAL ALERTS */}
            <div className="lab-middle-grid-3">
              
              {/* Machine Status Overview */}
              <div className="panel-card" style={{ padding: '20px', minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
                <div className="panel-card-header" style={{ marginBottom: '12px' }}>
                  <h3 className="panel-card-title" style={{ fontSize: '13.5px', fontWeight: '800' }}>
                    🔌 Connected Analyzers & Telemetry
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, maxHeight: '310px' }}>
                  {analyzers.map(mac => (
                    <div key={mac.id} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '10px', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px', fontSize: '11.5px', backgroundColor: 'var(--bg-primary)' }}>
                      <div>
                        <strong>{mac.name}</strong><br />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{mac.dept}</span>
                        <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '4.5px' }}>
                          Interface: <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 'bold' }}>{mac.protocol || 'TCP/IP'} ({mac.port || 'Port Connected'})</span>
                        </div>
                        <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Current: <code>{mac.currentSample}</code> | Waiting: <strong>{mac.waitingCount}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            backgroundColor: mac.status === 'Online' ? 'var(--emerald)' : 'var(--text-muted)' 
                          }} />
                          <span style={{ fontWeight: '700' }}>{mac.status}</span>
                        </div>
                        <span className={`badge ${mac.workState === 'Processing' ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                          {mac.workState}
                        </span>
                        <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Today: {mac.completedCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Laboratory Queue */}
              <div className="panel-card" style={{ padding: '20px', minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
                <div className="panel-card-header" style={{ marginBottom: '12px' }}>
                  <h3 className="panel-card-title" style={{ fontSize: '13.5px', fontWeight: '800' }}>
                    ⏳ Active Laboratory Queue
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, maxHeight: '310px' }}>
                  {labTasks.filter(t => t.status !== 'Verified' && t.status !== 'Delivered').map(t => (
                    <div key={t.taskId} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-surface)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <code style={{ fontWeight: '750' }}>{t.taskId}</code>
                        <span className={`badge ${t.status === 'Processing' ? 'badge-amber' : t.status === 'Pending Verification' ? 'badge-indigo' : 'badge-sky'}`} style={{ fontSize: '9.5px' }}>
                          {t.status}
                        </span>
                      </div>
                      <div style={{ fontWeight: '600', marginTop: '4px', fontSize: '12px' }}>{t.patientName}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        <span>Container: {t.specimenId}</span>
                        <span>Tests: {t.orderedTests.length}</span>
                      </div>
                    </div>
                  ))}

                  {labTasks.filter(t => t.status !== 'Verified' && t.status !== 'Delivered').length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No active specimens in diagnostic queue.
                    </div>
                  )}
                </div>
              </div>

              {/* Critical Test Alerts */}
              <div className="panel-card" style={{ padding: '20px', minHeight: '380px', display: 'flex', flexDirection: 'column', border: '1.5px solid rgba(244, 63, 94, 0.2)' }}>
                <div className="panel-card-header" style={{ marginBottom: '12px' }}>
                  <h3 className="panel-card-title" style={{ fontSize: '13.5px', fontWeight: '800', color: 'var(--rose)' }}>
                    🔴 Critical Test Alerts
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, maxHeight: '310px' }}>
                  {criticalAlerts.map(alert => (
                    <div key={alert.id} style={{ padding: '10px 14px', border: '1px solid var(--rose-light)', borderRadius: '8px', backgroundColor: 'rgba(244, 63, 94, 0.03)', display: 'flex', flexDirection: 'column', gap: '4px', animation: 'fadeIn 0.2s ease-out' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '800', fontSize: '10px', color: 'var(--rose)', textTransform: 'uppercase' }}>Abnormal Flag</span>
                        <code style={{ fontSize: '9.5px' }}>{alert.taskId}</code>
                      </div>
                      <strong style={{ fontSize: '12px' }}>{alert.patientName}</strong>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        <strong>{alert.testName}:</strong> <span style={{ color: 'var(--rose)', fontWeight: '750' }}>{alert.value}</span>
                      </div>
                    </div>
                  ))}

                  {criticalAlerts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No abnormal clinical alerts triggered.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ROW 3: TODAY'S SPECIMENS, RECENT REPORTS, PENDING TESTS */}
            <div className="lab-middle-grid-3">
              
              {/* Today's Specimens */}
              <div className="panel-card" style={{ padding: '20px', minHeight: '340px' }}>
                <h3 className="panel-card-title" style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '12px' }}>
                  🧪 Registered Specimens Log
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '270px' }}>
                  {labTasks.map(t => {
                    const sampleType = t.orderedTests[0]?.includes('Urine') ? 'Serum Gold' : 'EDTA Lavender';
                    return (
                      <div key={t.taskId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11.5px' }}>
                        <div>
                          <strong>{t.specimenId}</strong>
                          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', display: 'block' }}>Patient: {t.patientName}</span>
                        </div>
                        <span className="badge badge-sky" style={{ textTransform: 'none', fontSize: '10px' }}>{t.orderedTests.join(', ')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Reports */}
              <div className="panel-card" style={{ padding: '20px', minHeight: '340px' }}>
                <h3 className="panel-card-title" style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '12px' }}>
                  📄 Recent Diagnostic Reports
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '270px' }}>
                  {labTasks.filter(t => t.status === 'Verified').map(t => (
                    <div key={t.taskId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11.5px', backgroundColor: 'rgba(16, 185, 129, 0.02)' }}>
                      <div>
                        <strong>{t.patientName}</strong>
                        <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', display: 'block' }}>Ref: {t.taskId}</span>
                      </div>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: '10px' }}
                        onClick={() => {
                          setPrintedTaskData(t);
                          setShowPrintReportModal(true);
                        }}
                      >
                        🖨️ Print
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Sample Collection Queue */}
              <div className="panel-card" style={{ padding: '20px', minHeight: '340px' }}>
                <h3 className="panel-card-title" style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🧪 Pending Sample Collection Queue</span>
                  <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                    {labOrders ? labOrders.filter(o => o.status === 'Pending Sample Collection').length : 0} Orders
                  </span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '270px' }}>
                  {labOrders && labOrders.filter(o => o.status === 'Pending Sample Collection').map(o => (
                    <div key={o.labOrderNumber} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '800', color: 'var(--primary)' }}>{o.labOrderNumber}</span>
                        <span className="badge badge-amber" style={{ fontSize: '9.5px', textTransform: 'none' }}>{o.status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', marginTop: '2px' }}>
                        <span>{o.patientName} <small style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>({o.patientId})</small></span>
                        <span style={{ color: 'var(--text-secondary)' }}>{o.visitId}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        <strong>Tests:</strong> {o.orderedTests.join(', ')}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', borderTop: '1px dashed var(--border-color)', paddingTop: '4px' }}>
                        <span>Doctor: {o.doctorName}</span>
                        <span>Ordered: {o.orderTime}</span>
                      </div>
                    </div>
                  ))}
                  {(!labOrders || labOrders.filter(o => o.status === 'Pending Sample Collection').length === 0) && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                      No pending sample collections.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Bottom logs console */}
            <div className="panel-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: '800', margin: 0 }}>📺 Live Laboratory Information Feed (LIS Monitor)</h3>
              <div style={{ backgroundColor: '#0f172a', color: '#38bdf8', padding: '12px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '11.5px', height: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', border: '1.5px solid #1e293b' }}>
                {lisLogs.map(log => (
                  <div key={log.id} style={{ borderBottom: '1px solid #1e293b', paddingBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>[{log.time}]</span>{' '}
                    <span style={{ 
                      color: log.type === 'success' ? '#34d399' : 
                             log.type === 'warning' ? '#f59e0b' : 
                             log.type === 'sys' ? '#a78bfa' : '#38bdf8' 
                    }}>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      case 'inventory':
        return <LabInventoryTab />;
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'LIS Dashboard' },
    { id: 'registration', label: 'Assistant Workstation' },
    { id: 'results', label: 'Analyzer Port' },
    { id: 'reports', label: 'Pathologist QC' },
    { id: 'inventory', label: 'Lab Inventory' }
  ];

  // If the active role is doctor, render the doctor's redesigned patient-centric lab panel
  if (activeRole === 'doctor') {
    return <DoctorLaboratoryPanel />;
  }

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Dynamic style block */}
      <style>{`
        .lab-dashboard-grid-6 {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }

        @media (max-width: 1200px) {
          .lab-dashboard-grid-6 {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 768px) {
          .lab-dashboard-grid-6 {
            grid-template-columns: repeat(2, 1fr);
          }
          .lab-middle-grid-3 {
            grid-template-columns: 1fr !important;
          }
        }
        
        .lab-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 16px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .lab-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        
        .lab-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .lab-card-icon-wrapper {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(79, 70, 229, 0.06);
          color: var(--primary);
        }

        .lab-card svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .lab-card-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .lab-card-value {
          font-family: var(--font-title);
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .lab-card-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-top: 1px solid var(--border-color);
          padding-top: 8px;
          font-size: 10.5px;
        }

        .lab-card-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .lab-card-detail-label {
          color: var(--text-muted);
        }

        .lab-card-detail-value {
          font-weight: 600;
          color: var(--text-secondary);
        }

        .lab-card.emerald .lab-card-icon-wrapper { background-color: rgba(16, 185, 129, 0.06); color: var(--emerald); }
        .lab-card.amber .lab-card-icon-wrapper { background-color: rgba(245, 158, 11, 0.06); color: var(--amber); }
        .lab-card.rose .lab-card-icon-wrapper { background-color: rgba(244, 63, 94, 0.06); color: var(--rose); }
        .lab-card.cyan .lab-card-icon-wrapper { background-color: rgba(6, 182, 212, 0.06); color: var(--sky); }
        .lab-card.rose { border: 1.5px solid rgba(244, 63, 94, 0.15); }

        .lab-middle-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }

        .tab-btn-lis {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 650;
          padding: 8px 16px;
          cursor: pointer;
          border-bottom: 2.5px solid transparent;
          transition: all 0.2s;
        }

        .tab-btn-lis.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
          font-weight: 800;
        }

        .input-label-style {
          font-size: 10.5px;
          font-weight: 750;
          text-transform: uppercase;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 4px;
        }

        .select-input-style {
          height: 38px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1.5px solid var(--border-color);
          width: 100%;
          background-color: var(--bg-surface);
          color: var(--text-primary);
          outline: none;
          font-size: 13px;
          transition: border-color 0.2s;
        }
        
        .select-input-style:focus {
          border-color: var(--primary);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .printed-sticker-slidein {
          border: 2px dashed var(--primary);
          background-color: #ffffff;
          padding: 14px;
          border-radius: 8px;
          text-align: center;
        }

        .preorder-item-card {
          transition: background-color 0.2s;
        }
        .preorder-item-card:hover {
          background-color: rgba(79, 70, 229, 0.02) !important;
        }

        .text-rose { color: var(--rose) !important; }
        .spinner-loader {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid #ccc;
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* LIS Navigation Header */}
      <div className="panel-card" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🔬</span>
          <span style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)' }}>LIS Workflow Navigator</span>
        </div>
        
        <div style={{ display: 'flex', gap: '4px' }}>
          {tabs.map(t => (
            <button 
              key={t.id} 
              className={`tab-btn-lis ${labActiveTab === t.id ? 'active' : ''}`}
              onClick={() => {
                setLabActiveTab(t.id);
                setValidationAlert(null);
                setScannedPatientId('');
                setScannedSpecimenId('');
                setAssistantActivePatient(null);
                setSelectedTaskForRun(null);
                setPrintedTaskData(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Tab Render Body */}
      <div className="lis-body-container">
        {renderTabContent()}
      </div>

      {/* PRINT DIALOG MODAL: Consolidated diagnostic A4 sheet report */}
      {showPrintReportModal && printedTaskData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '680px', backgroundColor: '#ffffff', color: '#1e293b', borderRadius: '16px', padding: '30px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            
            {/* Action buttons at top */}
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
                  onClick={downloadReportPDF} 
                  className="btn btn-primary btn-sm"
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '750', backgroundColor: '#10b981', borderColor: '#10b981' }}
                >
                  📥 Download PDF
                </button>
                <button 
                  onClick={() => {
                    setShowPrintReportModal(false);
                    setPrintedTaskData(null);
                  }} 
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* A4 Printable Sheet Area */}
            <div id="lab-report-sheet" style={{ padding: '20px', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#fcfcfc', fontFamily: 'Arial, sans-serif' }}>
              
              {/* Report Header Branding */}
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

              {/* Patient and Referral details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '11.5px', borderBottom: '1px solid #cbd5e1', paddingBottom: '12px', marginBottom: '16px', lineHeight: '1.4' }}>
                <div>
                  <strong>Patient Name:</strong> {printedTaskData.patientName}<br />
                  <strong>Patient ID Barcode:</strong> <code>{printedTaskData.patientId}</code> (Clinic Ref: {printedTaskData.clinicPatientId})<br />
                  <strong>Age / Gender:</strong> {printedTaskData.age} Years / {printedTaskData.gender}<br />
                  <strong>Phone Number:</strong> {printedTaskData.phone}
                </div>
                <div>
                  <strong>Assigned Doctor:</strong> {printedTaskData.doctorName}<br />
                  <strong>OPD Registry Number:</strong> {printedTaskData.opdNumber}<br />
                  <strong>Specimen Barcode:</strong> <code>{printedTaskData.specimenId}</code><br />
                  <strong>Task Reference:</strong> <code>{printedTaskData.taskId}</code>
                </div>
              </div>

              {/* Verified details header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>
                <span><strong>Collection Time:</strong> {printedTaskData.verifiedAt ? printedTaskData.verifiedAt.split(' ')[0] + ' 09:30 AM' : 'Today'}</span>
                <span><strong>Release Time:</strong> {printedTaskData.verifiedAt || 'Pending'}</span>
              </div>

              {/* Merged tests parameter grid */}
              <div style={{ marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8', fontWeight: 'bold', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Test Parameter / Analyte</th>
                      <th style={{ padding: '6px 8px' }}>Observed Result Value</th>
                      <th style={{ padding: '6px 8px' }}>Standard Reference Range</th>
                      <th style={{ padding: '6px 8px' }}>Flag / Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printedTaskData.orderedTests.map(testName => {
                      const res = printedTaskData.testResults[testName];
                      const isHigh = res?.val && res.val.includes('High');
                      const isLow = res?.val && res.val.includes('Low');
                      const isDiabetic = res?.val && res.val.includes('Diabetic');
                      const hasFlag = isHigh || isLow || isDiabetic;

                      // Destructure parameter list if it contains newlines
                      const lines = res ? res.val.split('\n') : ['Awaiting analyzer run...'];

                      return lines.map((line, idx) => {
                        // Extract observed value and ranges
                        const detailMatch = line.match(/(.*?):\s*([0-9.]+)\s*([a-zA-Z/%<>\s]+)?\((Ref:\s*[^)]+)\)?/i) || 
                                            line.match(/(.*?):\s*([0-9.]+)\s*([a-zA-Z/%<>\s()]+)?\((Normal:\s*[^)]+)\)?/i);
                        
                        let paramName = line.split(':')[0] || testName;
                        let obsValue = line.split(':')[1] || '';
                        let refRange = 'Standard clinical bounds';
                        let flagText = '-';

                        if (detailMatch) {
                          paramName = detailMatch[1];
                          obsValue = detailMatch[2] + (detailMatch[3] ? ' ' + detailMatch[3].replace('(High)', '').replace('(Low)', '').replace('(Diabetic)', '').trim() : '');
                          refRange = detailMatch[4];
                        }

                        if (hasFlag) {
                          if (isHigh || line.includes('High')) flagText = 'H (High)';
                          else if (isLow || line.includes('Low')) flagText = 'L (Low)';
                          else if (isDiabetic || line.includes('Diabetic')) flagText = 'A (Abnormal)';
                        }

                        return (
                          <tr key={`${testName}-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px 8px' }}>
                              {idx === 0 ? <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '2px', fontSize: '11.5px' }}>{testName}</strong> : null}
                              <span style={{ paddingLeft: idx === 0 ? '0' : '10px', color: '#334155' }}>{paramName}</span>
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: hasFlag ? 'bold' : 'normal', color: hasFlag ? '#dc2626' : '#0f172a' }}>
                              {obsValue}
                            </td>
                            <td style={{ padding: '6px 8px', color: '#64748b', fontStyle: 'italic' }}>
                              {refRange}
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: 'bold', color: hasFlag ? '#dc2626' : '#64748b' }}>
                              {flagText}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>

              {/* Remarks */}
              <div style={{ padding: '10px 14px', border: '1.5px dashed #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc', fontSize: '11px', marginBottom: '20px', lineHeight: '1.4' }}>
                <strong>Clinical Remarks & Interpretation:</strong><br />
                <span style={{ color: '#334155' }}>{printedTaskData.remarks}</span>
              </div>

              {/* Signatures */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginTop: '16px', borderTop: '1px solid #cbd5e1', paddingTop: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <strong style={{ display: 'block', fontStyle: 'italic' }}>Dr. S. Vardhan, MD</strong>
                  <span style={{ color: '#64748b' }}>QC Consultant Pathologist</span><br />
                  <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>MC Registry: #38421</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <strong style={{ display: 'block' }}>Dr. Aditya Dev, MBBS, MD</strong>
                  <span style={{ color: '#64748b' }}>Medical Clinical Director</span><br />
                  <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>RK Clinic & Labs Authority</span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
