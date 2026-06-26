"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function BillingPanel() {
  const {
    invoices,
    patients,
    recordPayment,
    createInvoice,
    currency
  } = useClinic();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Modal / overlays state
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);

  // Invoice form state
  const [formPatientId, setFormPatientId] = useState(patients[0]?.id || '');
  const [formPaymentMode, setFormPaymentMode] = useState('Cash');
  const [formPaymentStatus, setFormPaymentStatus] = useState('Paid');
  const [formItems, setFormItems] = useState([]);
  
  // Current item builder state
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  // Filtered invoices
  const filteredInvoices = invoices.filter(inv => {
    const pat = patients.find(p => p.id === inv.patientId);
    const matchesSearch = inv.id.toLowerCase().includes(search.toLowerCase()) || 
                          (pat && pat.name.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = filterStatus ? inv.status === filterStatus : true;
    return matchesSearch && matchesStatus;
  });

  const handlePayClick = (invId) => {
    const paymentMode = prompt("Enter Payment Mode (Cash, Card, UPI, Insurance):", "Cash");
    if (paymentMode) {
      recordPayment(invId, paymentMode);
      alert(`Invoice ${invId} marked as Paid via ${paymentMode}.`);
    }
  };

  const handleAddItem = () => {
    if (!itemDesc || !itemPrice) return;
    setFormItems(prev => [...prev, { desc: itemDesc, price: parseFloat(itemPrice) }]);
    setItemDesc('');
    setItemPrice('');
  };

  const handleRemoveItem = (index) => {
    setFormItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!formPatientId) {
      alert("Please select a patient.");
      return;
    }
    if (formItems.length === 0) {
      alert("Please add at least one billable item.");
      return;
    }

    const invoiceId = createInvoice(formPatientId, formItems, formPaymentMode, formPaymentStatus);
    alert(`Invoice ${invoiceId} generated successfully!`);
    
    // Reset form
    setFormPatientId(patients[0]?.id || '');
    setFormPaymentMode('Cash');
    setFormPaymentStatus('Paid');
    setFormItems([]);
    setShowCreateInvoice(false);
  };

  const grandTotal = formItems.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="content-panel active">
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Billing Ledger & Transactions</h1>
          <p>Generate manual invoices, record payments, and print medical consultation bills.</p>
        </div>
        <div className="action-buttons-group">
          <button className="btn btn-emerald" onClick={() => setShowCreateInvoice(true)}>
            ➕ Create Billing Invoice
          </button>
        </div>
      </div>

      {/* TRANSACTION INVOICES LEDGER */}
      <div className="dashboard-grid">
        <div className="panel-card col-12">
          <div className="panel-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h3 className="panel-card-title">Clinic Invoice Transactions</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search invoice or patient..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '220px', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
              <select
                className="form-control"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ width: '150px', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Partial">Partial</option>
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Date</th>
                  <th>Patient ID</th>
                  <th>Patient Name</th>
                  <th>Amount</th>
                  <th>Payment Mode</th>
                  <th>Payment Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length > 0 ? (
                  filteredInvoices.map(inv => {
                    const pat = patients.find(p => p.id === inv.patientId);
                    return (
                      <tr key={inv.id} onClick={() => setSelectedInvoice(inv)}>
                        <td><strong style={{ color: 'var(--primary)' }}>{inv.id}</strong></td>
                        <td>{inv.date}</td>
                        <td><code>{inv.patientId}</code></td>
                        <td>{pat ? pat.name : 'Unknown'}</td>
                        <td><strong>{currency}{inv.amount.toFixed(2)}</strong></td>
                        <td>{inv.mode}</td>
                        <td>
                          <span className={`badge ${
                            inv.status === 'Paid' ? 'badge-emerald' : inv.status === 'Partial' ? 'badge-amber' : 'badge-rose'
                          }`} style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontWeight: '700',
                            backgroundColor: inv.status === 'Paid' ? 'var(--teal-light)' : inv.status === 'Partial' ? 'var(--amber-light)' : 'var(--rose-light)',
                            color: inv.status === 'Paid' ? 'var(--teal)' : inv.status === 'Partial' ? 'var(--amber)' : 'var(--rose)'
                          }}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setSelectedInvoice(inv)}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              Receipt
                            </button>
                            {inv.status === 'Pending' && (
                              <button
                                className="btn btn-emerald btn-sm"
                                onClick={() => handlePayClick(inv.id)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                              >
                                Record Pay
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No transactions registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CREATE INVOICE OVERLAY MODAL */}
      {showCreateInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '550px', backgroundColor: 'var(--bg-surface)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="modal-title" style={{ fontSize: '16px', fontWeight: '700' }}>Create Manual Billing Invoice</h3>
              <button 
                onClick={() => setShowCreateInvoice(false)} 
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Select Patient *</label>
                  <select
                    className="form-control"
                    value={formPatientId}
                    onChange={(e) => setFormPatientId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="">-- Choose Patient --</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Payment Mode</label>
                    <select
                      className="form-control"
                      value={formPaymentMode}
                      onChange={(e) => setFormPaymentMode(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="UPI">UPI</option>
                      <option value="Insurance">Insurance</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: '600' }}>Payment Status</label>
                    <select
                      className="form-control"
                      value={formPaymentStatus}
                      onChange={(e) => setFormPaymentStatus(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    >
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                      <option value="Partial">Partial</option>
                    </select>
                  </div>
                </div>

                {/* Line Item Builder */}
                <div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-primary)' }}>
                  <h4 style={{ fontSize: '12.5px', fontWeight: '700', marginBottom: '10px' }}>Billable Line Items</h4>
                  
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      placeholder="E.g. Blood Test Panel"
                      className="form-control"
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
                      style={{ flex: 2, padding: '6px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}
                    />
                    <input
                      type="number"
                      placeholder="Price"
                      className="form-control"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      min="0"
                      style={{ flex: 1, padding: '6px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}
                    />
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" 
                      onClick={handleAddItem}
                      style={{ padding: '6px 10px', fontSize: '11.5px' }}
                    >
                      Add
                    </button>
                  </div>

                  {/* List of items */}
                  {formItems.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '4px' }}>Description</th>
                          <th style={{ padding: '4px', textAlign: 'right' }}>Price</th>
                          <th style={{ padding: '4px', textAlign: 'right' }}>Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formItems.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px dashed var(--border-color)' }}>
                            <td style={{ padding: '6px 4px' }}>{item.desc}</td>
                            <td style={{ padding: '6px 4px', textAlign: 'right' }}>{currency}{item.price.toFixed(2)}</td>
                            <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                              <button 
                                type="button" 
                                onClick={() => handleRemoveItem(idx)}
                                style={{ background: 'none', border: 'none', color: 'var(--rose)', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                      No items added yet. Build the bill items above.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700' }}>Grand Total Amount:</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)' }}>{currency}{grandTotal.toFixed(2)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateInvoice(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={formItems.length === 0}>
                    Generate Invoice
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE RECEIPT PREVIEW MODAL */}
      {selectedInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '480px', backgroundColor: 'var(--bg-surface)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ padding: 0, paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="modal-title" style={{ fontSize: '16px', fontWeight: '700' }}>Invoice Transaction Summary</h3>
              <button 
                onClick={() => setSelectedInvoice(null)} 
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>
            
            <div className="prescription-print-preview" style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>
                <div>
                  <strong style={{ fontSize: '15px' }}>RK Clinic Billing</strong><br />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sector 4, Healthcare Lane</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span>ID: {selectedInvoice.id}</span><br />
                  <span>Date: {selectedInvoice.date}</span>
                </div>
              </div>

              {(() => {
                const pat = patients.find(p => p.id === selectedInvoice.patientId);
                return (
                  <div style={{ marginBottom: '12px', lineHeight: '1.4' }}>
                    <strong>Patient:</strong> {pat ? pat.name : 'Unknown'}<br />
                    <strong>Patient ID:</strong> {selectedInvoice.patientId}<br />
                    <strong>Payment Method:</strong> {selectedInvoice.mode}<br />
                    <strong>Status:</strong> <span style={{ color: selectedInvoice.status === 'Paid' ? 'var(--teal)' : 'var(--rose)', fontWeight: 'bold' }}>{selectedInvoice.status.toUpperCase()}</span>
                  </div>
                );
              })()}

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--text-muted)', textAlign: 'left', fontSize: '12px' }}>
                    <th style={{ padding: '4px 0' }}>Item Charge Description</th>
                    <th style={{ padding: '4px 0', textAlign: 'right' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items?.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1.5px dashed var(--border-color)' }}>
                      <td style={{ padding: '6px 0' }}>{item.desc}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{currency}{item.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', borderTop: '1px solid var(--text-primary)', paddingTop: '8px' }}>
                <span>Grand Total Amount:</span>
                <span>{currency}{selectedInvoice.amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '12px 0 0 0', backgroundColor: 'transparent', borderTop: 'none', marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedInvoice(null)}>Close</button>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  alert(`Simulating PDF Generation and Download for Invoice ${selectedInvoice.id}...\nFile saved as ${selectedInvoice.id}.pdf`);
                }}
              >
                📥 PDF Download
              </button>
              <button className="btn btn-primary" onClick={() => { window.print(); }}>🖨️ Mock Print</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
