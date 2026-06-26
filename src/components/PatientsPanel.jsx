"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function PatientsPanel({ onOpenPatientProfile, editPatientTarget, setEditPatientTarget }) {
  const {
    patients,
    registerPatient,
    updatePatient,
    deletePatient
  } = useClinic();

  const [search, setSearch] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterBlood, setFilterBlood] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
    gender: '',
    email: '',
    blood: 'O+',
    allergies: '',
    address: '',
    emergencyContact: ''
  });

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.age || !formData.gender) {
      alert("Please fill in all required fields.");
      return;
    }
    const res = registerPatient(formData);
    alert(`Registered successfully!\nPatient ID: ${res.patientId}\nOPD Token Number: ${res.token}`);
    
    // Clear form
    setFormData({
      name: '',
      phone: '',
      age: '',
      gender: '',
      email: '',
      blood: 'O+',
      allergies: '',
      address: '',
      emergencyContact: ''
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editPatientTarget) return;
    updatePatient(editPatientTarget.id, editPatientTarget);
    alert(`Patient ${editPatientTarget.name} profile updated successfully.`);
    setEditPatientTarget(null);
  };

  // Filter logic
  const filtered = patients.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                          p.id.toLowerCase().includes(search.toLowerCase()) ||
                          p.phone.includes(search);
    const matchesGender = filterGender ? p.gender === filterGender : true;
    const matchesBlood = filterBlood ? p.blood === filterBlood : true;
    return matchesSearch && matchesGender && matchesBlood;
  });

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="content-panel active">
      {/* Welcome banner */}
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Patient Registration Portal</h1>
          <p>Register new members, edit demographic profiles, and search active directories.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* COLUMN 1: PATIENTS LIST DIRECTORY */}
        <div className="panel-card col-8">
          <div className="panel-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h3 className="panel-card-title">Patient Directory ({filtered.length})</h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search name, ID or phone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                style={{ width: '220px', padding: '6px 12px' }}
              />
              <select
                className="form-control"
                value={filterGender}
                onChange={(e) => { setFilterGender(e.target.value); setCurrentPage(1); }}
                style={{ width: '130px', padding: '6px 12px' }}
              >
                <option value="">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <select
                className="form-control"
                value={filterBlood}
                onChange={(e) => { setFilterBlood(e.target.value); setCurrentPage(1); }}
                style={{ width: '130px', padding: '6px 12px' }}
              >
                <option value="">All Bloods</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>Age/Gender</th>
                  <th>Phone</th>
                  <th>Blood Group</th>
                  <th>Allergies</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length > 0 ? (
                  paginatedItems.map(p => (
                    <tr key={p.id} onClick={() => onOpenPatientProfile(p.id)}>
                      <td><strong style={{ color: 'var(--primary)' }}>{p.id}</strong></td>
                      <td>
                        <div className="patient-cell">
                          <div className="patient-avatar">{p.name.split(' ').map(n => n[0]).join('')}</div>
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.name}</span>
                        </div>
                      </td>
                      <td>{p.age} / {p.gender}</td>
                      <td>{p.phone}</td>
                      <td>
                        <span className="badge badge-sky" style={{ padding: '2px 8px' }}>{p.blood}</span>
                      </td>
                      <td style={{ color: p.allergies !== 'None' ? 'var(--rose)' : 'inherit', fontWeight: p.allergies !== 'None' ? '600' : 'normal' }}>
                        {p.allergies}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => setEditPatientTarget(p)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-rose btn-sm"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete patient ${p.name}?`)) {
                                deletePatient(p.id);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No patients registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={{ padding: '4px 10px' }}
                >
                  Prev
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={{ padding: '4px 10px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* COLUMN 2: REGISTRATION FORM / EDIT PROFILE PANEL */}
        <div className="panel-card col-4">
          {editPatientTarget ? (
            <div>
              <div className="panel-card-header" style={{ marginBottom: '16px' }}>
                <h3 className="panel-card-title">Edit Patient Profile</h3>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setEditPatientTarget(null)}
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                >
                  Cancel
                </button>
              </div>
              <form onSubmit={handleEditSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editPatientTarget.name}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number *</label>
                    <input
                      type="tel"
                      className="form-control"
                      value={editPatientTarget.phone}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, phone: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Age *</label>
                    <input
                      type="number"
                      className="form-control"
                      value={editPatientTarget.age}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, age: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gender *</label>
                    <select
                      className="form-control"
                      value={editPatientTarget.gender}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, gender: e.target.value })}
                      required
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Blood Group</label>
                    <select
                      className="form-control"
                      value={editPatientTarget.blood}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, blood: e.target.value })}
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Allergies</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editPatientTarget.allergies}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, allergies: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Emergency Contact</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editPatientTarget.emergencyContact}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, emergencyContact: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editPatientTarget.address}
                      onChange={(e) => setEditPatientTarget({ ...editPatientTarget, address: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
                    Save Profile Changes
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div>
              <div className="panel-card-header" style={{ marginBottom: '16px' }}>
                <h3 className="panel-card-title">Registration Form</h3>
              </div>
              <form onSubmit={handleRegisterSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      name="name"
                      required
                      placeholder="E.g. Emily Watson"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number *</label>
                    <input
                      type="tel"
                      className="form-control"
                      name="phone"
                      required
                      placeholder="10-digit number"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 0 }}>
                    <div className="form-group">
                      <label className="form-label">Age *</label>
                      <input
                        type="number"
                        className="form-control"
                        name="age"
                        required
                        placeholder="E.g. 29"
                        value={formData.age}
                        onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gender *</label>
                      <select
                        className="form-control"
                        name="gender"
                        required
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      className="form-control"
                      name="email"
                      placeholder="name@domain.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Blood Group</label>
                    <select
                      className="form-control"
                      name="blood"
                      value={formData.blood}
                      onChange={(e) => setFormData({ ...formData, blood: e.target.value })}
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Allergies / Conditions</label>
                    <input
                      type="text"
                      className="form-control"
                      name="allergies"
                      placeholder="E.g. Penicillin"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Emergency Contact</label>
                    <input
                      type="text"
                      className="form-control"
                      name="emergencyContact"
                      placeholder="Contact name and phone"
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <input
                      type="text"
                      className="form-control"
                      name="address"
                      placeholder="Street, City"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
                    Complete Registration
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
