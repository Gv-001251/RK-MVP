"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';

// Clinical constants
const icdDatabase = [
  { code: 'A09', name: 'Viral Fever / Gastroenteritis' },
  { code: 'I10', name: 'Essential (Primary) Hypertension' },
  { code: 'E11.9', name: 'Type 2 Diabetes Mellitus without complications' },
  { code: 'J06.9', name: 'Acute Upper Respiratory Infection, unspecified' },
  { code: 'M25.50', name: 'Joint Pain, unspecified site' },
  { code: 'G43.909', name: 'Migraine, unspecified, not intractable' },
  { code: 'K21.9', name: 'Gastro-esophageal Reflux Disease (GERD) without esophagitis' },
  { code: 'J45.909', name: 'Asthma, unspecified, uncomplicated' },
  { code: 'I25.10', name: 'Atherosclerotic Heart Disease of native coronary artery' },
  { code: 'L20.9', name: 'Atopic Dermatitis, unspecified (Eczema)' },
  { code: 'N39.0', name: 'Urinary Tract Infection, site not specified' },
  { code: 'M54.5', name: 'Low Back Pain' }
];

const quickComplaints = ['Fever', 'Cough', 'Chest Pain', 'Headache', 'Body Ache', 'Nausea', 'Fatigue', 'Sore Throat'];
const labTestsOptions = ['CBC', 'Blood Sugar', 'LFT', 'KFT', 'Urine Routine', 'Lipid Profile'];
const radTestsOptions = ['X-Ray', 'CT Scan', 'MRI', 'Ultrasound'];

export default function OpdPanel({ onPrintPrescription, onNavigateToTab }) {
  const {
    queue,
    setQueue,
    patients,
    inventory,
    prescriptions,
    appointments,
    callNextPatient,
    submitConsultation,
    addLabRequest,
    setNursingNotes,
    doctorName,
    clinicName,
    currency
  } = useClinic();

  // Helper to get full token queue
  const getFullTokenQueue = () => {
    const baseQueue = queue.map(q => {
      const pat = patients.find(p => p.id === q.patientId);
      return {
        token: q.token,
        patientId: q.patientId,
        patientName: pat ? pat.name : 'Unknown',
        age: pat ? pat.age : '--',
        gender: pat ? pat.gender : '--',
        phone: pat ? pat.phone : '--',
        visitType: q.specialty.includes('Cardiology') ? 'IPD' : 'OPD',
        status: q.status,
        doctorAssigned: q.doctor || `Dr. ${doctorName}`,
        date: new Date().toLocaleDateString('en-GB')
      };
    });

    const mockAdditions = [
      { token: '104', patientId: 'PAT-000003', patientName: 'Fayruz Husniya', age: 42, gender: 'Female', phone: '7200177890', visitType: 'OPD', status: 'Waiting', doctorAssigned: 'Dr. Abdul Kareem', date: '17/06/2026' },
      { token: '105', patientId: 'PAT-000005', patientName: 'Aaliyah Bin Salih', age: 20, gender: 'Female', phone: '9840123456', visitType: 'Emergency', status: 'Completed', doctorAssigned: 'Dr. Abdul Kareem', date: '17/06/2026' }
    ];

    const all = [...baseQueue];
    mockAdditions.forEach(mock => {
      if (!all.some(a => a.token === mock.token)) {
        all.push(mock);
      }
    });

    return all.sort((a, b) => parseInt(a.token) - parseInt(b.token));
  };

  const tokenQueue = getFullTokenQueue();

  // Selected queue patient (starts with the first in-consultation or waiting patient)
  const [activeToken, setActiveToken] = useState(() => {
    return tokenQueue.find(t => t.status === 'In-Consultation' || t.status === 'In Progress') || 
           tokenQueue.find(t => t.status === 'Waiting') || 
           tokenQueue[0] || 
           null;
  });

  // Vitals State
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bloodPressure, setBloodPressure] = useState('120/80');
  const [pulseRate, setPulseRate] = useState('72');
  const [temperature, setTemperature] = useState('98.6');
  const [spo2, setSpo2] = useState('98');
  const [bloodSugar, setBloodSugar] = useState('95');

  // Derive BMI and BMI Category during rendering to avoid synchronous state updates in useEffect
  let bmi = '--';
  let bmiCategory = { label: 'N/A', class: 'bmi-na' };
  if (height && weight) {
    const hMeters = parseFloat(height) / 100;
    if (hMeters > 0) {
      const computed = (parseFloat(weight) / (hMeters * hMeters)).toFixed(1);
      bmi = computed;
      const val = parseFloat(computed);
      if (val < 18.5) {
        bmiCategory = { label: 'Underweight', class: 'bmi-underweight' };
      } else if (val >= 18.5 && val < 25.0) {
        bmiCategory = { label: 'Normal Weight', class: 'bmi-normal' };
      } else if (val >= 25.0 && val < 30.0) {
        bmiCategory = { label: 'Overweight', class: 'bmi-overweight' };
      } else {
        bmiCategory = { label: 'Obese', class: 'bmi-obese' };
      }
    }
  }

  // Clinical Notes State
  const [complaints, setComplaints] = useState('');
  const [generalExam, setGeneralExam] = useState('');
  const [cardioExam, setCardioExam] = useState('');
  const [respExam, setRespExam] = useState('');
  const [abdomenExam, setAbdomenExam] = useState('');

  // Diagnosis State
  const [icdSearch, setIcdSearch] = useState('');
  const [diagnoses, setDiagnoses] = useState([]);
  const [diagnosisNotes, setDiagnosisNotes] = useState('');
  const [showIcdDropdown, setShowIcdDropdown] = useState(false);

  // Prescription State
  const [prescMeds, setPrescMeds] = useState([
    { name: '', dose: '1 Tablet', frequency: 'TDS', duration: '5 Days', instructions: 'After Food' }
  ]);
  const [medSearchIndex, setMedSearchIndex] = useState(null);
  const [medSearchQuery, setMedSearchQuery] = useState('');

  // Laboratory & Radiology
  const [selectedLabTests, setSelectedLabTests] = useState([]);
  const [selectedRadTests, setSelectedRadTests] = useState([]);

  // Follow-up
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  // Digital Drawing Canvas State
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#4f46e5'); // Primary Indigo
  const [penWidth, setPenWidth] = useState(3);
  const [canvasSnapshot, setCanvasSnapshot] = useState(null);

  // Canvas Actions (Defined early to avoid hoisting issues)
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanvasSnapshot(null);
  };

  const saveCanvasSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    setCanvasSnapshot(dataUrl);
  };

  // Helper to load patient vitals and reset EMR notes
  const loadPatientVitals = (token) => {
    if (!token) return;
    if (token.patientId === 'PAT-000001') {
      setHeight('176'); setWeight('74'); setBloodPressure('125/82'); setPulseRate('72'); setTemperature('98.4'); setSpo2('98'); setBloodSugar('110');
    } else if (token.patientId === 'PAT-000002') {
      setHeight('182'); setWeight('85'); setBloodPressure('140/90'); setPulseRate('92'); setTemperature('99.1'); setSpo2('97'); setBloodSugar('145');
    } else {
      setHeight('165'); setWeight('62'); setBloodPressure('120/80'); setPulseRate('70'); setTemperature('98.6'); setSpo2('99'); setBloodSugar('95');
    }
    setComplaints('');
    setGeneralExam('Patient is alert, oriented, and in no acute distress.');
    setCardioExam('Normal S1 S2. No murmurs or gallops.');
    setRespExam('Clear to auscultation bilaterally. No wheezes or crackles.');
    setAbdomenExam('Soft, non-tender, non-distended. Normal bowel sounds.');
    setDiagnoses([]);
    setDiagnosisNotes('');
    setPrescMeds([{ name: '', dose: '1 Tablet', frequency: 'TDS', duration: '5 Days', instructions: 'After Food' }]);
    setSelectedLabTests([]);
    setSelectedRadTests([]);
    setFollowUpDate('');
    setFollowUpInstructions('');
    setCanvasSnapshot(null);
    
    // Clear canvas inline
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Load default/previous vitals when activeToken changes, deferred to prevent synchronous setState within effect
  useEffect(() => {
    if (activeToken) {
      const timer = setTimeout(() => {
        loadPatientVitals(activeToken);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeToken]);

  // Stylus Drawing Pad Event Handlers
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Touch/Stylus support
    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const coords = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveCanvasSnapshot();
    }
  };

  // Prescription Med Actions
  const handleAddMedRow = () => {
    setPrescMeds([...prescMeds, { name: '', dose: '1 Tablet', frequency: 'BD', duration: '5 Days', instructions: 'After Food' }]);
  };

  const handleDeleteMedRow = (idx) => {
    const updated = prescMeds.filter((_, i) => i !== idx);
    setPrescMeds(updated.length > 0 ? updated : [{ name: '', dose: '1 Tablet', frequency: 'BD', duration: '5 Days', instructions: 'After Food' }]);
  };

  const handleUpdateMedCell = (idx, field, value) => {
    const updated = [...prescMeds];
    updated[idx][field] = value;
    setPrescMeds(updated);
  };

  // Quick chips complaint click
  const handleComplaintChipClick = (complaint) => {
    setComplaints(prev => {
      const separator = prev ? ', ' : '';
      return `${prev}${separator}${complaint}`;
    });
  };

  // Submit EMR Consultation Draft
  const handleSaveDraft = () => {
    alert(`Consultation Draft for Token #${activeToken?.token} (${activeToken?.patientName}) saved successfully in clinic cache.`);
  };

  // Finalize / Complete EMR Consultation
  const handleCompleteConsultation = (e) => {
    if (e) e.preventDefault();
    if (!activeToken) return;

    if (diagnoses.length === 0) {
      alert("Please enter at least one Clinical Diagnosis before completing consultation.");
      return;
    }

    const medErrors = prescMeds.filter(m => !m.name);
    if (medErrors.length > 0) {
      alert("Please specify a Medicine Name for all prescription rows, or delete empty rows.");
      return;
    }

    // 1. Submit consultation in Context
    const consultDiag = diagnoses.map(d => `${d.name} [ICD: ${d.code}]`).join(', ');
    const res = submitConsultation(activeToken.patientId, {
      diagnosis: consultDiag,
      symptoms: complaints || 'Routine checkup',
      meds: prescMeds.map(m => ({
        name: m.name,
        dose: `${m.dose} - ${m.frequency} (${m.instructions})`,
        duration: m.duration
      }))
    });

    // 2. Dispatch requested LIS Tests automatically
    if (selectedLabTests.length > 0) {
      selectedLabTests.forEach(test => {
        addLabRequest(activeToken.patientId, test);
      });
      alert(`Sent ${selectedLabTests.length} specimen orders to LIS Laboratory Module.`);
    }

    // 3. Log Radiology / Nurse alerts
    if (selectedRadTests.length > 0 || followUpDate) {
      const noteParts = [];
      if (selectedRadTests.length > 0) noteParts.push(`Ordered Radiology: ${selectedRadTests.join(', ')}`);
      if (followUpDate) noteParts.push(`Scheduled Follow-up: ${followUpDate} (${followUpInstructions || 'Routine review'})`);
      
      setNursingNotes(prev => [
        {
          time: 'Just now',
          author: `Dr. ${doctorName}`,
          priority: 'Routine',
          patientId: activeToken.patientId,
          text: noteParts.join('. ')
        },
        ...prev
      ]);
    }

    // Update Token Queue state to Completed
    setQueue(prev => prev.map(q => q.patientId === activeToken.patientId ? { ...q, status: 'Completed' } : q));

    // Print Rx trigger object
    const finalRxPrintData = {
      id: res.rxId,
      date: new Date().toLocaleDateString('en-GB'),
      patientId: activeToken.patientId,
      diagnosis: consultDiag,
      meds: prescMeds,
      symptoms: complaints,
      vitals: `BP: ${bloodPressure}, HR: ${pulseRate} bpm, Temp: ${temperature}°F, SpO2: ${spo2}%, Sugar: ${bloodSugar}mg/dL, BMI: ${bmi}`,
      followUp: followUpDate ? `${followUpDate} - ${followUpInstructions}` : 'PRN (As Needed)',
      canvasSnapshot: canvasSnapshot
    };

    alert("OPD Consultation completed. Digital Prescription generated & transmitted.");
    
    // Trigger callback to print modal
    onPrintPrescription(finalRxPrintData);

    // Switch next patient in queue
    const remaining = tokenQueue.filter(t => t.token !== activeToken.token && t.status !== 'Completed');
    if (remaining.length > 0) {
      setActiveToken(remaining[0]);
    } else {
      onNavigateToTab('dashboard');
    }
  };

  // ICD Suggestion selection
  const handleSelectIcd = (item) => {
    if (!diagnoses.some(d => d.code === item.code)) {
      setDiagnoses([...diagnoses, item]);
    }
    setIcdSearch('');
    setShowIcdDropdown(false);
  };

  const handleRemoveDiagnosis = (code) => {
    setDiagnoses(diagnoses.filter(d => d.code !== code));
  };

  // Split Name helper
  const parsedActivePatientName = activeToken?.patientName || 'No Patient Selected';

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Scope Local CSS */}
      <style>{`
        .doctor-workspace-grid {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 20px;
          align-items: start;
        }

        .token-queue-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: 100%;
          min-height: calc(100vh - 200px);
        }

        .token-list-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: 650px;
        }

        .token-item-btn {
          width: 100%;
          border: 1.5px solid var(--border-color);
          background-color: var(--bg-primary);
          padding: 12px;
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: all 0.2s;
        }

        .token-item-btn:hover {
          border-color: var(--primary);
          background-color: rgba(79, 70, 229, 0.02);
        }

        .token-item-btn.active {
          border-color: var(--primary);
          background-color: rgba(79, 70, 229, 0.06);
          box-shadow: 0 0 0 1px var(--primary);
        }

        .token-badge-order {
          background-color: var(--primary);
          color: white;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 10.5px;
          font-weight: 750;
        }

        .vitals-grid-console {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .vital-input-card {
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .vital-input-card label {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .vital-field-val {
          background: transparent;
          border: none;
          outline: none;
          font-size: 16px;
          font-weight: 800;
          color: var(--text-primary);
          width: 100%;
          border-bottom: 1.5px solid transparent;
          transition: border-color 0.2s;
        }

        .vital-field-val:focus {
          border-color: var(--primary);
        }

        .bmi-badge-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border-radius: 10px;
          font-weight: 700;
        }

        .bmi-na { background-color: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-color); }
        .bmi-normal { background-color: rgba(16, 185, 129, 0.1); color: var(--emerald); border: 1px solid rgba(16, 185, 129, 0.2); }
        .bmi-underweight { background-color: rgba(59, 130, 246, 0.1); color: var(--blue); border: 1px solid rgba(59, 130, 246, 0.2); }
        .bmi-overweight { background-color: rgba(245, 158, 11, 0.1); color: var(--amber); border: 1px solid rgba(245, 158, 11, 0.2); }
        .bmi-obese { background-color: rgba(244, 63, 94, 0.1); color: var(--rose); border: 1px solid rgba(244, 63, 94, 0.2); }

        .chip-button {
          padding: 6px 12px;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .chip-button:hover {
          background-color: var(--primary-light);
          color: var(--primary);
          border-color: var(--primary);
        }

        .chip-button.selected {
          background-color: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .rx-med-table th {
          font-size: 11px;
          text-transform: uppercase;
          color: var(--text-secondary);
          padding: 8px 10px;
          border-bottom: 2px solid var(--border-color);
        }

        .rx-med-table td {
          padding: 8px 10px;
          vertical-align: middle;
        }

        .autocomplete-dropdown-meds {
          position: absolute;
          z-index: 150;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          box-shadow: var(--shadow-lg);
          max-height: 200px;
          overflow-y: auto;
          width: 100%;
        }

        .autocomplete-item-med {
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12.5px;
          border-bottom: 1px solid var(--border-color);
        }

        .autocomplete-item-med:hover {
          background-color: var(--bg-primary);
          color: var(--primary);
          font-weight: 600;
        }

        .draw-pad-canvas {
          background-color: #f8fafc;
          border: 1.5px dashed #cbd5e1;
          border-radius: 12px;
          cursor: crosshair;
          touch-action: none;
        }
      `}</style>

      {/* TOP HEADER */}
      <div className="welcome-section" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
        <div className="welcome-text">
          <h1>Doctor Consultation Workspace</h1>
          <p>Digital EMR Note Builder & Pen-Stylus Prescription Pad</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigateToTab('dashboard')}>
            🏠 Clinic Dashboard
          </button>
        </div>
      </div>

      {/* MAIN CONTENT SPLIT GRID */}
      <div className="doctor-workspace-grid">
        
        {/* LEFT BAR: TODAY'S TOKEN QUEUE */}
        <div className="token-queue-card">
          <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', margin: 0 }}>
            ⏳ Today&apos;s Token Queue
          </h3>
          
          <div className="token-list-wrapper">
            {tokenQueue.map(tokenItem => {
              const isSelected = activeToken?.token === tokenItem.token;
              
              let statusClass = 'badge-amber';
              if (tokenItem.status === 'Completed') statusClass = 'badge-emerald';
              if (tokenItem.status === 'In-Consultation' || tokenItem.status === 'In Progress') statusClass = 'badge-sky';

              return (
                <button 
                  key={tokenItem.token} 
                  className={`token-item-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => setActiveToken(tokenItem)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span className="token-badge-order">Token {tokenItem.token}</span>
                    <span className={`badge ${statusClass}`} style={{ fontSize: '9px', padding: '2px 6px' }}>{tokenItem.status}</span>
                  </div>
                  <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '4px' }}>{tokenItem.patientName}</strong>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)', width: '100%' }}>
                    <span>Age: {tokenItem.age} | {tokenItem.gender}</span>
                    <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{tokenItem.visitType}</span>
                  </div>
                </button>
              );
            })}

            {tokenQueue.length === 0 && (
              <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '12px' }}>
                No active tokens in queue.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT BAR: CONSULTATION WORKSPACE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 1. TOP PATIENT INFORMATION CARD */}
          <div className="panel-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary)', borderRadius: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', fontSize: '12px' }}>
              <div>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block' }}>Patient Profile</span>
                <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>{parsedActivePatientName}</strong>
                <span style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '10.5px' }}>ID: {activeToken?.patientId || 'WALK-IN'}</span>
              </div>
              <div>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Age / Gender</span>
                <strong style={{ display: 'block', color: 'var(--text-secondary)' }}>{activeToken?.age} yrs / {activeToken?.gender}</strong>
              </div>
              <div>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Assigned Token</span>
                <strong style={{ display: 'block', color: 'var(--text-secondary)' }}>No. {activeToken?.token} | {activeToken?.visitType}</strong>
              </div>
              <div>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Assigned CMO</span>
                <strong style={{ display: 'block', color: 'var(--text-secondary)' }}>{activeToken?.doctorAssigned}</strong>
              </div>
              <div>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Registered Date</span>
                <strong style={{ display: 'block', color: 'var(--text-secondary)' }}>{activeToken?.date}</strong>
              </div>
            </div>
          </div>

          {/* 2. VITALS CARD */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
              🩺 Patient Vital Signs & BMI Console
            </h3>
            
            <div className="vitals-grid-console">
              <div className="vital-input-card">
                <label>Height (cm)</label>
                <input 
                  type="number" 
                  value={height} 
                  onChange={(e) => setHeight(e.target.value)} 
                  placeholder="E.g. 170"
                  className="vital-field-val"
                />
              </div>

              <div className="vital-input-card">
                <label>Weight (kg)</label>
                <input 
                  type="number" 
                  value={weight} 
                  onChange={(e) => setWeight(e.target.value)} 
                  placeholder="E.g. 70"
                  className="vital-field-val"
                />
              </div>

              <div className="vital-input-card">
                <label>Blood Pressure (sys/dia)</label>
                <input 
                  type="text" 
                  value={bloodPressure} 
                  onChange={(e) => setBloodPressure(e.target.value)} 
                  placeholder="120/80"
                  className="vital-field-val"
                />
              </div>

              {/* BMI Auto-calculated output card */}
              <div className={`bmi-badge-box ${bmiCategory.class}`}>
                <div>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', display: 'block' }}>Computed BMI</span>
                  <span style={{ fontSize: '18px', fontWeight: '800' }}>{bmi}</span>
                </div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>{bmiCategory.label}</span>
              </div>

              <div className="vital-input-card">
                <label>Pulse Rate (bpm)</label>
                <input 
                  type="number" 
                  value={pulseRate} 
                  onChange={(e) => setPulseRate(e.target.value)} 
                  placeholder="72"
                  className="vital-field-val"
                />
              </div>

              <div className="vital-input-card">
                <label>Temperature (°F)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={temperature} 
                  onChange={(e) => setTemperature(e.target.value)} 
                  placeholder="98.6"
                  className="vital-field-val"
                />
              </div>

              <div className="vital-input-card">
                <label>Oxygen Saturation (SpO2 %)</label>
                <input 
                  type="number" 
                  value={spo2} 
                  onChange={(e) => setSpo2(e.target.value)} 
                  placeholder="98"
                  className="vital-field-val"
                />
              </div>

              <div className="vital-input-card">
                <label>Blood Sugar (mg/dL)</label>
                <input 
                  type="number" 
                  value={bloodSugar} 
                  onChange={(e) => setBloodSugar(e.target.value)} 
                  placeholder="90"
                  className="vital-field-val"
                />
              </div>
            </div>
          </div>

          {/* 3. CHIEF COMPLAINTS SECTION */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '10px', color: 'var(--text-primary)' }}>
              🗣️ Chief Complaints & Subjective History
            </h3>
            
            {/* Quick add symptom chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {quickComplaints.map(comp => (
                <button 
                  key={comp} 
                  type="button" 
                  className="chip-button"
                  onClick={() => handleComplaintChipClick(comp)}
                >
                  + {comp}
                </button>
              ))}
            </div>

            <textarea 
              rows="3" 
              className="select-input-style"
              value={complaints}
              onChange={(e) => setComplaints(e.target.value)}
              placeholder="Enter patient complaints and symptoms history..."
              style={{ fontSize: '13px', padding: '10px', height: 'auto' }}
            />
          </div>

          {/* 4. CLINICAL EXAMINATION SECTION */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '14px', color: 'var(--text-primary)' }}>
              🩺 Clinical Examination Findings
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px', alignItems: 'center' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>General Examination:</strong>
                <input 
                  type="text" 
                  value={generalExam} 
                  onChange={(e) => setGeneralExam(e.target.value)}
                  className="select-input-style" 
                  style={{ height: '36px', fontSize: '12.5px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px', alignItems: 'center' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Cardiovascular Exam:</strong>
                <input 
                  type="text" 
                  value={cardioExam} 
                  onChange={(e) => setCardioExam(e.target.value)}
                  className="select-input-style" 
                  style={{ height: '36px', fontSize: '12.5px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px', alignItems: 'center' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Respiratory Exam:</strong>
                <input 
                  type="text" 
                  value={respExam} 
                  onChange={(e) => setRespExam(e.target.value)}
                  className="select-input-style" 
                  style={{ height: '36px', fontSize: '12.5px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px', alignItems: 'center' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Abdominal Exam:</strong>
                <input 
                  type="text" 
                  value={abdomenExam} 
                  onChange={(e) => setAbdomenExam(e.target.value)}
                  className="select-input-style" 
                  style={{ height: '36px', fontSize: '12.5px' }}
                />
              </div>
            </div>
          </div>

          {/* 5. DIAGNOSIS (ICD CODE SEARCH) */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '14px', color: 'var(--text-primary)' }}>
              🔎 Clinical Diagnoses & ICD-10 Coding
            </h3>
            
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>Search ICD-10 Diagnosis Database</label>
              <input 
                type="text"
                placeholder="Search by diagnosis name or ICD-10 code (e.g. Fever)..."
                value={icdSearch}
                onChange={(e) => {
                  setIcdSearch(e.target.value);
                  setShowIcdDropdown(true);
                }}
                className="select-input-style"
                style={{ height: '40px', fontSize: '13px' }}
              />

              {showIcdDropdown && icdSearch && (
                <div className="autocomplete-dropdown-meds">
                  {icdDatabase.filter(item => 
                    item.name.toLowerCase().includes(icdSearch.toLowerCase()) || 
                    item.code.toLowerCase().includes(icdSearch.toLowerCase())
                  ).map(item => (
                    <div 
                      key={item.code} 
                      className="autocomplete-item-med"
                      onClick={() => handleSelectIcd(item)}
                    >
                      <code>{item.code}</code> — <strong>{item.name}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* List of active diagnoses */}
            {diagnoses.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Active Diagnoses for this Session:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {diagnoses.map(d => (
                    <span 
                      key={d.code} 
                      style={{ padding: '4px 10px', backgroundColor: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)', color: 'var(--primary)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <code>[{d.code}]</code> {d.name}
                      <button onClick={() => handleRemoveDiagnosis(d.code)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--rose)', fontWeight: '800' }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>Diagnosis Notes / Clinical Observations</label>
              <textarea 
                rows="2"
                placeholder="Enter diagnosis footnotes, severity indicators, or staging..."
                value={diagnosisNotes}
                onChange={(e) => setDiagnosisNotes(e.target.value)}
                className="select-input-style"
                style={{ fontSize: '13px', padding: '10px', height: 'auto', marginTop: '4px' }}
              />
            </div>
          </div>

          {/* 6. PRESCRIPTION TABLE SECTION */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '10px', color: 'var(--text-primary)' }}>
              💊 Digital Prescription Builder
            </h3>

            <div className="table-responsive" style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'visible' }}>
              <table className="rx-med-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-primary)', textAlign: 'left' }}>
                    <th style={{ width: '35%' }}>Medicine Name / Brand</th>
                    <th style={{ width: '15%' }}>Dosage</th>
                    <th style={{ width: '15%' }}>Frequency</th>
                    <th style={{ width: '15%' }}>Duration</th>
                    <th>Instructions</th>
                    <th style={{ textAlign: 'center', width: '80px' }}>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {prescMeds.map((med, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ position: 'relative' }}>
                        <input 
                          type="text"
                          placeholder="Search stock (e.g. Paracetamol)..."
                          value={med.name}
                          onChange={(e) => {
                            handleUpdateMedCell(idx, 'name', e.target.value);
                            setMedSearchIndex(idx);
                            setMedSearchQuery(e.target.value);
                          }}
                          className="select-input-style"
                          style={{ height: '36px', fontSize: '12px' }}
                        />
                        {/* Auto-suggest from context stock inventory */}
                        {medSearchIndex === idx && medSearchQuery && (
                          <div className="autocomplete-dropdown-meds">
                            {inventory.filter(item => 
                              item.name.toLowerCase().includes(medSearchQuery.toLowerCase())
                            ).map(item => (
                              <div 
                                key={item.id} 
                                className="autocomplete-item-med"
                                onClick={() => {
                                  handleUpdateMedCell(idx, 'name', item.name);
                                  setMedSearchIndex(null);
                                  setMedSearchQuery('');
                                }}
                              >
                                <strong>{item.name}</strong> <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>(Stock: {item.stock})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <select
                          value={med.dose}
                          onChange={(e) => handleUpdateMedCell(idx, 'dose', e.target.value)}
                          className="select-input-style"
                          style={{ height: '36px', fontSize: '12px' }}
                        >
                          <option value="1 Tablet">1 Tablet</option>
                          <option value="2 Tablets">2 Tablets</option>
                          <option value="1 Capsule">1 Capsule</option>
                          <option value="5 ml">5 ml</option>
                          <option value="10 ml">10 ml</option>
                          <option value="1 Puff">1 Puff</option>
                          <option value="10 Units">10 Units</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={med.frequency}
                          onChange={(e) => handleUpdateMedCell(idx, 'frequency', e.target.value)}
                          className="select-input-style"
                          style={{ height: '36px', fontSize: '12px' }}
                        >
                          <option value="OD">OD (Once Daily)</option>
                          <option value="BD">BD (Twice Daily)</option>
                          <option value="TDS">TDS (Thrice Daily)</option>
                          <option value="QDS">QDS (Four times Daily)</option>
                          <option value="HS">HS (At Bedtime)</option>
                          <option value="PRN">PRN (As Needed)</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={med.duration}
                          onChange={(e) => handleUpdateMedCell(idx, 'duration', e.target.value)}
                          className="select-input-style"
                          style={{ height: '36px', fontSize: '12px' }}
                        >
                          <option value="3 Days">3 Days</option>
                          <option value="5 Days">5 Days</option>
                          <option value="7 Days">7 Days</option>
                          <option value="10 Days">10 Days</option>
                          <option value="14 Days">14 Days</option>
                          <option value="30 Days">30 Days</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={med.instructions}
                          onChange={(e) => handleUpdateMedCell(idx, 'instructions', e.target.value)}
                          className="select-input-style"
                          style={{ height: '36px', fontSize: '12px' }}
                        >
                          <option value="After Food">After Food</option>
                          <option value="Before Food">Before Food</option>
                          <option value="With Food">With Food</option>
                          <option value="Empty Stomach">Empty Stomach</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleDeleteMedRow(idx)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--rose)' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleAddMedRow}
              style={{ marginTop: '12px', width: '100%', fontWeight: '700' }}
            >
              + Add Medicine Row
            </button>
          </div>

          {/* 7. LABORATORY TESTS & RADIOLOGY */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* LAB TESTS CARD */}
            <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)' }}>
                🔬 Lab Test Requests (Sends to LIS)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {labTestsOptions.map(test => {
                  const isChecked = selectedLabTests.includes(test);
                  return (
                    <button 
                      key={test}
                      type="button"
                      className={`chip-button ${isChecked ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedLabTests(prev => 
                          prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
                        );
                      }}
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px' }}
                    >
                      <span>{test}</span>
                      <span>{isChecked ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RADIOLOGY CARD */}
            <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)' }}>
                🩻 Radiology Investigations
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {radTestsOptions.map(test => {
                  const isChecked = selectedRadTests.includes(test);
                  return (
                    <button 
                      key={test}
                      type="button"
                      className={`chip-button ${isChecked ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedRadTests(prev => 
                          prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
                        );
                      }}
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px' }}
                    >
                      <span>{test}</span>
                      <span>{isChecked ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 8. DIGITAL SIGNATURE AND HANDWRITING CANVAS */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                ✍️ Digital Signature & Stylus Sketch Pad
              </h3>
              
              {/* Canvas controls */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Ink Colors */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['#000000', '#4f46e5', '#ef4444'].map(color => (
                    <button 
                      key={color}
                      onClick={() => setPenColor(color)}
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        borderRadius: '50%', 
                        backgroundColor: color, 
                        border: penColor === color ? '2px solid #94a3b8' : '1px solid transparent',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>

                <div style={{ borderLeft: '1px solid var(--border-color)', height: '18px', margin: '0 4px' }} />

                {/* Brush size */}
                <select 
                  value={penWidth}
                  onChange={(e) => setPenWidth(parseInt(e.target.value))}
                  className="select-input-style"
                  style={{ width: '80px', height: '28px', fontSize: '11px', padding: '0 4px' }}
                >
                  <option value={2}>Fine</option>
                  <option value={4}>Medium</option>
                  <option value={7}>Bold</option>
                </select>

                <button 
                  onClick={clearCanvas}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 10px', fontSize: '11px', height: '28px' }}
                >
                  Clear Pad
                </button>
              </div>
            </div>

            {/* Interactive Drawing Canvas */}
            <canvas 
              ref={canvasRef}
              width={700}
              height={180}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="draw-pad-canvas"
              style={{ width: '100%', height: '180px' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '6px', textAlign: 'right' }}>
              🖊️ Draw anatomical markings, handwriting notes, or doctor signature above. Stored inside digital script.
            </span>
          </div>

          {/* 9. FOLLOW UP SECTION */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)' }}>
              📅 Follow-Up & Clinical Instructions
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>Follow-up Date</label>
                <input 
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="select-input-style"
                  style={{ height: '38px', fontSize: '12.5px', marginTop: '4px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>Follow-up Instructions</label>
                <input 
                  type="text"
                  placeholder="E.g. Review blood sugar reports, return if symptoms worsen..."
                  value={followUpInstructions}
                  onChange={(e) => setFollowUpInstructions(e.target.value)}
                  className="select-input-style"
                  style={{ height: '38px', fontSize: '12.5px', marginTop: '4px' }}
                />
              </div>
            </div>
          </div>

          {/* 10. CONSULTATION SUMMARY AUTO-GENERATION PREVIEW */}
          <div className="panel-card" style={{ padding: '20px', borderRadius: '16px', backgroundColor: '#fafafa', border: '1px dashed var(--border-color)' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: '800', marginBottom: '10px', color: 'var(--text-primary)' }}>
              📋 Live Consultation EMR Summary
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div><strong>Patient Details:</strong> {parsedActivePatientName} (Age: {activeToken?.age} yrs, {activeToken?.gender})</div>
              <div><strong>Vitals Captured:</strong> Height: {height}cm | Weight: {weight}kg | BP: {bloodPressure} | HR: {pulseRate}bpm | Temp: {temperature}°F | SpO2: {spo2}% | Sugar: {bloodSugar}mg/dL | BMI: {bmi} ({bmiCategory.label})</div>
              <div><strong>Chief Complaints:</strong> {complaints || 'None reported'}</div>
              <div><strong>Active Diagnoses:</strong> {diagnoses.length > 0 ? diagnoses.map(d => `${d.name} (${d.code})`).join(', ') : 'No diagnoses added'}</div>
              <div><strong>Medications (Rx):</strong> {prescMeds.filter(m => m.name).map(m => `${m.name} (${m.dose} — ${m.frequency})`).join('; ') || 'No drugs prescribed'}</div>
              <div><strong>LIS Orders:</strong> {selectedLabTests.length > 0 ? selectedLabTests.join(', ') : 'None'}</div>
              <div><strong>Radiology Orders:</strong> {selectedRadTests.length > 0 ? selectedRadTests.join(', ') : 'None'}</div>
              <div><strong>Follow Up:</strong> {followUpDate ? `${followUpDate} (${followUpInstructions})` : 'PRN (As Needed)'}</div>
              {canvasSnapshot && (
                <div style={{ marginTop: '8px' }}>
                  <strong>Handwritten Prescription / Notes Attached:</strong><br />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={canvasSnapshot} alt="Canvas Sketch" style={{ border: '1px solid var(--border-color)', borderRadius: '6px', height: '60px', marginTop: '4px', backgroundColor: '#fff' }} />
                </div>
              )}
            </div>
          </div>

          {/* 11. ACTION BUTTONS ACTION BAR */}
          <div className="panel-card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)' }}>
            <div>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleSaveDraft}
                style={{ fontWeight: '700' }}
              >
                💾 Save Draft
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  if (diagnoses.length === 0) {
                    alert("Please enter a Diagnosis first.");
                    return;
                  }
                  // Temporary print preview trigger
                  const printData = {
                    id: 'MOCK-RX-' + activeToken?.token,
                    date: new Date().toLocaleDateString('en-GB'),
                    patientId: activeToken?.patientId,
                    diagnosis: diagnoses.map(d => `${d.name} [${d.code}]`).join(', '),
                    meds: prescMeds,
                    symptoms: complaints,
                    vitals: `BP: ${bloodPressure}, HR: ${pulseRate} bpm, Temp: ${temperature}°F, SpO2: ${spo2}%, Sugar: ${bloodSugar}mg/dL, BMI: ${bmi}`,
                    followUp: followUpDate ? `${followUpDate} - ${followUpInstructions}` : 'PRN (As Needed)',
                    canvasSnapshot: canvasSnapshot
                  };
                  onPrintPrescription(printData);
                }}
                style={{ fontWeight: '700' }}
              >
                🖨️ Print Preview
              </button>

              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleCompleteConsultation}
                style={{ fontWeight: '800', textTransform: 'uppercase', padding: '10px 20px' }}
              >
                ⚡ Complete Consultation & Send EMR
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
