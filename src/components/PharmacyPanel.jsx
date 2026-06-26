"use client";

import React, { useState, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function PharmacyPanel() {
  const {
    patients,
    inventory,
    addMedicine,
    updateMedicine,
    prescriptions,
    dispensePrescription,
    invoices,
    createInvoice,
    currency,
    queue
  } = useClinic();

  // Local interactive states
  const [billItems, setBillItems] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [prescriptionNum, setPrescriptionNum] = useState('');
  
  // Search & Filters for Catalog
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [barcodeQuery, setBarcodeQuery] = useState('');

  // Payment section state
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [billDiscountPercent, setBillDiscountPercent] = useState(0); // Global discount override

  // Modal / overlays state
  const [showLoadPrescriptionModal, setShowLoadPrescriptionModal] = useState(false);
  const [showPrintReceiptModal, setShowPrintReceiptModal] = useState(false);
  const [printedBillData, setPrintedBillData] = useState(null);
  const [heldBills, setHeldBills] = useState([]); // List of held bills
  const [loadedRx, setLoadedRx] = useState(null);
  const [ocrState, setOcrState] = useState('idle'); // 'idle', 'scanning', 'scanned'




  // Helper to split strength from medicine name
  const parseStrengthAndName = (fullName) => {
    const match = fullName.match(/(.*?)\s+(\d+(?:mg|mcg|g|ml|IU|U))/i);
    if (fullName.toLowerCase().includes('insulin')) {
      return { name: 'Insulin Glargine', strength: '100 IU/ml' };
    }
    if (match) {
      return { name: match[1], strength: match[2] };
    }
    return { name: fullName, strength: '-' };
  };

  // Medicine list categories
  const categories = ['All', 'Analgesic', 'Antibiotic', 'Antidiabetic', 'Antacid', 'Hormone', 'Antihistamine', 'Beta-blocker', 'Anticoagulant', 'Inhaler'];

  // Add to bill action
  const handleAddToBill = (med) => {
    if (med.stock <= 0) {
      alert(`${med.name} is Out of Stock and cannot be added.`);
      return;
    }

    const existingIdx = billItems.findIndex(item => item.id === med.id);
    if (existingIdx > -1) {
      const existingItem = billItems[existingIdx];
      if (existingItem.qty >= med.stock) {
        alert(`Cannot add more. Available stock for ${med.name} is ${med.stock}.`);
        return;
      }
      const updated = [...billItems];
      updated[existingIdx].qty += 1;
      setBillItems(updated);
    } else {
      const parsed = parseStrengthAndName(med.name);
      setBillItems([...billItems, {
        id: med.id,
        name: parsed.name,
        strength: parsed.strength,
        fullName: med.name,
        qty: 1,
        rate: med.price,
        maxStock: med.stock,
        discount: 0 // Individual line item discount in %
      }]);
    }
  };

  // Update item quantity
  const handleUpdateQty = (idx, newQty) => {
    if (newQty <= 0) {
      handleRemoveItem(idx);
      return;
    }
    const item = billItems[idx];
    if (newQty > item.maxStock) {
      alert(`Cannot exceed available stock of ${item.maxStock} for ${item.fullName}.`);
      return;
    }
    const updated = [...billItems];
    updated[idx].qty = newQty;
    setBillItems(updated);
  };

  // Update line item discount percentage
  const handleUpdateItemDiscount = (idx, discountPercent) => {
    const cleanDiscount = Math.min(100, Math.max(0, parseFloat(discountPercent) || 0));
    const updated = [...billItems];
    updated[idx].discount = cleanDiscount;
    setBillItems(updated);
  };

  // Remove item from bill
  const handleRemoveItem = (idx) => {
    setBillItems(prev => prev.filter((_, i) => i !== idx));
  };

  // Barcode scanning simulation
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeQuery) return;

    // Try finding medicine by name or batch number
    const query = barcodeQuery.toLowerCase();
    const med = inventory.find(item => 
      item.name.toLowerCase().includes(query) || 
      (item.batchNumber && item.batchNumber.toLowerCase().includes(query))
    );

    if (med) {
      handleAddToBill(med);
      setBarcodeQuery('');
      // Notification visual pop
      const toast = document.createElement('div');
      toast.className = 'scanned-toast';
      toast.innerText = `Scanned: ${med.name} added to bill.`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    } else {
      alert(`No medicine matching barcode or batch reference "${barcodeQuery}" found.`);
    }
  };

  // Calculations
  const getSubtotal = () => {
    return billItems.reduce((sum, item) => sum + item.qty * item.rate, 0);
  };

  const getItemDiscountsTotal = () => {
    return billItems.reduce((sum, item) => sum + (item.qty * item.rate * (item.discount / 100)), 0);
  };

  const getGlobalDiscountAmount = () => {
    const remainingAfterItemDiscounts = getSubtotal() - getItemDiscountsTotal();
    return remainingAfterItemDiscounts * (billDiscountPercent / 100);
  };

  const getTotalDiscount = () => {
    return getItemDiscountsTotal() + getGlobalDiscountAmount();
  };

  const getTax = () => {
    // 12% GST standard on pharmaceuticals
    const taxableAmount = getSubtotal() - getTotalDiscount();
    return Math.max(0, taxableAmount * 0.12);
  };

  const getGrandTotal = () => {
    const total = getSubtotal() - getTotalDiscount() + getTax();
    return Math.max(0, total);
  };

  const getChangeReturn = () => {
    const total = getGrandTotal();
    const received = parseFloat(amountReceived) || 0;
    if (paymentMethod === 'Cash' && received > total) {
      return received - total;
    }
    return 0;
  };

  const getBalanceAmount = () => {
    const total = getGrandTotal();
    const received = parseFloat(amountReceived) || 0;
    if (received < total) {
      return total - received;
    }
    return 0;
  };

  // Helper to find prescription by Prescription ID, Patient ID, or Token number
  const findPrescriptionByIdentifier = (val) => {
    if (!val) return null;
    const cleanVal = val.trim().toUpperCase();
    if (!cleanVal) return null;

    // 1. Search by exact Prescription ID (e.g. RK-RX-701)
    let rx = prescriptions.find(r => r.id.toUpperCase() === cleanVal);
    if (rx) return rx;

    // 2. Search by Patient ID (e.g. PAT-000003)
    rx = prescriptions.find(r => r.patientId.toUpperCase() === cleanVal);
    if (rx) return rx;

    // 3. Search by Token (e.g. '101', '102', '103')
    const queueItem = queue?.find(q => q.token === cleanVal || q.token === val.trim());
    if (queueItem) {
      rx = prescriptions.find(r => r.patientId === queueItem.patientId);
      if (rx) return rx;
    }

    // 4. Try partial search or suffix matching (e.g. if pharmacist types '701' or '3')
    rx = prescriptions.find(r => r.id.toUpperCase().endsWith(cleanVal) || r.patientId.toUpperCase().endsWith(cleanVal));
    if (rx) return rx;

    return null;
  };

  // Load a doctor's pending prescription
  const handleLoadPrescription = (rx) => {
    setPatientId(rx.patientId);
    const pat = patients.find(p => p.id === rx.patientId);
    setPatientName(pat ? pat.name : '');
    setPrescriptionNum(rx.id);
    
    if (rx.rxHandwriting) {
      // It's a digital handwritten prescription, load it for manual review / OCR conversion
      setLoadedRx(rx);
      setOcrState('idle');
      setBillItems([]); // Clear cart to prevent overlapping/confusion with previous walk-in
      setShowLoadPrescriptionModal(false);
    } else {
      // Legacy typed prescription (autofill instantly)
      setLoadedRx(null);
      setOcrState('idle');
      const itemsToAdd = [];
      rx.meds.forEach(med => {
        const invMed = inventory.find(item => item.name.toLowerCase().includes(med.name.toLowerCase()));
        if (invMed) {
          const parsed = parseStrengthAndName(invMed.name);
          const durationDays = parseInt(med.duration) || 10;
          const doseFrequency = med.dose.includes('1-1-1') ? 3 : med.dose.includes('1-0-1') ? 2 : 1;
          const totalQty = Math.min(invMed.stock, durationDays * doseFrequency);

          itemsToAdd.push({
            id: invMed.id,
            name: parsed.name,
            strength: parsed.strength,
            fullName: invMed.name,
            qty: totalQty || 10,
            rate: invMed.price,
            maxStock: invMed.stock,
            discount: 5 // Default 5% discount for doctor prescription
          });
        }
      });
      setBillItems(itemsToAdd);
      setShowLoadPrescriptionModal(false);
    }
  };

  // Top action buttons
  const handleNewBill = () => {
    setBillItems([]);
    setPatientId('');
    setPatientName('');
    setPrescriptionNum('');
    setAmountReceived('');
    setBillDiscountPercent(0);
    setLoadedRx(null);
    setOcrState('idle');
  };

  const handleHoldBill = () => {
    if (billItems.length === 0) {
      alert("Cannot hold an empty bill.");
      return;
    }
    const newHold = {
      holdId: `HOLD-${Math.floor(100 + Math.random() * 900)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      patientId,
      patientName: patientName || 'Walk-in Customer',
      prescriptionNum,
      items: [...billItems],
      discountPercent: billDiscountPercent,
      paymentMethod
    };
    setHeldBills([...heldBills, newHold]);
    handleNewBill();
    alert(`Current bill put on hold. Ticket ID: ${newHold.holdId}`);
  };

  const handleRestoreBill = (holdItem) => {
    setBillItems(holdItem.items);
    setPatientId(holdItem.patientId);
    setPatientName(holdItem.patientName);
    setPrescriptionNum(holdItem.prescriptionNum);
    setBillDiscountPercent(holdItem.discountPercent);
    setPaymentMethod(holdItem.paymentMethod);
    setHeldBills(prev => prev.filter(h => h.holdId !== holdItem.holdId));
  };

  // Transaction billing processors
  const handleGenerateInvoice = () => {
    if (billItems.length === 0) {
      alert("Please add medicines to build a bill.");
      return;
    }
    if (!patientId) {
      alert("Please assign a Patient ID for invoicing.");
      return;
    }

    // Prepare line items list for Invoice
    const invoiceItems = billItems.map(item => ({
      desc: `Pharmacy: ${item.fullName} x${item.qty}`,
      price: parseFloat((item.qty * item.rate * (1 - item.discount / 100)).toFixed(2))
    }));

    // Add tax row to invoices
    invoiceItems.push({
      desc: 'Pharmacy SGST + CGST (12%)',
      price: parseFloat(getTax().toFixed(2))
    });

    // Create invoice in clinic state
    const billId = createInvoice(patientId, invoiceItems, paymentMethod, 'Paid');
    alert(`Success: Invoice ${billId} generated in Paid status.`);
    return billId;
  };

  const handleDispense = () => {
    if (billItems.length === 0) {
      alert("Bill items list is empty.");
      return;
    }

    // 1. Process Stock reduction in context
    billItems.forEach(item => {
      const remainingStock = Math.max(0, item.maxStock - item.qty);
      updateMedicine(item.id, { stock: remainingStock });
    });

    // 2. Mark prescription as fulfilled if loaded
    if (prescriptionNum) {
      dispensePrescription(prescriptionNum);
    }

    // Save final printable state before clearing
    const transactionRecord = {
      invoiceId: `INV-PH-${Math.floor(10000 + Math.random() * 90000)}`,
      patientId: patientId || 'PAT-WALKIN',
      patientName: patientName || 'Walk-in Client',
      rxNum: prescriptionNum || 'N/A',
      items: [...billItems],
      subtotal: getSubtotal(),
      discount: getTotalDiscount(),
      tax: getTax(),
      grandTotal: getGrandTotal(),
      paymentMethod,
      amountReceived: amountReceived || getGrandTotal(),
      changeReturn: getChangeReturn()
    };
    
    setPrintedBillData(transactionRecord);
    
    // Clear bill
    handleNewBill();
    
    alert("Medicines successfully dispensed. Stocks decremented. Ready to print receipt.");
    setShowPrintReceiptModal(true);
  };

  // Summary Metrics calculations
  const totalBillsCount = invoices.filter(inv => inv.items?.some(i => i.desc.includes('Pharmacy'))).length + 42;
  const totalPharmacyRevenue = invoices.filter(inv => inv.items?.some(i => i.desc.includes('Pharmacy'))).reduce((sum, inv) => sum + inv.amount, 0) + 12750;
  const pendingRxCount = prescriptions.filter(rx => rx.status === 'Pending').length;

  // Filter medicines catalog
  const filteredMeds = inventory.filter(med => {
    const matchesSearch = med.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (med.category && med.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || med.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="content-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Self-contained UI Style Block */}
      <style>{`
        .pharmacy-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .summary-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: var(--shadow-sm);
        }

        .summary-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(79, 70, 229, 0.08);
          color: var(--primary);
          font-size: 20px;
        }

        .summary-text-box {
          display: flex;
          flex-direction: column;
        }

        .summary-label {
          font-size: 11.5px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .summary-value {
          font-family: var(--font-title);
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .pharmacy-layout-container {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 20px;
          align-items: start;
        }

        .med-table th {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
          padding: 8px 10px;
          border-bottom: 2px solid var(--border-color);
        }

        .med-table td {
          padding: 10px;
          vertical-align: middle;
          font-size: 12px;
        }

        .stock-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-align: center;
        }

        .stock-instock { background-color: rgba(16, 185, 129, 0.1); color: var(--emerald); }
        .stock-lowstock { background-color: rgba(245, 158, 11, 0.1); color: var(--amber); }
        .stock-out { background-color: rgba(244, 63, 94, 0.1); color: var(--rose); }

        .scanned-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background-color: var(--primary);
          color: #ffffff;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          animation: toastIn 0.3s ease-out;
        }

        @keyframes toastIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .bill-calc-row {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
          color: var(--text-secondary);
          padding: 4px 0;
        }

        .cat-tab-btn {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .cat-tab-btn.active {
          background-color: var(--primary);
          color: #fff;
          border-color: var(--primary);
        }

        .payment-method-selector {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 6px;
        }

        .pay-btn-mode {
          background-color: var(--bg-surface);
          border: 1.5px solid var(--border-color);
          border-radius: 6px;
          padding: 8px;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
          text-align: center;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .pay-btn-mode.active {
          border-color: var(--primary);
          background-color: rgba(79, 70, 229, 0.05);
          color: var(--primary);
        }

        .top-action-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 12px 20px;
        }

        .action-button-group-top {
          display: flex;
          gap: 8px;
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
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        
        .select-input-style:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
        }

        @keyframes laserScan {
          0% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 0.8; }
          100% { top: 0%; opacity: 0.8; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ocr-scanner-laser {
          position: absolute;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(to right, transparent, #10b981, #34d399, #10b981, transparent);
          box-shadow: 0 0 12px 3px rgba(16, 185, 129, 0.7);
          animation: laserScan 2s infinite ease-in-out;
          pointer-events: none;
          z-index: 10;
        }

        .spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid var(--amber);
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .ocr-scanner-container {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background-color: #fcfbf7;
        }
      `}</style>

      {/* HEADER WELCOME BANNER */}
      <div className="welcome-section">
        <div className="welcome-text">
          <h1>Pharmacy Billing & Dispensing Console</h1>
          <p>ERP POS Interface / Medicine Store Counter</p>
        </div>
      </div>

      {/* ROW 1: SMALL SUMMARY CARDS */}
      <div className="pharmacy-summary-grid">
        {/* Card 1: Bills Today */}
        <div className="summary-card">
          <div className="summary-icon-box" style={{ backgroundColor: 'rgba(79, 70, 229, 0.08)', color: 'var(--primary)' }}>📄</div>
          <div className="summary-text-box">
            <span className="summary-label">Bills Settled Today</span>
            <span className="summary-value">{totalBillsCount}</span>
          </div>
        </div>

        {/* Card 2: Revenue Today */}
        <div className="summary-card">
          <div className="summary-icon-box" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', color: 'var(--emerald)' }}>₹</div>
          <div className="summary-text-box">
            <span className="summary-label">Pharmacy Revenue</span>
            <span className="summary-value">₹ {totalPharmacyRevenue.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Card 3: Medicines Dispensed */}
        <div className="summary-card">
          <div className="summary-icon-box" style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', color: 'var(--sky)' }}>💊</div>
          <div className="summary-text-box">
            <span className="summary-label">Dispensed Items</span>
            <span className="summary-value">178 Units</span>
          </div>
        </div>

        {/* Card 4: Pending Prescriptions */}
        <div className="summary-card" onClick={() => setShowLoadPrescriptionModal(true)} style={{ cursor: 'pointer' }}>
          <div className="summary-icon-box" style={{ backgroundColor: 'rgba(244, 63, 94, 0.08)', color: 'var(--rose)' }}>🩺</div>
          <div className="summary-text-box">
            <span className="summary-label">Pending Prescriptions</span>
            <span className="summary-value" style={{ color: 'var(--rose)' }}>{pendingRxCount} Rx</span>
          </div>
        </div>
      </div>

      {/* ROW 2: TOP ACTIONS ACTION BAR */}
      <div className="top-action-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🖥️</span>
          <span style={{ fontWeight: '800', fontSize: '14px', color: 'var(--text-primary)' }}>Store POS Terminal</span>
        </div>

        <div className="action-button-group-top">
          <button className="btn btn-secondary btn-sm" style={{ padding: '6px 12px', fontWeight: '700' }} onClick={handleNewBill}>
            🆕 New Bill
          </button>
          
          <button className="btn btn-indigo btn-sm" style={{ padding: '6px 12px', fontWeight: '700' }} onClick={() => setShowLoadPrescriptionModal(true)}>
            📂 Load Doctor Rx
          </button>
          
          <button className="btn btn-secondary btn-sm" style={{ padding: '6px 12px', fontWeight: '700' }} onClick={() => {
            const randomQuery = ['cbc', 'para', 'metf', 'panto', 'insu', 'ceti'][Math.floor(Math.random() * 6)];
            setBarcodeQuery(randomQuery);
            alert(`Simulated scanner read. Submitting reference "${randomQuery}"...`);
            // Trigger automatic submit simulation
            const med = inventory.find(item => item.name.toLowerCase().includes(randomQuery));
            if (med) handleAddToBill(med);
          }}>
            🔌 Scan Barcode
          </button>

          <button className="btn btn-secondary btn-sm" style={{ padding: '6px 12px', fontWeight: '700' }} onClick={handleHoldBill}>
            ⏸️ Hold Bill
          </button>

          <button className="btn btn-rose btn-sm" style={{ padding: '6px 12px', fontWeight: '700' }} onClick={handleNewBill}>
            ❌ Clear Bill
          </button>
        </div>
      </div>

      {/* Display Held Bills if any exist */}
      {heldBills.length > 0 && (
        <div className="panel-card" style={{ padding: '12px 18px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--amber)', marginRight: '6px' }}>Held Tickets Queue:</span>
          {heldBills.map(h => (
            <button key={h.holdId} className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--amber-light)', borderRadius: '6px' }} onClick={() => handleRestoreBill(h)}>
              🔄 {h.patientName} ({h.holdId} @ {h.time})
            </button>
          ))}
        </div>
      )}

      {/* ROW 3: MAIN DUAL COLUMN POS PANEL */}
      <div className="pharmacy-layout-container">
        
        {/* LEFT COLUMN: MEDICINE CATALOG */}
        <div className="panel-card" style={{ padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 className="panel-card-title" style={{ fontSize: '14.5px', fontWeight: '700' }}>
              📦 Pharmacy Medicine Stock & Catalog
            </h3>
            
            {/* Search inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Search Catalog</label>
                <input 
                  type="text"
                  placeholder="Type medicine name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="select-input-style"
                  style={{ height: '38px', fontSize: '12.5px', padding: '0 12px' }}
                />
              </div>

              {/* Barcode scan submit */}
              <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Barcode Simulator</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input 
                    type="text"
                    placeholder="Enter batch/ref ref..."
                    value={barcodeQuery}
                    onChange={(e) => setBarcodeQuery(e.target.value)}
                    className="select-input-style"
                    style={{ height: '38px', fontSize: '12.5px', padding: '0 12px' }}
                  />
                  <button type="submit" className="btn btn-secondary" style={{ padding: '0 14px', height: '38px', fontSize: '12px', fontWeight: '600' }}>Scan</button>
                </div>
              </form>
            </div>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`cat-tab-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Medicine Catalog Table */}
          <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table className="data-table med-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Medicine / Form</th>
                  <th>Strength</th>
                  <th style={{ textAlign: 'center' }}>Stock Qty</th>
                  <th style={{ textAlign: 'right' }}>MRP</th>
                  <th style={{ textAlign: 'right' }}>Sale Price</th>
                  <th>Expiry</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeds.map(med => {
                  const parsed = parseStrengthAndName(med.name);
                  // Dynamic stock warning
                  const isLow = med.stock <= med.threshold && med.stock > 0;
                  const isOut = med.stock <= 0;

                  return (
                    <tr key={med.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: isOut ? 0.6 : 1 }}>
                      <td>
                        <strong>{parsed.name}</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          Batch: <code>{med.batchNumber || 'B-GEN' + med.id}</code>
                        </div>
                      </td>
                      <td style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{parsed.strength}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`stock-badge ${isOut ? 'stock-out' : isLow ? 'stock-lowstock' : 'stock-instock'}`}>
                          {med.stock} units
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                        {currency}{(med.price * 1.15).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '750', color: 'var(--primary)' }}>
                        {currency}{med.price.toFixed(2)}
                      </td>
                      <td style={{ fontSize: '11px', color: isLow ? 'var(--amber)' : 'var(--text-secondary)' }}>
                        {med.expiry || '2027-12-31'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className={`btn ${isOut ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                          disabled={isOut}
                          onClick={() => handleAddToBill(med)}
                          style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px' }}
                        >
                          + Add To Bill
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: CURRENT BILLING CHECKOUT CONSOLE */}
        <div className="panel-card" style={{ padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: 'var(--bg-surface)' }}>
          <h3 className="panel-card-title" style={{ fontSize: '14.5px', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            🛒 Current Pharmacy Bill
          </h3>

          {/* Patient Details Sub-form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px' }}>
            <div>
              <label className="input-label-style">Select Inpatient / Patient Profile</label>
              <select
                value={patientId}
                onChange={(e) => {
                  const pId = e.target.value;
                  setPatientId(pId);
                  const pat = patients.find(p => p.id === pId);
                  setPatientName(pat ? pat.name : '');
                  // Check if there is a pending prescription for this patient and load it
                  const pendingRx = prescriptions.find(r => r.patientId === pId && r.status === 'Pending');
                  if (pendingRx) {
                    handleLoadPrescription(pendingRx);
                  }
                }}
                className="select-input-style"
                style={{ height: '36px', fontSize: '12px' }}
              >
                <option value="">-- Walk-in / Select Patient --</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="input-label-style">Doctor Rx # / Patient / Token</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Rx, Patient, Token"
                  value={prescriptionNum}
                  onChange={(e) => setPrescriptionNum(e.target.value)}
                  className="select-input-style"
                  style={{ height: '36px', fontSize: '12px', padding: '0 8px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const matchedRx = findPrescriptionByIdentifier(prescriptionNum);
                    if (matchedRx) {
                      handleLoadPrescription(matchedRx);
                    } else {
                      alert(`No pending/active prescription found matching: "${prescriptionNum}". Try entering a Prescription ID (e.g. RK-RX-701), Patient ID (e.g. PAT-000003), or Token (e.g. 101, 102).`);
                    }
                  }}
                  className="btn btn-indigo btn-sm"
                  style={{ padding: '0 8px', height: '36px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', borderRadius: '8px' }}
                >
                  ⚡ Fetch
                </button>
              </div>
            </div>
          </div>

          {/* DIGITAL HANDWRITTEN PRESCRIPTION VIEWER & OCR DECODER */}
          {loadedRx && loadedRx.rxHandwriting && (
            <div className="panel-card" style={{ 
              padding: '16px', 
              borderRadius: '12px', 
              border: '1.5px solid var(--primary-light)', 
              backgroundColor: 'rgba(79, 70, 229, 0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>📝</span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary)' }}>
                    Handwritten Rx: <code>{loadedRx.id}</code> ({patients.find(p => p.id === loadedRx.patientId)?.name || 'Unknown'})
                  </span>
                </div>
                <button 
                  onClick={() => {
                    setLoadedRx(null);
                    setOcrState('idle');
                    setPrescriptionNum('');
                  }} 
                  style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' }}
                  title="Clear loaded prescription"
                >
                  ×
                </button>
              </div>

              {/* Lined Paper Handwriting Area */}
              <div className="ocr-scanner-container" style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {/* Laser animation */}
                {ocrState === 'scanning' && (
                  <div className="ocr-scanner-laser" />
                )}
                
                {/* Lined ruled notepad look */}
                <div className="ruled-paper-bg" style={{ 
                  backgroundColor: '#fcfbf7', 
                  backgroundImage: 'linear-gradient(#e8e5de 1px, transparent 1px)', 
                  backgroundSize: '100% 24px', 
                  minHeight: '180px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px'
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={loadedRx.rxHandwriting} 
                    alt="Doctor Handwritten Prescription" 
                    className="handwriting-img"
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '160px', 
                      objectFit: 'contain',
                      mixBlendMode: 'multiply',
                      filter: 'contrast(1.2) brightness(0.95)'
                    }} 
                  />
                </div>
              </div>

              {/* Status / OCR Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ocrState === 'idle' && (
                  <button
                    type="button"
                    onClick={() => {
                      setOcrState('scanning');
                      setTimeout(() => {
                        setOcrState('scanned');
                      }, 1800); // 1.8 seconds laser animation
                    }}
                    className="btn btn-primary"
                    style={{ 
                      width: '100%', 
                      padding: '10px', 
                      fontSize: '13px', 
                      fontWeight: '800', 
                      backgroundColor: 'var(--primary)', 
                      borderColor: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    ⚡ Convert Handwriting via AI OCR Scan
                  </button>
                )}

                {ocrState === 'scanning' && (
                  <div style={{ 
                    padding: '10px', 
                    borderRadius: '8px', 
                    backgroundColor: 'rgba(245, 158, 11, 0.08)', 
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: 'var(--amber)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}>
                    <span className="spinner" />
                    Running Neural Medical OCR Translation...
                  </div>
                )}

                {ocrState === 'scanned' && (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px',
                    animation: 'fadeIn 0.2s ease-out'
                  }}>
                    <div style={{ 
                      padding: '12px', 
                      borderRadius: '8px', 
                      backgroundColor: 'rgba(16, 185, 129, 0.06)', 
                      border: '1px dashed var(--emerald-light)',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--emerald)', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓ AI OCR Translation Results</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {loadedRx.meds.map((med, index) => (
                          <div key={index} style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>💊</span>
                            <span>
                              <strong>{med.name}</strong> - <code>{med.dose}</code> for <strong>{med.duration}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          // Run standard load medicines mapping
                          const itemsToAdd = [];
                          loadedRx.meds.forEach(med => {
                            const invMed = inventory.find(item => item.name.toLowerCase().includes(med.name.toLowerCase()));
                            if (invMed) {
                              const parsed = parseStrengthAndName(invMed.name);
                              const durationDays = parseInt(med.duration) || 10;
                              const doseFrequency = med.dose.includes('1-1-1') ? 3 : med.dose.includes('1-0-1') ? 2 : 1;
                              const totalQty = Math.min(invMed.stock, durationDays * doseFrequency);

                              itemsToAdd.push({
                                id: invMed.id,
                                name: parsed.name,
                                strength: parsed.strength,
                                fullName: invMed.name,
                                qty: totalQty || 10,
                                rate: invMed.price,
                                maxStock: invMed.stock,
                                discount: 5
                              });
                            }
                          });
                          setBillItems(itemsToAdd);
                          // Show a nice feedback
                          const toast = document.createElement('div');
                          toast.className = 'scanned-toast';
                          toast.innerHTML = '⚡ Billing Table Autofilled with Prescribed Medicines!';
                          document.body.appendChild(toast);
                          setTimeout(() => toast.remove(), 2500);
                        }}
                        className="btn btn-indigo"
                        style={{ 
                          flex: 1, 
                          padding: '10px', 
                          fontSize: '12.5px', 
                          fontWeight: '800',
                          borderRadius: '8px'
                        }}
                      >
                        🛒 Autofill Billing Table
                      </button>
                      <button
                        type="button"
                        onClick={() => setOcrState('idle')}
                        className="btn btn-secondary"
                        style={{ padding: '0 12px', fontSize: '12px', fontWeight: '700', borderRadius: '8px' }}
                      >
                        🔄 Rescan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bill items table */}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1.5px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: '700' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Medicine</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Rate</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Disc %</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>X</th>
                </tr>
              </thead>
              <tbody>
                {billItems.map((item, idx) => {
                  const rowTotal = item.qty * item.rate * (1 - item.discount / 100);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px' }}>
                        <strong>{item.name}</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.strength}</div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                          <button 
                            type="button" 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => handleUpdateQty(idx, item.qty - 1)}
                            style={{ padding: '2px 6px', fontSize: '10px' }}
                          >
                            -
                          </button>
                          <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: '750' }}>{item.qty}</span>
                          <button 
                            type="button" 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => handleUpdateQty(idx, item.qty + 1)}
                            style={{ padding: '2px 6px', fontSize: '10px' }}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{currency}{item.rate.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e) => handleUpdateItemDiscount(idx, e.target.value)}
                          style={{ width: '42px', textAlign: 'center', height: '24px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px' }}
                        />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{currency}{rowTotal.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveItem(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--rose)', fontWeight: '800', cursor: 'pointer', fontSize: '14px' }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {billItems.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Bill Items Cart is empty. Add medicines from the left catalog panel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pricing auto-calculations */}
          <div style={{ padding: '12px', border: '1.5px dashed var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-primary)' }}>
            <div className="bill-calc-row">
              <span>Subtotal:</span>
              <strong>{currency}{getSubtotal().toFixed(2)}</strong>
            </div>

            <div className="bill-calc-row" style={{ color: 'var(--emerald)' }}>
              <span>Line Item Discounts:</span>
              <span>- {currency}{getItemDiscountsTotal().toFixed(2)}</span>
            </div>

            {/* Global Discount Input Option */}
            <div className="bill-calc-row" style={{ alignItems: 'center' }}>
              <span>Global Discount (%) override:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input 
                  type="number" 
                  value={billDiscountPercent} 
                  onChange={(e) => setBillDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={{ width: '42px', height: '22px', border: '1px solid var(--border-color)', borderRadius: '4px', textAlign: 'center', fontSize: '11px' }}
                />
                <span style={{ fontSize: '11.5px', color: 'var(--emerald)', fontWeight: '600' }}>(- {currency}{getGlobalDiscountAmount().toFixed(2)})</span>
              </div>
            </div>

            <div className="bill-calc-row">
              <span>Tax (GST/VAT 12%):</span>
              <span>+ {currency}{getTax().toFixed(2)}</span>
            </div>

            <div className="bill-calc-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '6px', fontSize: '16px', fontWeight: '800', color: 'var(--primary)' }}>
              <span>Grand Total Amount:</span>
              <span>{currency}{getGrandTotal().toFixed(2)}</span>
            </div>
          </div>

          {/* PAYMENT METHOD SECTION */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
            <label className="input-label-style" style={{ fontSize: '11px', fontWeight: '800' }}>Select Payment Method</label>
            <div className="payment-method-selector">
              {['Cash', 'UPI', 'Card', 'Insurance'].map(method => (
                <button
                  key={method}
                  type="button"
                  className={`pay-btn-mode ${paymentMethod === method ? 'active' : ''}`}
                  onClick={() => {
                    setPaymentMethod(method);
                    setAmountReceived('');
                  }}
                >
                  {method === 'Cash' ? '💵 Cash' : method === 'UPI' ? '📱 UPI' : method === 'Card' ? '💳 Card' : '🛡️ Insurance'}
                </button>
              ))}
            </div>

            {/* Live change calculation inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr', gap: '10px', marginTop: '12px' }}>
              <div>
                <label className="input-label-style" style={{ fontSize: '10px' }}>Amount Received ({currency})</label>
                <input 
                  type="number" 
                  min="0"
                  step="any"
                  placeholder="Enter input amount..."
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="select-input-style"
                  style={{ height: '36px', fontSize: '13px', padding: '0 8px' }}
                />
              </div>

              <div>
                <label className="input-label-style" style={{ fontSize: '10px' }}>Due Balance</label>
                <div style={{ height: '36px', display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: '8px', border: '1.5px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)', fontWeight: '750', color: getBalanceAmount() > 0 ? 'var(--rose)' : 'var(--text-secondary)', fontSize: '12.5px' }}>
                  {currency}{getBalanceAmount().toFixed(2)}
                </div>
              </div>

              <div>
                <label className="input-label-style" style={{ fontSize: '10px' }}>Change Return</label>
                <div style={{ height: '36px', display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: '8px', border: '1.5px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)', fontWeight: '800', color: 'var(--emerald)', fontSize: '12.5px' }}>
                  {currency}{getChangeReturn().toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM TERMINAL ACTIONS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={handleGenerateInvoice}
              disabled={billItems.length === 0}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', fontWeight: '700' }}
            >
              📄 Generate Invoice
            </button>

            <button 
              className="btn btn-secondary" 
              onClick={() => {
                if (billItems.length === 0) return alert("Empty Cart.");
                const mockBill = {
                  invoiceId: `BILL-PH-${Math.floor(10000 + Math.random() * 90000)}`,
                  patientId: patientId || 'WALK-IN',
                  patientName: patientName || 'Walk-in Customer',
                  rxNum: prescriptionNum || 'N/A',
                  items: [...billItems],
                  subtotal: getSubtotal(),
                  discount: getTotalDiscount(),
                  tax: getTax(),
                  grandTotal: getGrandTotal(),
                  paymentMethod,
                  amountReceived: amountReceived || getGrandTotal(),
                  changeReturn: getChangeReturn()
                };
                setPrintedBillData(mockBill);
                setShowPrintReceiptModal(true);
              }}
              disabled={billItems.length === 0}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', fontWeight: '700' }}
            >
              🖨️ Print Bill Receipt
            </button>

            <button 
              className="btn btn-secondary" 
              onClick={() => {
                if (billItems.length === 0) return alert("Empty Cart.");
                alert("Transaction draft saved locally in temporary cache database.");
              }}
              disabled={billItems.length === 0}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', fontWeight: '700' }}
            >
              💾 Save Transaction
            </button>

            <button 
              className="btn btn-emerald" 
              onClick={handleDispense}
              disabled={billItems.length === 0}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', fontWeight: '800', border: 'none', cursor: 'pointer', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
            >
              💊 Dispense Medicines
            </button>
          </div>

        </div>

      </div>

      {/* OVERLAY MODAL: LOAD PENDING RX FROM CLINIC CABINS */}
      {showLoadPrescriptionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '500px', backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>🩺 Consultations Pending Pharmacy Release</h3>
              <button onClick={() => setShowLoadPrescriptionModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '300px' }}>
              {prescriptions.map(rx => {
                const pat = patients.find(p => p.id === rx.patientId);
                return (
                  <div key={rx.id} style={{ padding: '14px', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '13px' }}>Rx #: <code>{rx.id}</code></strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                          Patient: {pat ? pat.name : 'Unknown'} ({rx.patientId})
                        </span>
                      </div>
                      
                      <button 
                        className={`btn ${rx.status === 'Fulfilled' ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        disabled={rx.status === 'Fulfilled'}
                        onClick={() => handleLoadPrescription(rx)}
                        style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px' }}
                      >
                        {rx.status === 'Fulfilled' ? '✓ Dispensed' : '🔌 Load Rx Items'}
                      </button>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border-color)', marginTop: '8px', paddingTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <strong>Diagnosis:</strong> {rx.diagnosis}<br />
                      <strong>Prescribed:</strong> {rx.meds.map(m => `${m.name} [${m.duration}]`).join(', ')}
                    </div>
                  </div>
                );
              })}
              {prescriptions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  No clinic prescriptions found in database.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY MODAL: THERMAL PRINT RECEIPT FOR CHECKOUT */}
      {showPrintReceiptModal && printedBillData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '380px', backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: '800', margin: 0 }}>🖨️ Thermal POS Bill Output</h3>
              <button onClick={() => { setShowPrintReceiptModal(false); setPrintedBillData(null); }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>

            {/* Thermal Print Graphic layout */}
            <div style={{ padding: '16px', border: '1px dashed #777', backgroundColor: '#fcfcfc', color: '#000000', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.4' }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>RK CLINIC PHARMACY</strong>
                <span>Healthcare & Dispensary Counter</span><br />
                <span>Sector 4, Diagnostic Lane</span><br />
                <span>PH: +91 9840123456</span>
              </div>

              <div style={{ borderBottom: '1px dashed #000', paddingBottom: '6px', marginBottom: '8px' }}>
                <div><strong>Bill Ref:</strong> {printedBillData.invoiceId}</div>
                <div><strong>Rx Reference:</strong> {printedBillData.rxNum}</div>
                <div><strong>Patient Name:</strong> {printedBillData.patientName} ({printedBillData.patientId})</div>
                <div><strong>Date/Time:</strong> {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '8px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px dashed #000', textAlign: 'left', fontWeight: 'bold' }}>
                    <th style={{ padding: '4px 0' }}>Item (Form)</th>
                    <th style={{ padding: '4px 0', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '4px 0', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '4px 0', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printedBillData.items.map((item, idx) => {
                    const rowTotal = item.qty * item.rate * (1 - item.discount / 100);
                    return (
                      <tr key={idx}>
                        <td style={{ padding: '4px 0' }}>{item.name} {item.strength}</td>
                        <td style={{ padding: '4px 0', textAlign: 'center' }}>{item.qty}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right' }}>{currency}{item.rate.toFixed(2)}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right' }}>{currency}{rowTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span>{currency}{printedBillData.subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Discount Given:</span>
                  <span>-{currency}{printedBillData.discount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>SGST + CGST (12%):</span>
                  <span>+{currency}{printedBillData.tax.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', borderTop: '1px double #000', paddingTop: '4px', marginTop: '2px' }}>
                  <span>NET PAYABLE:</span>
                  <span>{currency}{printedBillData.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #000', marginTop: '8px', paddingTop: '6px', fontSize: '10.5px' }}>
                <div><strong>Method Paid:</strong> {printedBillData.paymentMethod}</div>
                <div><strong>Cash Paid:</strong> {currency}{(parseFloat(printedBillData.amountReceived) || printedBillData.grandTotal).toFixed(2)}</div>
                <div><strong>Change Returned:</strong> {currency}{printedBillData.changeReturn.toFixed(2)}</div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '8px' }}>
                <strong>*** THANK YOU ***</strong><br />
                <span>Keep drugs in cool place out of child reach.</span><br />
                <span>POS Invoiced Secure Digital Audit</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => { setShowPrintReceiptModal(false); setPrintedBillData(null); }}>Close Counter</button>
              <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Real Print</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
