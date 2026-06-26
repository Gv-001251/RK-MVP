"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';

// Available Lab Tests for selection
const labTestsOptions = [
  'CBC', 'ESR', 'HbA1c', 'Lipid Profile', 'Thyroid Profile',
  'LFT', 'KFT', 'Urine Routine', 'ECG', 'X-Ray'
];

// Helper to generate unique Rx ID
const generateRxId = () => {
  return `RK-RX-${Math.floor(1000 + Math.random() * 9000)}`;
};

export default function DoctorConsultationPanel({ onPrintPrescription, onNavigateToTab }) {
  const {
    queue,
    setQueue,
    patients,
    inventory,
    prescriptions,
    addLabRequest,
    createLabOrder,
    submitConsultation,
    setNursingNotes,
    doctorName,
    doctorRole,
    clinicName,
    currency,
    labTasks,
    setLabTasks,
    labOrders,
    setLabOrders
  } = useClinic();

  // 1. Queue management & filtering
  const [searchQuery, setSearchQuery] = useState('');
  
  const getFullTokenQueue = () => {
    const baseQueue = queue.map(q => {
      const pat = patients.find(p => p.id === q.patientId);
      return {
        token: q.token,
        patientId: q.patientId,
        patientName: pat ? pat.name : 'Unknown Patient',
        age: pat ? pat.age : '--',
        gender: pat ? pat.gender : '--',
        phone: pat ? pat.phone : '--',
        visitType: q.specialty.includes('Cardiology') ? 'IPD' : 'OPD',
        status: q.status || 'Waiting',
        doctorAssigned: q.doctor || `Dr. ${doctorName}`,
        date: new Date().toLocaleDateString('en-GB')
      };
    });

    return baseQueue.sort((a, b) => parseInt(a.token) - parseInt(b.token));
  };

  const tokenQueue = getFullTokenQueue();
  const waitingPatientsCount = tokenQueue.filter(t => t.status !== 'Completed').length;

  const filteredQueue = tokenQueue.filter(t => 
    t.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.token.includes(searchQuery)
  );

  // Selected patient token (starts with the first in-consultation or waiting patient)
  const [activeToken, setActiveToken] = useState(() => {
    const fullQueue = getFullTokenQueue();
    if (fullQueue.length > 0) {
      return fullQueue.find(t => t.status === 'In-Consultation') || 
             fullQueue.find(t => t.status === 'Waiting') || 
             fullQueue[0];
    }
    return null;
  });

  // Calculate previous visits count dynamically
  const prevVisitsCount = activeToken
    ? prescriptions.filter(rx => rx.patientId === activeToken.patientId).length
    : 0;

  // Vitals State (Read-only for doctor, populated from active patient workspace)
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bloodPressure, setBloodPressure] = useState('120/80');
  const [pulseRate, setPulseRate] = useState('72');
  const [respRate, setRespRate] = useState('18');
  const [temperature, setTemperature] = useState('98.6');
  const [spo2, setSpo2] = useState('98');
  const [bloodSugar, setBloodSugar] = useState('95');

  // Chief Complaints State
  const [complaints, setComplaints] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Medication Table State
  const [prescMeds, setPrescMeds] = useState([
    { name: '', strength: '', dose: '1 Tablet', frequency: '1-0-1', duration: '5 Days', instructions: 'After Food', notes: '' }
  ]);
  const [activeMedSearchIndex, setActiveMedSearchIndex] = useState(null);
  const [medQuery, setMedQuery] = useState('');

  // Lab Tests State (checkbox choices)
  const [selectedLabTests, setSelectedLabTests] = useState([]);
  const [testSearchQuery, setTestSearchQuery] = useState('');
  const [showTestDropdown, setShowTestDropdown] = useState(false);
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [orderPriority, setOrderPriority] = useState('Routine');
  const [selectedReportForModal, setSelectedReportForModal] = useState(null);
  const [showReportViewModal, setShowReportViewModal] = useState(false);

  const allAvailableTests = [
    'CBC', 'ESR', 'CRP', 'HbA1c', 'FBS', 'PPBS', 'LFT', 'KFT', 
    'Lipid Profile', 'Thyroid Profile', 'Urine Routine', 'Urine Culture', 
    'PT/INR', 'Electrolytes', 'ECG', 'X-Ray', 'Ultrasound',
    'T3', 'T4', 'TSH', 'SGOT', 'SGPT', 'Bilirubin', 'Urea', 'Creatinine', 'Uric Acid'
  ];

  const filteredAvailableTests = allAvailableTests.filter(test => 
    test.toLowerCase().includes(testSearchQuery.toLowerCase()) &&
    !selectedLabTests.includes(test)
  );

  const testProfiles = {
    'Diabetes Profile': ['FBS', 'PPBS', 'HbA1c'],
    'Fever Profile': ['CBC', 'ESR', 'CRP'],
    'Thyroid Profile': ['T3', 'T4', 'TSH'],
    'Liver Function Profile': ['SGOT', 'SGPT', 'Bilirubin'],
    'Kidney Function Profile': ['Urea', 'Creatinine', 'Uric Acid']
  };

  const toggleLabTest = (test) => {
    setSelectedLabTests(prev => 
      prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
    );
  };

  const addTestProfile = (profileName) => {
    const profileTests = testProfiles[profileName] || [];
    setSelectedLabTests(prev => {
      const newTests = [...prev];
      profileTests.forEach(test => {
        if (!newTests.includes(test)) {
          newTests.push(test);
        }
      });
      return newTests;
    });
  };

  const handleSelectTestFromSearch = (test) => {
    setSelectedLabTests(prev => {
      if (!prev.includes(test)) {
        return [...prev, test];
      }
      return prev;
    });
    setTestSearchQuery('');
    setShowTestDropdown(false);
  };

  // Follow-Up State
  const [followUpDate, setFollowUpDate] = useState('');
  const [referralNotes, setReferralNotes] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Handwritten Stylus Canvas State
  const canvasRef = useRef(null);
  const pathsRef = useRef([]);
  const redoStackRef = useRef([]);
  const activePathRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [palmRejection, setPalmRejection] = useState(true);
  const [penColor, setPenColor] = useState('#1e293b'); // standard dark ink
  const [penWidth, setPenWidth] = useState(2.5);
  const [canvasSnapshot, setCanvasSnapshot] = useState(null);

  // Hoisted Canvas Helper Functions
  function saveCanvasSnapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Create an in-memory canvas of the same size to generate a transparent image of just the strokes
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw only the paths, without background and grid
    pathsRef.current.forEach(path => {
      if (path.points.length < 1) return;
      tempCtx.beginPath();
      tempCtx.strokeStyle = path.color;
      tempCtx.lineWidth = path.width;
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      
      tempCtx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        tempCtx.lineTo(path.points[i].x, path.points[i].y);
      }
      tempCtx.stroke();
    });
    
    setCanvasSnapshot(tempCanvas.toDataURL('image/png'));
  }

  function drawPaperGrid(ctx, w, h) {
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let y = 35; y < h; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  function redrawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawPaperGrid(ctx, canvas.width, canvas.height);
    
    pathsRef.current.forEach(path => {
      if (path.points.length < 1) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });
    
    saveCanvasSnapshot();
  }

  function getLogicalCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function startDrawing(e) {
    if (palmRejection && e.pointerType === 'touch') {
      return;
    }
    if (e.cancelable) e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const coords = getLogicalCoords(e, canvas);
    setIsDrawing(true);
    
    activePathRef.current = {
      points: [coords],
      color: isEraserMode ? '#ffffff' : penColor,
      width: isEraserMode ? 24 : penWidth,
      isEraser: isEraserMode
    };

    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.strokeStyle = activePathRef.current.color;
    ctx.lineWidth = activePathRef.current.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function draw(e) {
    if (!isDrawing || !activePathRef.current) return;
    if (palmRejection && e.pointerType === 'touch') return;
    if (e.cancelable) e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const coords = getLogicalCoords(e, canvas);
    const ctx = canvas.getContext('2d');
    
    const points = activePathRef.current.points;
    const lastPoint = points[points.length - 1];
    
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = activePathRef.current.color;
    ctx.lineWidth = activePathRef.current.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    points.push(coords);
  }

  function stopDrawing() {
    if (isDrawing && activePathRef.current) {
      pathsRef.current.push(activePathRef.current);
      redoStackRef.current = [];
      saveCanvasSnapshot();
    }
    setIsDrawing(false);
    activePathRef.current = null;
  }

  // Load Patient Workspace vitals and inputs on activeToken change via useEffect
  useEffect(() => {
    if (!activeToken) return;
    
    const loadPatientWorkspace = () => {
      if (activeToken.patientId === 'PAT-000001') {
        setHeight('176'); setWeight('74'); setBloodPressure('125/82'); setPulseRate('72'); setTemperature('98.4'); setSpo2('98'); setBloodSugar('110'); setRespRate('16');
      } else if (activeToken.patientId === 'PAT-000002') {
        setHeight('182'); setWeight('85'); setBloodPressure('140/90'); setPulseRate('92'); setTemperature('99.1'); setSpo2('97'); setBloodSugar('145'); setRespRate('20');
      } else if (activeToken.patientId === 'PAT-000003') {
        setHeight('165'); setWeight('68'); setBloodPressure('142/92'); setPulseRate('78'); setTemperature('98.6'); setSpo2('99'); setBloodSugar('120'); setRespRate('18');
      } else {
        setHeight('170'); setWeight('65'); setBloodPressure('120/80'); setPulseRate('70'); setTemperature('98.6'); setSpo2('99'); setBloodSugar('95'); setRespRate('16');
      }

      setComplaints('');
      setPrescMeds([{ name: '', strength: '', dose: '1 Tablet', frequency: '1-0-1', duration: '5 Days', instructions: 'After Food', notes: '' }]);
      setSelectedLabTests([]);
      setInvestigationNotes('');
      setFollowUpDate('');
      setReferralNotes('');
      setSpecialInstructions('');
      setCanvasSnapshot(null);
      pathsRef.current = [];
      redoStackRef.current = [];
      
      setTimeout(redrawCanvas, 50);
    };

    const timer = setTimeout(loadPatientWorkspace, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeToken]);

  const handleUndo = () => {
    if (pathsRef.current.length > 0) {
      const popped = pathsRef.current.pop();
      redoStackRef.current.push(popped);
      redrawCanvas();
    }
  };

  const handleRedo = () => {
    if (redoStackRef.current.length > 0) {
      const popped = redoStackRef.current.pop();
      pathsRef.current.push(popped);
      redrawCanvas();
    }
  };

  const handleClearCanvas = () => {
    if (confirm("Are you sure you want to clear the handwriting canvas?")) {
      pathsRef.current = [];
      redoStackRef.current = [];
      redrawCanvas();
    }
  };

  // Speech Recognition (Dictation) Implementation
  const handleDictate = () => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onresult = (event) => {
        const speechToText = event.results[0][0].transcript;
        setComplaints(prev => prev ? `${prev} ${speechToText}` : speechToText);
      };
      
      recognition.onerror = (e) => {
        console.error(e);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognition.start();
    } else {
      // Simulation fallback for browsers/environments without speech support
      setIsListening(true);
      setTimeout(() => {
        const simulatedTexts = [
          "Patient complaining of persistent dry cough and sore throat.",
          "Chief complaint is severe headache and body pain for 3 days.",
          "Patient has high fever and joint pain since yesterday."
        ];
        const randomSim = simulatedTexts[Math.floor(Math.random() * simulatedTexts.length)];
        setComplaints(prev => prev ? `${prev} ${randomSim}` : randomSim);
        setIsListening(false);
      }, 1500);
    }
  };

  // Medicine management handlers
  const handleAddMedRow = () => {
    setPrescMeds([...prescMeds, { name: '', strength: '', dose: '1 Tablet', frequency: '1-0-1', duration: '5 Days', instructions: 'After Food', notes: '' }]);
  };

  const handleDeleteMedRow = (idx) => {
    const updated = prescMeds.filter((_, i) => i !== idx);
    setPrescMeds(updated.length > 0 ? updated : [{ name: '', strength: '', dose: '1 Tablet', frequency: '1-0-1', duration: '5 Days', instructions: 'After Food', notes: '' }]);
  };

  const handleUpdateMedCell = (idx, field, value) => {
    const updated = [...prescMeds];
    updated[idx][field] = value;
    setPrescMeds(updated);
  };

  const handleMedQueryChange = (idx, value) => {
    handleUpdateMedCell(idx, 'name', value);
    setMedQuery(value);
    setActiveMedSearchIndex(idx);
  };

  const handleSelectMedicine = (idx, item) => {
    const updated = [...prescMeds];
    updated[idx].name = item.name;
    // Guess strength if it's part of the name
    const match = item.name.match(/\d+(?:mg|ml|g|mcg)/i);
    updated[idx].strength = match ? match[0] : '';
    setPrescMeds(updated);
    setActiveMedSearchIndex(null);
    setMedQuery('');
  };

  const filteredMeds = inventory.filter(item => 
    item.name.toLowerCase().includes(medQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(medQuery.toLowerCase())
  );

  // Actions
  const handleSaveDraft = () => {
    if (!activeToken) return;
    alert(`Consultation Draft for Token #${activeToken.token} (${activeToken.patientName}) saved successfully.`);
  };

  const handleSendToPharmacy = () => {
    const validMeds = prescMeds.filter(m => m.name.trim() !== '');
    if (validMeds.length === 0) {
      alert("No medications prescribed to transmit.");
      return;
    }
    alert(`Meds transmitted directly to Pharmacy: \n${validMeds.map(m => `• ${m.name} ${m.strength || ''} (${m.dose} - ${m.frequency})`).join('\n')}`);
  };

  const handleSendToLaboratory = () => {
    if (selectedLabTests.length === 0) {
      alert("No laboratory tests selected to transmit.");
      return;
    }
    const order = createLabOrder(activeToken.patientId, selectedLabTests, displayDoctorName, investigationNotes, orderPriority);
    alert(`LIS Order Generated: Dispatched ${order?.labOrderNumber || 'LAB-ORDER'} directly to Pathology LIS.`);
    setSelectedLabTests([]);
    setInvestigationNotes('');
    setOrderPriority('Routine');
  };

  const handlePrintPrescription = () => {
    if (activeToken && selectedLabTests.length > 0) {
      createLabOrder(activeToken.patientId, selectedLabTests, displayDoctorName, investigationNotes, orderPriority);
    }
    const validMeds = prescMeds.filter(m => m.name.trim() !== '');
    const rxPrintData = {
      id: generateRxId(),
      date: new Date().toLocaleDateString('en-GB'),
      patientId: activeToken?.patientId || 'WALK-IN',
      meds: validMeds,
      symptoms: complaints || 'General Consultation',
      vitals: `BP: ${bloodPressure}, HR: ${pulseRate} bpm, Temp: ${temperature}°F, SpO2: ${spo2}%, Sugar: ${bloodSugar}mg/dL, Ht: ${height}cm, Wt: ${weight}kg`,
      weight: weight,
      followUp: followUpDate ? `${followUpDate} (${referralNotes || 'Routine Review'})` : 'PRN (As Needed)',
      canvasSnapshot: canvasSnapshot,
      labTests: selectedLabTests,
      token: activeToken?.token || 'n/a',
      visitType: activeToken?.visitType || 'OPD',
      specialInstructions: specialInstructions,
      referralNotes: referralNotes
    };
    onPrintPrescription(rxPrintData);
  };

  const handleCompleteConsultation = (e) => {
    if (e) e.preventDefault();
    if (!activeToken) return;

    const validMeds = prescMeds.filter(m => m.name.trim() !== '');
    const consultDiag = "General OPD Consultation"; // Simplification: removed ICD coding block

    // Submit to Context
    submitConsultation(activeToken.patientId, {
      diagnosis: consultDiag,
      symptoms: complaints || 'General OPD Consultation',
      meds: validMeds.map(m => ({
        name: `${m.name} ${m.strength || ''}`,
        dose: `${m.dose} - ${m.frequency} (${m.instructions})`,
        duration: m.duration
      })),
      rxHandwriting: canvasSnapshot
    });

    // Auto Dispatch Lab Requests & Create Order
    if (selectedLabTests.length > 0) {
      createLabOrder(activeToken.patientId, selectedLabTests, displayDoctorName, investigationNotes, orderPriority);
      setSelectedLabTests([]);
      setInvestigationNotes('');
      setOrderPriority('Routine');
    }

    // Set nursing history log
    setNursingNotes(prev => [
      {
        time: 'Just now',
        author: `Dr. ${doctorName}`,
        priority: 'Routine',
        patientId: activeToken.patientId,
        text: `OPD Consultation complete. Vitals: BP ${bloodPressure}, HR ${pulseRate}. Meds: ${validMeds.length} items. Stylus EMR generated.`
      },
      ...prev
    ]);

    // Update token status
    setQueue(prev => prev.map(q => q.patientId === activeToken.patientId ? { ...q, status: 'Completed' } : q));

    const printData = {
      id: generateRxId(),
      date: new Date().toLocaleDateString('en-GB'),
      patientId: activeToken.patientId,
      meds: validMeds,
      symptoms: complaints || 'General Consultation',
      vitals: `BP: ${bloodPressure}, HR: ${pulseRate} bpm, Temp: ${temperature}°F, SpO2: ${spo2}%, Sugar: ${bloodSugar}mg/dL, Ht: ${height}cm, Wt: ${weight}kg`,
      weight: weight,
      followUp: followUpDate ? `${followUpDate} (${referralNotes || 'Routine Review'})` : 'PRN (As Needed)',
      canvasSnapshot: canvasSnapshot,
      labTests: selectedLabTests,
      token: activeToken.token || 'n/a',
      visitType: activeToken.visitType || 'OPD',
      specialInstructions: specialInstructions,
      referralNotes: referralNotes
    };

    alert("Consultation complete. Dispatching digital transmission & opening print preview.");
    onPrintPrescription(printData);

    // Call next patient
    const remaining = tokenQueue.filter(t => t.token !== activeToken.token && t.status !== 'Completed');
    if (remaining.length > 0) {
      setActiveToken(remaining[0]);
    } else {
      onNavigateToTab('dashboard');
    }
  };

  const handleSelectPatient = (t) => {
    setActiveToken(t);
  };

  const displayDoctorName = doctorName ? (doctorName.startsWith('Dr.') ? doctorName : 'Dr. ' + doctorName) : 'Dr. R. Kumar';

  return (
    <div className="content-panel active" style={{ display: 'flex', flexFlow: 'column', gap: '20px' }}>
      
      {/* Redesigned Tablet-friendly styling declarations */}
      <style>{`
        .tablet-consultation-workspace {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 20px;
          align-items: stretch;
          min-height: calc(100vh - 120px);
        }

        .tablet-sidebar-queue {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sidebar-header-summary {
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-bottom: 1.5px solid var(--border-color);
          padding-bottom: 12px;
        }

        .search-patient-box {
          position: relative;
          width: 100%;
        }

        .search-patient-box input {
          width: 100%;
          padding: 8px 12px 8px 34px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          font-size: 13px;
          outline: none;
          background-color: var(--bg-primary);
        }

        .search-patient-box svg {
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

        .queue-items-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: calc(100vh - 280px);
        }

        .patient-queue-item-card {
          width: 100%;
          border: 1px solid var(--border-color);
          background-color: var(--bg-primary);
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: all 0.2s;
        }

        .patient-queue-item-card:hover {
          border-color: var(--primary);
          background-color: var(--primary-light);
        }

        .patient-queue-item-card.active {
          border-color: var(--primary);
          background-color: rgba(79, 70, 229, 0.08);
          box-shadow: 0 0 0 1px var(--primary);
        }

        .tablet-main-workspace {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .workspace-section-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 20px;
          box-shadow: var(--shadow-sm);
        }

        .section-title-bar {
          font-family: var(--font-title);
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 8px;
        }

        /* Vitals Horizontal block layout */
        .vitals-horizontal-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 12px;
        }

        .vital-read-only-card {
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: center;
        }

        .vital-read-only-card label {
          font-size: 9px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .vital-read-only-card span {
          font-size: 14px;
          font-weight: 800;
          color: var(--text-primary);
        }

        /* Medicine Table styling */
        .tablet-med-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }

        .tablet-med-table th {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-secondary);
          padding: 8px 10px;
          border-bottom: 2px solid var(--border-color);
          text-align: left;
        }

        .tablet-med-table td {
          padding: 8px 6px;
          vertical-align: middle;
        }

        /* Canvas Style */
        .stylus-canvas-container {
          background-color: #ffffff;
          border: 1.5px solid var(--border-color);
          border-radius: var(--radius-sm);
          position: relative;
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        .canvas-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--bg-primary);
          padding: 8px 16px;
          border-bottom: 1px solid var(--border-color);
          border-top-left-radius: var(--radius-sm);
          border-top-right-radius: var(--radius-sm);
        }

        .canvas-drawing-area {
          cursor: crosshair;
          touch-action: none;
          width: 100%;
          background-color: #ffffff;
        }

        /* Dictate button pulsing */
        .dictate-pulse-active {
          animation: mic-pulsing 1.2s infinite alternate;
          color: var(--rose) !important;
          border-color: var(--rose) !important;
        }

        @keyframes mic-pulsing {
          0% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.4); }
          100% { box-shadow: 0 0 0 6px rgba(244, 63, 94, 0); }
        }

        .test-chip-checkbox {
          display: none;
        }

        .test-chip-label {
          padding: 6px 12px;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          user-select: none;
        }

        .test-chip-checkbox:checked + .test-chip-label {
          background-color: var(--primary);
          color: white;
          border-color: var(--primary);
        }
      `}</style>

      <div className="tablet-consultation-workspace">
        
        {/* LEFT SIDEBAR: Patient Queue & Filter */}
        <aside className="tablet-sidebar-queue">
          <div className="sidebar-header-summary">
            <h4 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 Patient Queue</span>
              <span className="badge badge-sky" style={{ fontSize: '10px' }}>{waitingPatientsCount} Queue</span>
            </h4>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Current Active Token: <strong style={{ color: 'var(--primary)' }}>TKN-{activeToken?.token || 'None'}</strong>
            </div>
            
            <div className="search-patient-box" style={{ marginTop: '8px' }}>
              <input 
                type="text" 
                placeholder="Search patient name / ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
          </div>

          <div className="queue-items-wrapper">
            {filteredQueue.map(t => {
              const isSelected = activeToken?.token === t.token;
              let statusClass = 'badge-amber';
              if (t.status === 'Completed') statusClass = 'badge-emerald';
              if (t.status === 'In-Consultation') statusClass = 'badge-sky';

              return (
                <button 
                  key={t.token} 
                  className={`patient-queue-item-card ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectPatient(t)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span style={{ background: 'var(--primary)', color: 'white', padding: '1px 6px', borderRadius: '12px', fontSize: '9px', fontWeight: '700' }}>TKN-{t.token}</span>
                    <span className={`badge ${statusClass}`} style={{ fontSize: '9px', padding: '1px 5px' }}>{t.status}</span>
                  </div>
                  <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px' }}>{t.patientName}</strong>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    <span>{t.age} / {t.gender}</span>
                    <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{t.visitType}</span>
                  </div>
                </button>
              );
            })}
            {filteredQueue.length === 0 && (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                No matching patients found.
              </div>
            )}
          </div>
        </aside>

        {/* MAIN WORKSPACE PANEL */}
        <div className="tablet-main-workspace">
          
          {/* SECTION 1: PATIENT SUMMARY */}
          <div className="workspace-section-card" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px', width: '100%' }}>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Patient ID</span>
                <strong style={{ fontSize: '13px', color: 'var(--primary)' }}>{activeToken?.patientId || '--'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Token No</span>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{activeToken?.token || '--'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Name</span>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{activeToken?.patientName || '--'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Age / Sex</span>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{activeToken?.age} Y / {activeToken?.gender}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Mobile</span>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{activeToken?.phone || '--'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Visit Date</span>
                <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{activeToken?.date}</strong>
              </div>
              <div>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Previous Visits</span>
                <span className="badge badge-sky" style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', marginTop: '2px', display: 'inline-block' }}>
                  {prevVisitsCount} visit{prevVisitsCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: VITALS (Read-Only horizontal display) */}
          <div className="workspace-section-card" style={{ padding: '14px 20px' }}>
            <div className="section-title-bar" style={{ marginBottom: '10px', borderBottom: 'none', paddingBottom: '0' }}>
              🩺 Patient Vital Signs (Entered by Triage Staff)
            </div>
            <div className="vitals-horizontal-grid">
              <div className="vital-read-only-card">
                <label>Height</label>
                <span>{height ? `${height} cm` : '--'}</span>
              </div>
              <div className="vital-read-only-card">
                <label>Weight</label>
                <span>{weight ? `${weight} kg` : '--'}</span>
              </div>
              <div className="vital-read-only-card">
                <label>Blood Pressure</label>
                <span>{bloodPressure ? bloodPressure : '--'}</span>
              </div>
              <div className="vital-read-only-card">
                <label>Pulse Rate</label>
                <span>{pulseRate ? `${pulseRate} bpm` : '--'}</span>
              </div>
              <div className="vital-read-only-card">
                <label>Temperature</label>
                <span>{temperature ? `${temperature} °F` : '--'}</span>
              </div>
              <div className="vital-read-only-card">
                <label>SpO₂</label>
                <span>{spo2 ? `${spo2} %` : '--'}</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: CHIEF COMPLAINT (Pulsing Microphone voice dictate option) */}
          <div className="workspace-section-card">
            <div className="section-title-bar">
              <span>🗣️ Chief Complaint</span>
              <button 
                type="button" 
                onClick={handleDictate} 
                className={`btn btn-secondary ${isListening ? 'dictate-pulse-active' : ''}`}
                style={{ fontSize: '11px', padding: '4px 10px', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <svg viewBox="0 0 24 24" style={{ width: '13px', height: '13px' }} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v4M8 23h8"/></svg>
                {isListening ? 'Listening...' : 'Dictate Complaint'}
              </button>
            </div>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              What is the patient&apos;s problem?
            </span>
            <textarea 
              rows="3"
              value={complaints}
              onChange={(e) => setComplaints(e.target.value)}
              className="clinical-textarea"
              placeholder="Start typing or click the dictate microphone to record the patient complaints..."
              style={{ minHeight: '80px' }}
            />
          </div>

          {/* MEDICATION SECTION */}
          <div className="workspace-section-card">
            <div className="section-title-bar">
              <span>💊 Prescription Medicines (Rx Table)</span>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleAddMedRow} 
                style={{ fontSize: '11px', padding: '5px 12px', marginLeft: 'auto' }}
              >
                + Add Medicine
              </button>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="tablet-med-table">
                <thead>
                  <tr>
                    <th style={{ width: '32%' }}>Medicine Name</th>
                    <th style={{ width: '12%' }}>Strength</th>
                    <th style={{ width: '12%' }}>Dosage</th>
                    <th style={{ width: '12%' }}>Frequency</th>
                    <th style={{ width: '12%' }}>Duration</th>
                    <th style={{ width: '14%' }}>Before/After Food</th>
                    <th style={{ width: '16%' }}>Notes</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {prescMeds.map((med, idx) => (
                    <tr key={idx}>
                      <td>
                        <div style={{ position: 'relative' }}>
                          <input 
                            type="text"
                            className="table-input"
                            value={med.name}
                            onChange={(e) => handleMedQueryChange(idx, e.target.value)}
                            onFocus={() => {
                              setActiveMedSearchIndex(idx);
                              setMedQuery(med.name);
                            }}
                            onBlur={() => setTimeout(() => {
                              if (activeMedSearchIndex === idx) {
                                setActiveMedSearchIndex(null);
                              }
                            }, 250)}
                            placeholder="Type to search..."
                          />
                          {activeMedSearchIndex === idx && medQuery && (
                            <div className="table-autocomplete-dropdown">
                              {filteredMeds.map(item => (
                                <div 
                                  key={item.id} 
                                  className="table-autocomplete-item"
                                  onMouseDown={() => handleSelectMedicine(idx, item)}
                                >
                                  <span><strong>{item.name}</strong> <small style={{ color: 'var(--text-muted)' }}>({item.category})</small></span>
                                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: item.stock > 10 ? 'var(--emerald)' : 'var(--rose)' }}>
                                    {item.stock} in stock
                                  </span>
                                </div>
                              ))}
                              {filteredMeds.length === 0 && (
                                <div className="table-autocomplete-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
                                  No matches found
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="table-input" 
                          value={med.strength} 
                          onChange={(e) => handleUpdateMedCell(idx, 'strength', e.target.value)}
                          placeholder="e.g. 650mg"
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="table-input" 
                          value={med.dose} 
                          onChange={(e) => handleUpdateMedCell(idx, 'dose', e.target.value)}
                          placeholder="e.g. 1 Tablet"
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="table-input" 
                          value={med.frequency} 
                          onChange={(e) => handleUpdateMedCell(idx, 'frequency', e.target.value)}
                          placeholder="e.g. 1-0-1"
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="table-input" 
                          value={med.duration} 
                          onChange={(e) => handleUpdateMedCell(idx, 'duration', e.target.value)}
                          placeholder="e.g. 5 Days"
                        />
                      </td>
                      <td>
                        <select 
                          className="table-input" 
                          value={med.instructions}
                          onChange={(e) => handleUpdateMedCell(idx, 'instructions', e.target.value)}
                          style={{ padding: '8px' }}
                        >
                          <option value="After Food">After Food</option>
                          <option value="Before Food">Before Food</option>
                          <option value="With Food">With Food</option>
                          <option value="Empty Stomach">Empty Stomach</option>
                        </select>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="table-input" 
                          value={med.notes} 
                          onChange={(e) => handleUpdateMedCell(idx, 'notes', e.target.value)}
                          placeholder="e.g. PRN"
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          type="button" 
                          onClick={() => handleDeleteMedRow(idx)}
                          style={{ border: 'none', background: 'none', color: 'var(--rose)', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recommended Laboratory Investigations SECTION */}
          <div className="workspace-section-card">
            <div className="section-title-bar">
              <span>🔬 Recommended Laboratory Investigations</span>
            </div>
            
            <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Search and select pathological, biochemistry, or imaging investigations. Apply predefined test profiles for single-click selection.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Search laboratory tests */}
              <div style={{ position: 'relative', width: '100%' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  🔍 Search Investigations
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text"
                    className="table-input"
                    placeholder="Type to search tests (e.g. CBC, CRP, LFT, Ultrasound...)"
                    value={testSearchQuery}
                    onChange={(e) => {
                      setTestSearchQuery(e.target.value);
                      setShowTestDropdown(true);
                    }}
                    onFocus={() => setShowTestDropdown(true)}
                    style={{ height: '38px' }}
                  />
                  {testSearchQuery && (
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => { setTestSearchQuery(''); setShowTestDropdown(false); }}
                      style={{ fontSize: '11px', padding: '0 12px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {showTestDropdown && testSearchQuery && (
                  <div className="table-autocomplete-dropdown" style={{ width: '100%', zIndex: 10, position: 'absolute', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)', maxHeight: '200px', overflowY: 'auto' }}>
                    {filteredAvailableTests.map(test => (
                      <div 
                        key={test} 
                        className="table-autocomplete-item"
                        onMouseDown={() => handleSelectTestFromSearch(test)}
                        style={{ padding: '10px 12px', cursor: 'pointer' }}
                      >
                        <strong>{test}</strong>
                      </div>
                    ))}
                    {filteredAvailableTests.length === 0 && (
                      <div className="table-autocomplete-item" style={{ color: 'var(--text-muted)', cursor: 'default', padding: '10px 12px' }}>
                        No matching tests found (or already selected)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Predefined profiles for quick selection */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  📁 Predefined Test Profiles (Single-Click Add)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {Object.keys(testProfiles).map(profileName => (
                    <button
                      key={profileName}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => addTestProfile(profileName)}
                      style={{ 
                        fontSize: '11.5px', 
                        padding: '6px 14px', 
                        borderRadius: '20px', 
                        backgroundColor: 'var(--bg-primary)',
                        border: '1.5px solid var(--border-color)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                      title={`Adds: ${testProfiles[profileName].join(', ')}`}
                    >
                      <span style={{ fontWeight: '700' }}>➕ {profileName}</span>
                      <small style={{ color: 'var(--text-secondary)', fontSize: '9.5px', opacity: 0.85 }}>
                        ({testProfiles[profileName].join(', ')})
                      </small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Add Individual Tests */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  ⚡ Quick Add Common Tests
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['CBC', 'ESR', 'CRP', 'HbA1c', 'FBS', 'PPBS', 'LFT', 'KFT', 'Lipid Profile', 'Thyroid Profile', 'Urine Routine', 'Urine Culture', 'ECG', 'X-Ray', 'Ultrasound'].map(test => {
                    const isSelected = selectedLabTests.includes(test);
                    return (
                      <button
                        key={test}
                        type="button"
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => toggleLabTest(test)}
                        style={{ 
                          fontSize: '11px', 
                          padding: '6px 12px', 
                          borderRadius: '20px',
                          border: '1.5px solid var(--border-color)',
                          backgroundColor: isSelected ? 'var(--primary)' : 'var(--bg-primary)',
                          color: isSelected ? 'white' : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        {isSelected ? '✓' : '+'} {test}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Tests Summary chips */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Selected Investigations ({selectedLabTests.length})
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '34px', alignItems: 'center' }}>
                  {selectedLabTests.map(test => (
                    <div 
                      key={test} 
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'rgba(79, 70, 229, 0.08)',
                        border: '1.5px solid var(--primary-light)',
                        borderRadius: '20px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        color: 'var(--primary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{test}</span>
                      <button
                        type="button"
                        onClick={() => toggleLabTest(test)}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          padding: '0 2px',
                          fontSize: '13px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {selectedLabTests.length === 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No investigations selected. Use the options above to add tests.
                    </span>
                  )}
                </div>
              </div>

              {/* Investigation Notes & Save Button */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      ⚠️ Order Priority
                    </label>
                    <select
                      value={orderPriority}
                      onChange={(e) => setOrderPriority(e.target.value)}
                      className="table-input"
                      style={{ height: '38px', padding: '8px' }}
                    >
                      <option value="Routine">Routine</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Emergency">Emergency</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      📝 Clinical Indications
                    </label>
                    <input 
                      type="text"
                      value={investigationNotes}
                      onChange={(e) => setInvestigationNotes(e.target.value)}
                      className="table-input"
                      placeholder="Enter clinical reasons or special instructions for laboratory tests..."
                      style={{ height: '38px' }}
                    />
                  </div>
                </div>
                
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSendToLaboratory}
                  style={{ fontWeight: '750', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  💾 Save Laboratory Request
                </button>
              </div>

            </div>
          </div>

          {/* HANDWRITTEN PRESCRIPTION SECTION (Primary Canvas) */}
          <div className="workspace-section-card">
            <div className="section-title-bar" style={{ borderBottom: 'none', marginBottom: '4px' }}>
              <span>🖊️ Stylus Handwriting Pad (Prescription Details)</span>
              
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
                {/* Palm Rejection Toggle */}
                <button 
                  type="button"
                  className={`btn ${palmRejection ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPalmRejection(!palmRejection)}
                  style={{ fontSize: '11px', padding: '5px 12px' }}
                  title="When active, touch drawing is blocked to prevent accidental marks while resting your hand on the tablet."
                >
                  {palmRejection ? '🔒 Palm Rejection: ON (Pen Only)' : '🔓 Palm Rejection: OFF'}
                </button>
              </div>
            </div>
            
            <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Use your stylus or mouse to write clinical findings, examination notes, advice, and follow-up exactly like a traditional prescription sheet.
            </p>

            <div className="stylus-canvas-container">
              {/* Canvas Toolbar */}
              <div className="canvas-toolbar">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    className={`btn ${!isEraserMode ? 'btn-primary' : 'btn-secondary'}`} 
                    onClick={() => setIsEraserMode(false)}
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    ✏️ Pen
                  </button>
                  <button 
                    type="button" 
                    className={`btn ${isEraserMode ? 'btn-primary' : 'btn-secondary'}`} 
                    onClick={() => setIsEraserMode(true)}
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    🧽 Eraser
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleUndo}
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    ↩️ Undo
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleRedo}
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    ↪️ Redo
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-rose" 
                    onClick={handleClearCanvas}
                    style={{ fontSize: '11px', padding: '4px 10px', color: 'white' }}
                  >
                    🗑️ Clear
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {/* Colors */}
                  {!isEraserMode && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Color:</span>
                      {['#1e293b', '#0284c7', '#dc2626'].map(col => (
                        <button 
                          key={col}
                          type="button"
                          onClick={() => setPenColor(col)}
                          style={{
                            width: '18px', height: '18px', borderRadius: '50%', border: penColor === col ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                            backgroundColor: col, cursor: 'pointer', padding: 0
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Pen Width */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Width:</span>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={penWidth} 
                      onChange={(e) => setPenWidth(parseFloat(e.target.value))}
                      style={{ width: '60px' }}
                    />
                    <span style={{ fontSize: '10px', width: '20px' }}>{penWidth}</span>
                  </div>
                </div>
              </div>

              {/* Drawing Canvas (Resolution-independent: width={1200} height={700} internally, scaled via CSS to min-height 50vh) */}
              <canvas 
                ref={canvasRef}
                width={1200}
                height={700}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
                className="canvas-drawing-area"
                style={{ height: '500px' }}
              />
            </div>
          </div>


          {/* FOLLOW-UP SECTION */}
          <div className="workspace-section-card">
            <div className="section-title-bar">
              📅 Follow-Up & Clinical Notes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Follow-Up Date</label>
                <input 
                  type="date" 
                  value={followUpDate} 
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="table-input"
                  style={{ height: '38px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Referral Notes / Destination</label>
                <input 
                  type="text" 
                  value={referralNotes} 
                  onChange={(e) => setReferralNotes(e.target.value)}
                  className="table-input"
                  placeholder="e.g. Refer to cardiologist for evaluation..."
                  style={{ height: '38px' }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Special Instructions / Advice</label>
              <textarea 
                rows="2"
                value={specialInstructions} 
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="clinical-textarea"
                placeholder="Enter patient lifestyle, diet, or specific medication ingestion instructions..."
                style={{ minHeight: '60px' }}
              />
            </div>
          </div>

          {/* SAVE CONSULTATION ACTIONS FOOTER BAR */}
          <div className="panel-card" style={{ padding: '16px 24px', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={handleSaveDraft} style={{ fontWeight: '700' }}>
                💾 Save Draft
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleSendToPharmacy} style={{ fontWeight: '700' }}>
                💊 Send To Pharmacy
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleSendToLaboratory} style={{ fontWeight: '700' }}>
                🔬 Save Laboratory Request
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={handlePrintPrescription} style={{ fontWeight: '700' }}>
                🖨️ Generate Prescription
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleCompleteConsultation}
                style={{ fontWeight: '800', textTransform: 'uppercase', padding: '12px 28px', fontSize: '13px' }}
              >
                ⚡ Complete Consultation
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Patient Laboratory History & Follow-Up Reports SECTION */}
      {(() => {
        if (!activeToken) return null;
        const pId = activeToken.patientId;
        const patientOrders = labOrders.filter(o => o.patientId === pId);
        
        const pending = patientOrders.filter(o => ['Ordered', 'Accepted', 'Sample Collected', 'Assigned', 'Processing'].includes(o.status));
        const completed = patientOrders.filter(o => o.status === 'Completed');
        const verified = patientOrders.filter(o => o.status === 'Verified');
        const getTaskForOrder = (orderNum) => labTasks.find(t => t.taskId === orderNum);

        return (
          <div className="workspace-section-card" style={{ margin: '20px 0' }}>
            <div className="section-title-bar">
              <span>🔬 Patient Laboratory History & Reports ({patientOrders.length})</span>
            </div>
            
            <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              View and track current and previous laboratory investigations for this patient. Review verified certified reports without leaving consultation.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              
              {/* Column 1: Pending Orders */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', backgroundColor: 'var(--bg-primary)' }}>
                <strong style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--amber)', display: 'block', borderBottom: '1.5px solid var(--border-color)', paddingBottom: '6px', marginBottom: '8px' }}>
                  ⏳ Pending Lab Orders ({pending.length})
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {pending.map(order => (
                    <div key={order.labOrderNumber} style={{ border: '1.5px solid var(--border-color)', borderRadius: '6px', padding: '8px', backgroundColor: 'var(--bg-surface)', fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--primary)' }}>
                        <span>{order.labOrderNumber}</span>
                        <span className="badge badge-amber" style={{ fontSize: '9px' }}>{order.status}</span>
                      </div>
                      <div style={{ margin: '4px 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <strong>Tests:</strong> {order.orderedTests.join(', ')}
                      </div>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                        Priority: <strong style={{ color: order.priority === 'Emergency' ? 'var(--rose)' : order.priority === 'Urgent' ? 'var(--amber)' : 'inherit' }}>{order.priority}</strong> | Time: {order.orderTime}
                      </div>
                    </div>
                  ))}
                  {pending.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                      No pending laboratory orders.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Completed Orders */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', backgroundColor: 'var(--bg-primary)' }}>
                <strong style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--primary)', display: 'block', borderBottom: '1.5px solid var(--border-color)', paddingBottom: '6px', marginBottom: '8px' }}>
                  ⚙️ Completed Results ({completed.length})
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {completed.map(order => (
                    <div key={order.labOrderNumber} style={{ border: '1.5px solid var(--border-color)', borderRadius: '6px', padding: '8px', backgroundColor: 'var(--bg-surface)', fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--primary)' }}>
                        <span>{order.labOrderNumber}</span>
                        <span className="badge badge-sky" style={{ fontSize: '9px' }}>QC Pending</span>
                      </div>
                      <div style={{ margin: '4px 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <strong>Tests:</strong> {order.orderedTests.join(', ')}
                      </div>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                        Pending Pathologist QC approval.
                      </div>
                    </div>
                  ))}
                  {completed.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                      No completed reports in QC queue.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3: Verified Reports */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', backgroundColor: 'var(--bg-primary)' }}>
                <strong style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--emerald)', display: 'block', borderBottom: '1.5px solid var(--border-color)', paddingBottom: '6px', marginBottom: '8px' }}>
                  ✓ Verified & Previous Reports ({verified.length})
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {verified.map(order => (
                    <div key={order.labOrderNumber} style={{ border: '1.5px solid var(--border-color)', borderRadius: '6px', padding: '8px', backgroundColor: 'var(--bg-surface)', fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--emerald)' }}>
                        <span>{order.labOrderNumber}</span>
                        <span className="badge badge-emerald" style={{ fontSize: '9px' }}>Verified</span>
                      </div>
                      <div style={{ margin: '4px 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <strong>Tests:</strong> {order.orderedTests.join(', ')}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>{order.orderTime.split(' ')[0]}</span>
                        <button 
                          type="button" 
                          className="btn btn-primary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                          onClick={() => { setSelectedReportForModal(order); setShowReportViewModal(true); }}
                        >
                          👁️ View Report
                        </button>
                      </div>
                    </div>
                  ))}
                  {verified.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                      No verified reports available.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Certified Laboratory Report Modal */}
      {showReportViewModal && selectedReportForModal && (
        <div className="print-rx-modal-overlay" style={{ zIndex: 1050, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="print-rx-modal-card" style={{ width: '800px', maxWidth: '90%', backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', boxShadow: 'var(--shadow-lg)' }}>
            <div className="modal-header" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="modal-title" style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>🔬 Certified Laboratory Report</h3>
              <button className="modal-close-btn" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }} onClick={() => { setShowReportViewModal(false); setSelectedReportForModal(null); }}>
                ✕
              </button>
            </div>
            
            <div className="prescription-print-preview" style={{ padding: '24px', backgroundColor: 'white', color: 'black', borderRadius: '8px', maxHeight: '60vh', overflowY: 'auto' }}>
              {(() => {
                const order = selectedReportForModal;
                const task = labTasks.find(t => t.taskId === order.labOrderNumber);
                const pat = patients.find(p => p.id === order.patientId);

                return (
                  <div style={{ fontFamily: 'sans-serif', color: '#1e293b', lineHeight: 1.4 }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.2fr', alignItems: 'end', width: '100%', borderBottom: '2.5px solid #107a82', paddingBottom: '10px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '36px', height: '36px', border: '3px solid #107a82', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '24px', color: '#107a82' }}>+</div>
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.1' }}>
                          <span style={{ fontSize: '12px', fontWeight: '900', color: '#107a82' }}>RK CLINIC</span>
                          <span style={{ fontSize: '7px', fontWeight: '800', color: '#666' }}>PATHOLOGY LAB</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', lineHeight: '1.2' }}>
                        <strong style={{ fontSize: '18px', color: '#107a82', display: 'block' }}>RK DIAGNOSTICS</strong>
                        <span style={{ fontSize: '9px', color: '#555', display: 'block' }}>Fully Automated LIS Integrated Pathology Lab</span>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '10px', color: '#333' }}>
                        <div><strong>Lab Reg:</strong> LIS-2026-908</div>
                      </div>
                    </div>

                    {/* Patient Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: '11px', paddingBottom: '10px', borderBottom: '1.5px solid #107a82', marginBottom: '14px' }}>
                      <div><strong>Patient Name:</strong> {order.patientName}</div>
                      <div><strong>Lab Order ID:</strong> {order.labOrderNumber}</div>
                      <div><strong>Age / Gender:</strong> {pat ? `${pat.age} Y / ${pat.gender}` : '--'}</div>
                      <div><strong>Visit ID:</strong> {order.visitId}</div>
                      <div><strong>Referrer Doctor:</strong> {order.doctorName}</div>
                      <div><strong>Report Date:</strong> {task?.verifiedAt || order.orderTime}</div>
                      <div><strong>Specimen Barcode:</strong> <code>{task?.specimenId || 'N/A'}</code></div>
                      <div><strong>Sample Type:</strong> {order.sampleType || task?.sampleType || 'Blood'}</div>
                    </div>

                    {/* Test Results Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1', fontWeight: 'bold' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Investigation / Biomarker</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Observed Result</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Analyzer Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.orderedTests.map(testName => {
                          const res = task?.testResults?.[testName];
                          const hasAbnormal = res?.val && (res.val.includes('High') || res.val.includes('Low') || res.val.includes('Diabetic') || res.val.includes('Elevated'));
                          return (
                            <tr key={testName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px' }}><strong>{testName}</strong></td>
                              <td style={{ padding: '8px', color: hasAbnormal ? '#e11d48' : '#0f172a', fontWeight: hasAbnormal ? '700' : 'normal', whiteSpace: 'pre-line' }}>
                                {res ? res.val : <span style={{ color: '#64748b', fontStyle: 'italic' }}>Pending result...</span>}
                              </td>
                              <td style={{ padding: '8px', fontSize: '10px', color: '#475569' }}>
                                {res ? res.machine : 'Analyzer Port (Auto)'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pathologist QC Certification */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '16px' }}>
                      <div>
                        <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>Result Source: {order.resultSource || task?.resultSource || 'Analyzer Import (LIS)'}</span>
                        <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>Machine status: {order.machineStatus || task?.machineStatus || 'Online'}</span>
                        <span style={{ fontSize: '9.5px', color: '#334155', fontWeight: '600', marginTop: '4px', display: 'block' }}>Remarks: {task?.remarks || 'All parameters stable.'}</span>
                      </div>
                      <div style={{ textAlign: 'right', width: '200px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#107a82' }}>Certified By:</div>
                        <div style={{ borderBottom: '1px solid #333', height: '20px' }}></div>
                        <strong style={{ fontSize: '10px', display: 'block', marginTop: '4px' }}>Dr. S. Vardhan, MD</strong>
                        <span style={{ fontSize: '8.5px', color: '#64748b' }}>Consultant Pathologist</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowReportViewModal(false); setSelectedReportForModal(null); }}>Close</button>
              <button type="button" className="btn btn-primary" onClick={() => { window.print(); }}>Print Report</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
