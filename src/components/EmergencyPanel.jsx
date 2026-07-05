"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function EmergencyPanel() {
  const { currency } = useClinic();
  const [cases, setCases] = useState([]);
  const [beds, setBeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Rapid Registration / Emergency Entry Form
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
    gender: 'Male',
    triageLevel: 'Urgent',
    chiefComplaint: '',
    bedId: '',
    notes: '',
    doctorName: ''
  });

  const triageLevels = ['Critical', 'Urgent', 'Non-Urgent'];

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch emergency cases
      const caseRes = await fetch('/api/patients?limit=100'); // query patients
      // Fetch available emergency beds
      const bedRes = await fetch('/api/beds');
      
      if (caseRes.ok && bedRes.ok) {
        const patientsData = await caseRes.json();
        const bedsData = await bedRes.json();
        
        // Filter patients who are registered in Emergency or Waiting status
        const emergencyPatients = (patientsData.patients || []).filter(
          p => p.patient_type === 'Emergency' || p.visit_status === 'Admitted' && p.patient_type === 'IPD'
        );
        setCases(emergencyPatients);

        // Filter beds of type Emergency or ICU
        const emergencyBeds = (bedsData.beds || []).filter(
          b => b.bed_type === 'Emergency' || b.bed_type === 'ICU'
        );
        setBeds(emergencyBeds);
      }
    } catch (err) {
      console.error('Failed to load emergency data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.chiefComplaint) {
      alert('Patient Name and Chief Complaint are required.');
      return;
    }

    try {
      // 1. Rapidly register patient
      const regRes = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone || '9999999999',
          age: formData.age || '30',
          gender: formData.gender,
          allergies: 'None',
          doctorName: formData.doctorName || 'Dr. Anil Sharma',
          visitStatus: 'Admitted',
          patientType: 'Emergency'
        })
      });

      if (regRes.ok) {
        const regData = await regRes.json();
        const patientId = regData.patient.id;

        // 2. Allocate emergency bed
        if (formData.bedId) {
          await fetch('/api/inpatients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientId,
              bedId: formData.bedId,
              diagnosis: formData.chiefComplaint,
              doctorName: formData.doctorName || 'Dr. Anil Sharma',
              vitals: 'Heart Rate: Stable',
              notes: `Triage Level: ${formData.triageLevel}. ${formData.notes}`
            })
          });
        }

        alert('Emergency Rapid Registration complete! Patient admitted and bed allocated.');
        setShowAddForm(false);
        setFormData({
          name: '', phone: '', age: '', gender: 'Male', triageLevel: 'Urgent', chiefComplaint: '', bedId: '', notes: '', doctorName: ''
        });
        fetchData();
      } else {
        alert('Rapid Registration failed.');
      }
    } catch (err) {
      console.error('Emergency submission failed', err);
    }
  };

  const getTriageBadge = (level) => {
    switch (level) {
      case 'Critical': return 'badge-rose';
      case 'Urgent': return 'badge-amber';
      case 'Non-Urgent': default: return 'badge-sky';
    }
  };

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Action Header */}
      <div className="welcome-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="welcome-text">
          <h1>🚨 Emergency Triage Command Center</h1>
          <p>Rapid admissions workflow, triage prioritizing, and critical care bed allocations.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ padding: '8px 16px', fontWeight: '700', backgroundColor: 'var(--rose)', borderColor: 'var(--rose)' }}
        >
          {showAddForm ? 'View Active Triage' : '＋ Rapid Admission Triage'}
        </button>
      </div>

      {showAddForm ? (
        /* Rapid Register Form */
        <div className="panel-card" style={{ padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '20px', color: 'var(--text-primary)' }}>
            ⚠️ Rapid Admission / Triage Entry Form
          </h3>
          <form onSubmit={handleFormSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Patient Full Name *</label>
              <input type="text" name="name" value={formData.name} onChange={handleFormChange} className="form-control" placeholder="e.g. Jane Doe" required />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Age</label>
              <input type="number" name="age" value={formData.age} onChange={handleFormChange} className="form-control" placeholder="e.g. 35" />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Gender</label>
              <select name="gender" value={formData.gender} onChange={handleFormChange} className="form-control">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Triage Urgency Level</label>
              <select name="triageLevel" value={formData.triageLevel} onChange={handleFormChange} className="form-control">
                {triageLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Emergency Bed Allocation</label>
              <select name="bedId" value={formData.bedId} onChange={handleFormChange} className="form-control">
                <option value="">-- Select Available Bed --</option>
                {beds.filter(b => b.status === 'Available').map(b => (
                  <option key={b.id} value={b.id}>{b.ward} - Bed {b.bed_number} ({b.bed_type})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Contact Phone</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleFormChange} className="form-control" placeholder="Triage relative phone" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Chief Complaint / Trauma Entry *</label>
              <input type="text" name="chiefComplaint" value={formData.chiefComplaint} onChange={handleFormChange} className="form-control" placeholder="e.g. Acute chest pain, minor bruising, head laceration" required />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>On-duty Physician</label>
              <input type="text" name="doctorName" value={formData.doctorName} onChange={handleFormChange} className="form-control" placeholder="Dr. Vikram Patel" />
            </div>
            <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ backgroundColor: 'var(--rose)', borderColor: 'var(--rose)' }}>Admit Triage Case</button>
            </div>
          </form>
        </div>
      ) : (
        /* Active Emergency Cases List */
        <div className="panel-card" style={{ padding: '0px', borderRadius: '16px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Querying Active Emergency Cases...</div>
          ) : cases.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No active emergency triage records. Triage is fully clear.</div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Patient Details</th>
                    <th>Triage Priority</th>
                    <th>Bed / ICU Ward</th>
                    <th>Arrived Time</th>
                    <th>Chief Complaint</th>
                    <th>Assigned Doctor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{c.age} Y / {c.gender} | ID: {c.id}</div>
                      </td>
                      <td>
                        <span className={`badge ${getTriageBadge(c.patient_type === 'Emergency' ? 'Urgent' : 'Critical')}`}>
                          {c.patient_type === 'Emergency' ? 'Urgent' : 'Critical'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: '750' }}>{c.visit_status === 'Admitted' ? 'Admitted (ICU / Emergency)' : 'Triage Waiting'}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{c.visit_time || '--'}</td>
                      <td><em style={{ color: 'var(--rose)' }}>{c.last_consultation || 'Emergency Trauma Assessment'}</em></td>
                      <td style={{ color: 'var(--text-secondary)' }}>Dr. Anil Sharma</td>
                      <td><span className="badge badge-sky">{c.visit_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
