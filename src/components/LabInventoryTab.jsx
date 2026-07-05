"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function LabInventoryTab() {
  const { currency } = useClinic();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'Reagent',
    unit: 'vials',
    stockQty: '',
    lowStockThreshold: '10',
    expiryDate: '',
    batchNumber: '',
    costPerUnit: '0',
    notes: ''
  });

  const categories = ['Reagent', 'Kit', 'Consumable', 'Control', 'Standard', 'Other'];

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/lab/inventory');
      if (res.ok) {
        const data = await res.json();
        setItems(data.inventory || []);
      }
    } catch (err) {
      console.error('Failed to load lab inventory', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.stockQty) {
      alert('Please fill out Name and Quantity.');
      return;
    }

    try {
      const method = editItem ? 'PATCH' : 'POST';
      const url = editItem ? `/api/lab/inventory/${editItem.id}` : '/api/lab/inventory';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        alert(editItem ? 'Inventory item updated successfully!' : 'Inventory item added successfully!');
        setFormData({
          name: '',
          category: 'Reagent',
          unit: 'vials',
          stockQty: '',
          lowStockThreshold: '10',
          expiryDate: '',
          batchNumber: '',
          costPerUnit: '0',
          notes: ''
        });
        setShowAddForm(false);
        setEditItem(null);
        fetchInventory();
      } else {
        const error = await res.json();
        alert('Error: ' + error.error);
      }
    } catch (err) {
      console.error('Submit failed', err);
    }
  };

  const handleEditClick = (item) => {
    setEditItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      unit: item.unit,
      stockQty: String(item.stock_qty || item.stockQty || 0),
      lowStockThreshold: String(item.low_stock_threshold || item.lowStockThreshold || 10),
      expiryDate: item.expiry_date || item.expiryDate || '',
      batchNumber: item.batch_number || item.batchNumber || '',
      costPerUnit: String(item.cost_per_unit || item.costPerUnit || 0),
      notes: item.notes || ''
    });
    setShowAddForm(true);
  };

  const handleDeleteClick = async (itemId) => {
    if (!confirm('Are you sure you want to delete this inventory item?')) return;

    try {
      const res = await fetch(`/api/lab/inventory/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Item deleted.');
        fetchInventory();
      } else {
        alert('Delete failed.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Upper Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>Reagents & Consumables Catalog</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Monitor stock quantities, check expiry warnings, and track vendor batches.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => {
            if (showAddForm) {
              setEditItem(null);
              setFormData({ name: '', category: 'Reagent', unit: 'vials', stockQty: '', lowStockThreshold: '10', expiryDate: '', batchNumber: '', costPerUnit: '0', notes: '' });
            }
            setShowAddForm(!showAddForm);
          }}
          style={{ padding: '8px 16px', fontWeight: '700' }}
        >
          {showAddForm ? 'View Catalog' : '＋ Add Reagent / Kit'}
        </button>
      </div>

      {showAddForm ? (
        /* Create / Edit Form */
        <div className="panel-card" style={{ padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '20px', color: 'var(--text-primary)' }}>
            {editItem ? '✏️ Modify Inventory Item' : '📥 New Stock Purchase Entry'}
          </h3>
          <form onSubmit={handleFormSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Item Name *</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. Maglumi TSH Reagent" 
                required 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Category</label>
              <select name="category" value={formData.category} onChange={handleFormChange} className="form-control">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Unit Type</label>
              <input 
                type="text" 
                name="unit" 
                value={formData.unit} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. vials, cartridges, boxes" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Stock Quantity *</label>
              <input 
                type="number" 
                name="stockQty" 
                value={formData.stockQty} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. 50" 
                required 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Alert Threshold</label>
              <input 
                type="number" 
                name="lowStockThreshold" 
                value={formData.lowStockThreshold} 
                onChange={handleFormChange} 
                className="form-control" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Expiry Date</label>
              <input 
                type="date" 
                name="expiryDate" 
                value={formData.expiryDate} 
                onChange={handleFormChange} 
                className="form-control" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Batch / Lot Number</label>
              <input 
                type="text" 
                name="batchNumber" 
                value={formData.batchNumber} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="e.g. LOT-40291" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Cost Price ({currency})</label>
              <input 
                type="number" 
                step="0.01" 
                name="costPerUnit" 
                value={formData.costPerUnit} 
                onChange={handleFormChange} 
                className="form-control" 
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Notes / Details</label>
              <input 
                type="text" 
                name="notes" 
                value={formData.notes} 
                onChange={handleFormChange} 
                className="form-control" 
                placeholder="Storage temperature details, etc." 
              />
            </div>
            <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowAddForm(false);
                  setEditItem(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Inventory List Table */
        <div className="panel-card" style={{ padding: '0px', borderRadius: '16px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading lab inventory database...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No reagent items found. Add some stock to get started.</div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Item Details</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Threshold</th>
                    <th>Expiry Warning</th>
                    <th>Batch ID</th>
                    <th>Cost Per Unit</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const isLow = parseFloat(item.stock_qty || 0) <= parseFloat(item.low_stock_threshold || 10);
                    const expiry = item.expiry_date ? new Date(item.expiry_date) : null;
                    const isExpired = expiry && expiry < new Date();
                    const isExpiringSoon = expiry && !isExpired && (expiry.getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000); // 30 days

                    return (
                      <tr key={item.id}>
                        <td>
                          <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong>
                          {item.notes && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.notes}</div>}
                        </td>
                        <td><span className="badge badge-sky" style={{ fontSize: '10px' }}>{item.category}</span></td>
                        <td>
                          <span style={{ fontWeight: '800', color: isLow ? 'var(--rose)' : 'var(--text-primary)' }}>
                            {item.stock_qty} {item.unit}
                          </span>
                          {isLow && <span className="badge badge-rose" style={{ fontSize: '9px', marginLeft: '6px' }}>Low Stock</span>}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{item.low_stock_threshold} {item.unit}</td>
                        <td>
                          {item.expiry_date ? (
                            <span style={{ 
                              color: isExpired ? 'var(--rose)' : isExpiringSoon ? 'var(--amber)' : 'var(--text-secondary)',
                              fontWeight: isExpired || isExpiringSoon ? '700' : 'normal'
                            }}>
                              {item.expiry_date}
                              {isExpired && ' (EXPIRED)'}
                              {isExpiringSoon && ' (Expiring Soon)'}
                            </span>
                          ) : '--'}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>{item.batch_number || '--'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{currency}{parseFloat(item.cost_per_unit || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => handleEditClick(item)}
                            style={{ padding: '4px 8px', fontSize: '11px', marginRight: '6px' }}
                          >
                            Edit
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => handleDeleteClick(item.id)}
                            style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--rose)' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
