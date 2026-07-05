"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function SuppliersPanel() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'Pharma',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    notes: ''
  });

  const categories = ['Pharma', 'Lab', 'General'];

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (err) {
      console.error('Failed to load suppliers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      alert('Please fill out the Supplier Name.');
      return;
    }

    try {
      const method = editSupplier ? 'PATCH' : 'POST';
      const url = editSupplier ? `/api/suppliers/${editSupplier.id}` : '/api/suppliers';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        alert(editSupplier ? 'Supplier updated successfully!' : 'Supplier added successfully!');
        setFormData({
          name: '',
          category: 'Pharma',
          contactName: '',
          phone: '',
          email: '',
          address: '',
          gstNumber: '',
          notes: ''
        });
        setShowAddForm(false);
        setEditSupplier(null);
        fetchSuppliers();
      } else {
        const error = await res.json();
        alert('Error: ' + error.error);
      }
    } catch (err) {
      console.error('Submit failed', err);
    }
  };

  const handleEditClick = (supplier) => {
    setEditSupplier(supplier);
    setFormData({
      name: supplier.name,
      category: supplier.category,
      contactName: supplier.contact_name || supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      gstNumber: supplier.gst_number || supplier.gstNumber || '',
      notes: supplier.notes || ''
    });
    setShowAddForm(true);
  };

  const handleDeleteClick = async (supplierId) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;

    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Supplier deleted.');
        fetchSuppliers();
      } else {
        alert('Delete failed.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Welcome Row */}
      <div className="welcome-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="welcome-text">
          <h1>Vendor & Supplier Management</h1>
          <p>Register distributors, manage pharmacy wholesale accounts, and configure laboratory reagent vendors.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => {
            if (showAddForm) {
              setEditSupplier(null);
              setFormData({ name: '', category: 'Pharma', contactName: '', phone: '', email: '', address: '', gstNumber: '', notes: '' });
            }
            setShowAddForm(!showAddForm);
          }}
          style={{ padding: '8px 16px', fontWeight: '700' }}
        >
          {showAddForm ? 'View Supplier Directory' : '＋ Register Vendor'}
        </button>
      </div>

      {showAddForm ? (
        /* Create / Edit Form */
        <div className="panel-card" style={{ padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '20px', color: 'var(--text-primary)' }}>
            {editSupplier ? '✏️ Modify Supplier Information' : '📥 Register New Supply Vendor'}
          </h3>
          <form onSubmit={handleFormSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Supplier Name *</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. Acme Pharmaceuticals" 
                required 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Supply Category</label>
              <select name="category" value={formData.category} onChange={handleFormChange} className="form-control">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Contact Person</label>
              <input 
                type="text" 
                name="contactName" 
                value={formData.contactName} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. John Doe" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Phone Number</label>
              <input 
                type="text" 
                name="phone" 
                value={formData.phone} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. +91 9876543210" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Email Address</label>
              <input 
                type="email" 
                name="email" 
                value={formData.email} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. sales@vendor.com" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>GSTIN / Tax Registration</label>
              <input 
                type="text" 
                name="gstNumber" 
                value={formData.gstNumber} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. 27AAAAA0000A1Z5" 
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Physical Address</label>
              <input 
                type="text" 
                name="address" 
                value={formData.address} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="Warehouse address, City, State" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Procurement Notes</label>
              <input 
                type="text" 
                name="notes" 
                value={formData.notes} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="Payment terms, delivery schedules, etc." 
              />
            </div>
            <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowAddForm(false);
                  setEditSupplier(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editSupplier ? 'Update Vendor' : 'Register Vendor'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Table Grid Directory */
        <div className="panel-card" style={{ padding: '0px', borderRadius: '16px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Querying vendor directory...</div>
          ) : suppliers.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No registered supply vendors. Add a supplier to manage wholesale inventory.</div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Vendor Name</th>
                    <th>Category</th>
                    <th>Contact Agent</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>GSTIN</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s.id}>
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{s.name}</strong>
                        {s.notes && <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{s.notes}</div>}
                      </td>
                      <td>
                        <span className={`badge ${s.category === 'Pharma' ? 'badge-sky' : s.category === 'Lab' ? 'badge-indigo' : 'badge-emerald'}`} style={{ fontSize: '10px' }}>
                          {s.category} Supplies
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{s.contact_name || '--'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{s.phone || '--'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{s.email || '--'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>{s.gst_number || '--'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleEditClick(s)}
                          style={{ padding: '4px 8px', fontSize: '11px', marginRight: '6px' }}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleDeleteClick(s.id)}
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--rose)' }}
                        >
                          Delete
                        </button>
                      </td>
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
