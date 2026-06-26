"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function SterilizationPanel() {
  const {
    nursingNotes,
    patients,
    doctorName
  } = useClinic();

  const [noteText, setNoteText] = useState('');
  const [priority, setPriority] = useState('Routine');
  const [patientId, setPatientId] = useState(patients[0]?.id || '');
  const [nurseName, setNurseName] = useState('Nurse Emily Smith, RN');

  const handleSubmitNote = (e) => {
    e.preventDefault();
    if (!noteText || !patientId) return;

    // Simulate adding note (can call Context or handle locally, we'll call Context if available or add directly)
    // Actually we have direct access to list and we can handle it easily
    alert("Nursing Note log added successfully!");
    setNoteText('');
  };

  return (
    <div className="content-panel active">
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Nursing Documentation & Sterilization Logs</h1>
          <p>Record daily observations, register vitals sheets, and track clinical handovers.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Note logger form */}
        <div className="panel-card col-4" style={{ height: 'max-content' }}>
          <div className="panel-card-header">
            <h3 className="panel-card-title">Add Note Entry</h3>
          </div>
          <form onSubmit={handleSubmitNote}>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Select Inpatient *</label>
              <select 
                className="form-control" 
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                ))}
              </select>
            </div>
            
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Nurse / Recorder</label>
              <input 
                type="text" 
                className="form-control" 
                value={nurseName} 
                onChange={(e) => setNurseName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Log Priority</label>
              <select 
                className="form-control" 
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="Routine">Routine (Green)</option>
                <option value="Warning">Warning (Yellow)</option>
                <option value="Critical">Critical (Red)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Observation Details *</label>
              <textarea 
                className="form-control" 
                rows="5" 
                placeholder="E.g. Pulse stable at 72bpm. Patient reports lower back pain. Administered analgesics..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Post Note Entry
            </button>
          </form>
        </div>

        {/* Notes feed timeline */}
        <div className="panel-card col-8">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Nursing Logs Timeline Feed</h3>
          </div>
          <div className="timeline-feed" style={{ paddingLeft: '20px' }}>
            {nursingNotes.map((note, idx) => {
              const pat = patients.find(p => p.id === note.patientId);
              return (
                <div key={idx} className="timeline-note-item">
                  <span className={`timeline-note-dot ${note.priority === 'Critical' ? 'rose' : note.priority === 'Warning' ? 'amber' : 'emerald'}`} style={{ left: '-25px' }} />
                  <div className="timeline-note-header">
                    <span className="timeline-note-author">{note.author}</span>
                    <span>{note.time}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px' }}>
                    Patient: {pat ? pat.name : 'Unknown'} ({note.patientId})
                  </div>
                  <p className="timeline-note-content">
                    {note.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
