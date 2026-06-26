/*
   RK Clinic - Premium Healthcare Management System JS
   Reactive State Management, Charting, Interactive Modals, & Routing
*/

// ==================== INITIAL CLINIC DATABASE STATE ====================
const state = {
  currency: '$',
  doctorName: 'Abdul Kareem',
  doctorRole: 'Lead Cardiologist',
  clinicName: 'RK Clinic',
  
  // Seed In-take Patient Directory matching HIMS screenshot
  patients: [
    {
      id: 'ON0060564',
      name: 'Al Amin',
      age: 32,
      gender: 'Male',
      phone: '9440183421',
      email: 'al.amin@mail.com',
      blood: 'O-',
      allergies: 'None',
      address: 'Riyadh',
      visitStatus: 'Waiting',
      lastConsultation: 'Routine Dental scaling',
      dob: '2/12/1990',
      createdDate: '10/08/2023',
      visitTime: '10:00 AM',
      type: 'UPNC',
      status: 'Pending'
    },
    {
      id: 'ON0018674',
      name: 'Faraj Bin Ahmad',
      age: 23,
      gender: 'Male',
      phone: '8220019234',
      email: 'faraj.b@mail.com',
      blood: 'A+',
      allergies: 'None',
      address: 'Jeddah',
      visitStatus: 'In-Consultation',
      lastConsultation: 'Cardiology Checkup',
      dob: '10/08/2000',
      createdDate: '26/07/2023',
      visitTime: '08:20 PM',
      type: 'FNXX',
      status: 'Confirmed'
    },
    {
      id: 'ON0064236',
      name: 'Fayruz Husniya',
      age: 42,
      gender: 'Female',
      phone: '7200177890',
      email: 'fayruz@mail.com',
      blood: 'AB+',
      allergies: 'None',
      address: 'Dammam',
      visitStatus: 'Completed',
      lastConsultation: 'Cardiovascular Stress Test',
      dob: '11/11/1980',
      createdDate: '13/07/2023',
      visitTime: '07:11 AM',
      type: 'FPA+CCN',
      status: 'Confirmed'
    },
    {
      id: 'ON0080671',
      name: 'Muammar Ghazzawi',
      age: 20,
      gender: 'Male',
      phone: '9000156723',
      email: 'muammar@mail.com',
      blood: 'O+',
      allergies: 'Sulfa Drugs',
      address: 'Makkah',
      visitStatus: 'Waiting',
      lastConsultation: 'Minor Chest Bruising',
      dob: '07/04/2003',
      createdDate: '01/07/2023',
      visitTime: '05:13 PM',
      type: 'AUN',
      status: 'Pending'
    },
    {
      id: 'ON012975',
      name: 'Aaliyah Bin Salih',
      age: 20,
      gender: 'Female',
      phone: '9840123456',
      email: 'aaliyah@mail.com',
      blood: 'AB-',
      allergies: 'None',
      address: 'Medina',
      visitStatus: 'Scheduled',
      lastConsultation: 'Annual General Vitals',
      dob: '28/07/2020',
      createdDate: '10/06/2023',
      visitTime: '10:45 AM',
      type: 'DCP',
      status: 'Confirmed'
    }
  ],

  // Active OPD Consultation Queue (Linked by Patient ID)
  queue: [
    { token: '101', patientId: 'ON0018674', doctor: 'Dr. Abdul Kareem', specialty: 'Cardiology', status: 'In-Consultation', checkin: '09:15 AM' },
    { token: '102', patientId: 'ON0060564', doctor: 'Dr. Abdul Kareem', specialty: 'Cardiology', status: 'Waiting', checkin: '09:30 AM' },
    { token: '103', patientId: 'ON0080671', doctor: 'Dr. Abdul Kareem', specialty: 'Cardiology', status: 'Waiting', checkin: '10:00 AM' }
  ],

  // Inpatients admitted to Ward (IPD)
  inpatients: [
    { bed: 'Ward A - Bed 3', patientId: 'ON0060564', diagnosis: 'Acute Myocardial Infarction', date: '2026-06-02', doctor: 'Dr. Abdul Kareem', vitals: 'Pulse: 72, BP: 125/82', billing: 'Pending' },
    { bed: 'ICU - Bed 1', patientId: 'ON0018674', diagnosis: 'Severe Cardiac Arrhythmia', date: '2026-06-03', doctor: 'Dr. Abdul Kareem', vitals: 'Pulse: 98, BP: 140/90', billing: 'Covered (Insurance)' }
  ],

  // Timeline logs for Nursing Feed
  nursingNotes: [
    { time: '10 mins ago', author: 'Nurse Emily Smith, RN', priority: 'Critical', patientId: 'ON0060564', text: 'Administered 50mg Metoprolol. Patient pulse stabilized at 72bpm. Monitoring BP every 15 mins.' },
    { time: '1 hour ago', author: 'Nurse Jessica Taylor', priority: 'Routine', patientId: 'ON0018674', text: 'Normal ECG run. Inpatient resting comfortably. Oxygen levels stable at 98% on room air.' }
  ],

  // Drug Inventory Stock
  inventory: [
    { name: 'Metoprolol 50mg', category: 'Beta-blocker', stock: 12, threshold: 30, price: 1.20, expiry: '2027-08-30' },
    { name: 'Amlodipine 5mg', category: 'Beta-blocker', stock: 120, threshold: 25, price: 0.85, expiry: '2026-12-15' },
    { name: 'Amoxicillin 500mg', category: 'Antibiotic', stock: 24, threshold: 40, price: 2.10, expiry: '2027-04-18' },
    { name: 'Atorvastatin 20mg', category: 'Anticoagulant', stock: 350, threshold: 50, price: 1.50, expiry: '2028-02-22' },
    { name: 'Albuterol Inhaler', category: 'Inhaler', stock: 8, threshold: 10, price: 22.00, expiry: '2027-11-05' }
  ],

  // Patient prescriptions database
  prescriptions: [
    {
      id: 'RK-RX-701',
      date: '2026-06-04',
      patientId: 'ON0064236',
      diagnosis: 'Hypertensive Heart Disease',
      meds: [
        { name: 'Amlodipine 5mg', dose: '1-0-0 (after breakfast)', duration: '30 Days' },
        { name: 'Atorvastatin 20mg', dose: '0-0-1 (before bed)', duration: '30 Days' }
      ],
      symptoms: 'Mild chest heaviness, elevated BP 145/95 during last physical.',
      status: 'Fulfilled'
    }
  ],

  // Billing ledger invoices
  invoices: [
    { id: 'RK-INV-2026-01', date: '2026-06-04', patientId: 'ON0064236', amount: 350.00, mode: 'Card', status: 'Paid', items: [{ desc: 'Cardiovascular Stress Test', price: 250 }, { desc: 'Specialist Consultation', price: 100 }] },
    { id: 'RK-INV-2026-02', date: '2026-06-04', patientId: 'ON0060564', amount: 1500.00, mode: 'Insurance', status: 'Pending', items: [{ desc: 'Emergency Ward Admission Fee', price: 1000 }, { desc: 'ECG + Cardiac Diagnostics', price: 500 }] },
    { id: 'RK-INV-2026-03', date: '2026-06-04', patientId: 'ON0018674', amount: 480.00, mode: 'Cash', status: 'Paid', items: [{ desc: 'Consultation Fee', price: 150 }, { desc: 'ECG Diagnostics', price: 250 }, { desc: 'Pharmacy Dispense', price: 80 }] }
  ],

  // Future scheduled visits for the calendar
  appointments: [
    { date: '2026-06-04', time: '4:30 PM', patientId: 'ON0060564', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'procedure', title: 'Dental scaling and polishing', hospital: 'Al-Sheikh Bin Jalal Dental Hospital' },
    { date: '2026-06-08', time: '10:00 AM', patientId: 'ON0018674', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'appointment', title: 'Cardiology Checkup', hospital: 'RK Specialty Clinic' },
    { date: '2026-06-15', time: '02:00 PM', patientId: 'ON0064236', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'meeting', title: 'Clinical Review Session', hospital: 'RK Specialty Clinic' },
    { date: '2026-06-23', time: '11:00 AM', patientId: 'ON0080671', doctor: 'Abdul Kareem', status: 'Scheduled', type: 'procedure', title: 'Minor Surgery Follow-up', hospital: 'Al-Sheikh Bin Jalal Dental Hospital' }
  ]
};

// ==================== TEMPORARY FORM CACHES ====================
let tempPrescriptionMeds = [];
let tempBillingItems = [];

// ==================== DYNAMIC GRAPH CHART INSTANCES ====================
let chartGrowthInstance = null;
let chartRevenueInstance = null;
let chartSpecialtyInstance = null;
let chartMedicineInstance = null;
let chartLargeGrowthInstance = null;
let chartLargeSpecialtyInstance = null;

// ==================== CORE INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  initRouting();
  initModals();
  initFormSubmissions();
  initQueueSystem();
  initHistoryDrawer();
  initSearch();
  initScheduler();
  initSettings();
  
  // Render views & statistical charts
  renderAll();
  initCharts();
});

// ==================== ROUTING SYSTEM (TAB NAVIGATION) ====================
function initRouting() {
  const navItems = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.content-panel');
  const sidebar = document.getElementById('sidebar');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Manage Active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      const panelId = `panel-${item.getAttribute('data-panel')}`;
      panels.forEach(p => p.classList.remove('active'));
      
      const targetPanel = document.getElementById(panelId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
      
      // Close sidebar in responsive mobile view
      sidebar.classList.remove('mobile-open');
      
      // Clean temporary builders
      tempPrescriptionMeds = [];
      tempBillingItems = [];
      renderPrescriptionMedsTable();
      renderBillingItemsTable();
    });
  });
  
  // Responsive sidebar toggler (hamburger)
  const burger = document.getElementById('hamburger-btn');
  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('mobile-open');
  });
  
  // Close menu if clicking outside of it
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !burger.contains(e.target)) {
      sidebar.classList.remove('mobile-open');
    }
  });

  // Welcome date format
  const dateObj = new Date();
  const formatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('today-date-text').textContent = dateObj.toLocaleDateString('en-US', formatOptions);
}

// ==================== MODERN MODAL DIALOG CONTROLLER ====================
function initModals() {
  const modalButtons = [
    { btnId: 'action-new-patient', dialogId: 'dialog-register-patient' },
    { btnId: 'action-new-prescription', dialogId: 'dialog-new-prescription' },
    { btnId: 'action-new-billing', dialogId: 'dialog-new-billing' },
    { btnId: 'action-add-medicine', dialogId: 'dialog-add-medicine' },
    { btnId: 'opd-add-queue-btn', dialogId: 'dialog-register-patient' }, // Fallback to registration for new patient queue
    { btnId: 'ipd-admit-btn', dialogId: 'dialog-register-patient' }
  ];
  
  modalButtons.forEach(config => {
    const btn = document.getElementById(config.btnId);
    const dialog = document.getElementById(config.dialogId);
    if (btn && dialog) {
      btn.addEventListener('click', () => {
        dialog.showModal();
        // Custom updates when modal opens
        if (config.dialogId === 'dialog-new-prescription') {
          populateDropdownsForPrescriptions();
        } else if (config.dialogId === 'dialog-new-billing') {
          populateDropdownsForBilling();
        }
      });
    }
  });
  
  // Implement Mandatory LIGHT-DISMISS Fallback for non-supported browsers
  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach(dialog => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (isDialogContent) return;
        dialog.close();
      });
    }
  });
}

// Populate Selector options with current active patients
function populateDropdownsForPrescriptions() {
  const patientSelect = document.getElementById('presc-patient-select');
  const medicineSelect = document.getElementById('presc-med-select');
  
  patientSelect.innerHTML = state.patients.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');
  medicineSelect.innerHTML = state.inventory.map(m => `<option value="${m.name}">${m.name} [Stock: ${m.stock}]</option>`).join('');
}

function populateDropdownsForBilling() {
  const selectElement = document.getElementById('billing-patient-select');
  selectElement.innerHTML = state.patients.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');
}

// ==================== FORM SUBMISSIONS & TRANSACTION MUTATORS ====================
function initFormSubmissions() {
  
  // 1. Patient Registration Form (Modal)
  const modalRegForm = document.getElementById('modal-registration-form');
  modalRegForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(modalRegForm);
    addNewPatient(formData);
    modalRegForm.reset();
    document.getElementById('dialog-register-patient').close();
  });
  
  // 2. Patient Registration Form (Direct Portal page)
  const directRegForm = document.getElementById('direct-registration-form');
  directRegForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(directRegForm);
    addNewPatient(formData);
    directRegForm.reset();
    // Swap view to Dashboard after registration
    document.querySelector('[data-panel="dashboard"]').click();
  });
  
  // 3. Add Medication to current prescription script list
  const addMedBtn = document.getElementById('presc-add-med-btn');
  addMedBtn.addEventListener('click', () => {
    const medName = document.getElementById('presc-med-select').value;
    const dose = document.getElementById('presc-dose').value || '1-0-1 (after meals)';
    const duration = document.getElementById('presc-duration').value || '5';
    
    if (!medName) return;
    
    tempPrescriptionMeds.push({ name: medName, dose, duration: `${duration} Days` });
    renderPrescriptionMedsTable();
    
    // Clear inputs
    document.getElementById('presc-dose').value = '';
  });
  
  // 4. Submit Prescription Script
  const prescForm = document.getElementById('prescription-form');
  prescForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (tempPrescriptionMeds.length === 0) {
      alert('Please add at least one medication to the prescription list.');
      return;
    }
    
    const formData = new FormData(prescForm);
    const prescId = `RK-RX-${Math.floor(100 + Math.random() * 900)}`;
    const newRx = {
      id: prescId,
      date: new Date().toISOString().split('T')[0],
      patientId: formData.get('patientId'),
      diagnosis: formData.get('diagnosis'),
      meds: [...tempPrescriptionMeds],
      symptoms: formData.get('symptoms') || 'Fever, cough reported',
      status: 'Fulfilled'
    };
    
    // Decrease inventory stock
    newRx.meds.forEach(med => {
      const stockItem = state.inventory.find(item => item.name === med.name);
      if (stockItem) {
        // Mock decrementing quantity
        const durDays = parseInt(med.duration) || 5;
        const totalDoses = durDays * 2; // assume twice a day general
        stockItem.stock = Math.max(0, stockItem.stock - totalDoses);
      }
    });
    
    state.prescriptions.push(newRx);
    
    // Register visit to patient's medical history
    const patientObj = state.patients.find(p => p.id === newRx.patientId);
    if (patientObj) {
      patientObj.visitStatus = 'Completed';
      patientObj.lastConsultation = newRx.diagnosis;
    }
    
    // Update active token queue if patient exists in queue
    const queueIndex = state.queue.findIndex(q => q.patientId === newRx.patientId);
    if (queueIndex !== -1) {
      state.queue[queueIndex].status = 'Completed';
    }
    
    // Log nursing note
    state.nursingNotes.unshift({
      time: 'Just now',
      author: state.doctorName,
      priority: 'Routine',
      patientId: newRx.patientId,
      text: `Prescription ${newRx.id} generated for ${newRx.diagnosis}. Medication: ${newRx.meds.map(m => m.name).join(', ')}.`
    });
    
    // Refresh & display preview
    renderAll();
    updateChartsData();
    prescForm.reset();
    tempPrescriptionMeds = [];
    renderPrescriptionMedsTable();
    document.getElementById('dialog-new-prescription').close();
    
    // Open print preview
    triggerPrescriptionPrint(newRx);
  });
  
  // 5. Billing Charge Items builder
  const billingAddItemBtn = document.getElementById('billing-add-item-btn');
  billingAddItemBtn.addEventListener('click', () => {
    const desc = document.getElementById('bill-item-name').value;
    const priceVal = parseFloat(document.getElementById('bill-item-price').value);
    
    if (!desc || isNaN(priceVal)) return;
    
    tempBillingItems.push({ desc, price: priceVal });
    renderBillingItemsTable();
    
    // Clear inputs
    document.getElementById('bill-item-name').value = '';
    document.getElementById('bill-item-price').value = '';
  });
  
  // Discount input updates billing calculation
  document.getElementById('bill-discount-input').addEventListener('input', calculateInvoiceTotals);
  
  // 6. Submit Invoice Bill
  const billingForm = document.getElementById('billing-invoice-form');
  billingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (tempBillingItems.length === 0) {
      alert('Please add at least one charge item to the invoice.');
      return;
    }
    
    const formData = new FormData(billingForm);
    const subtotal = tempBillingItems.reduce((acc, curr) => acc + curr.price, 0);
    const discPct = parseFloat(document.getElementById('bill-discount-input').value) || 0;
    const finalAmount = subtotal * (1 - discPct / 100);
    
    const newInvoice = {
      id: `RK-INV-2026-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString().split('T')[0],
      patientId: formData.get('patientId'),
      amount: parseFloat(finalAmount.toFixed(2)),
      mode: formData.get('paymentMode'),
      status: formData.get('paymentMode') === 'Insurance' ? 'Pending' : 'Paid',
      items: [...tempBillingItems]
    };
    
    state.invoices.push(newInvoice);
    
    // If billing updates, increase the pharmacy/clinic revenue numbers
    renderAll();
    updateChartsData();
    billingForm.reset();
    tempBillingItems = [];
    renderBillingItemsTable();
    document.getElementById('dialog-new-billing').close();
    
    alert(`Authorized invoice ${newInvoice.id} successfully!`);
  });
  
  // 7. Add Medicine to Stock
  const medicineForm = document.getElementById('medicine-inventory-form');
  medicineForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(medicineForm);
    
    const newItem = {
      name: formData.get('name'),
      category: formData.get('category'),
      stock: parseInt(formData.get('stock')),
      threshold: parseInt(formData.get('threshold')),
      price: parseFloat(formData.get('price')),
      expiry: formData.get('expiry')
    };
    
    // Check if medicine already exists, if so append stock
    const existing = state.inventory.find(i => i.name.toLowerCase() === newItem.name.toLowerCase());
    if (existing) {
      existing.stock += newItem.stock;
    } else {
      state.inventory.push(newItem);
    }
    
    renderAll();
    updateChartsData();
    medicineForm.reset();
    document.getElementById('dialog-add-medicine').close();
  });
  
  // 8. Add direct Nursing Note log entries
  const nursingNoteForm = document.getElementById('nursing-note-form');
  nursingNoteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(nursingNoteForm);
    
    const newNote = {
      time: 'Just now',
      author: formData.get('nurseName'),
      priority: formData.get('priority'),
      patientId: formData.get('patientId'),
      text: formData.get('note')
    };
    
    state.nursingNotes.unshift(newNote);
    renderAll();
    nursingNoteForm.reset();
  });

  // 9. Export CSV Mock download
  const exportBtn = document.getElementById('export-reports-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Invoice ID,Date,Patient ID,Amount,Payment Mode,Status\n";
      state.invoices.forEach(inv => {
        csvContent += `${inv.id},${inv.date},${inv.patientId},${inv.amount},${inv.mode},${inv.status}\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "RK_Clinic_Revenue_Report.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
}

// Sub-procedure to commit a registered patient to state databases
function addNewPatient(formData) {
  const pId = `ON${Math.floor(1000000 + Math.random() * 9000000)}`;
  
  const currentYr = new Date().getFullYear();
  const birthYr = currentYr - parseInt(formData.get('age'));
  const dob = `15/06/${birthYr}`;

  const patient = {
    id: pId,
    name: formData.get('name'),
    age: parseInt(formData.get('age')),
    gender: formData.get('gender'),
    phone: formData.get('phone'),
    email: formData.get('email') || 'n/a',
    blood: formData.get('blood') || 'O+',
    allergies: formData.get('allergies') || 'None',
    address: formData.get('address') || 'n/a',
    visitStatus: 'Waiting',
    lastConsultation: 'Awaiting Examination',
    dob: dob,
    createdDate: new Date().toLocaleDateString('en-GB'),
    visitTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    type: 'UPNC',
    status: 'Confirmed'
  };
  
  state.patients.push(patient);
  
  // Push patient automatically to the Active Consultation Queue
  const nextToken = (state.queue.length + 101).toString();
  state.queue.push({
    token: nextToken,
    patientId: pId,
    doctor: state.doctorName,
    specialty: 'General Consultation',
    status: 'Waiting',
    checkin: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  });
  
  // Insert patient log history
  state.nursingNotes.unshift({
    time: 'Just now',
    author: 'Frontdesk Clerk',
    priority: 'Routine',
    patientId: pId,
    text: `Patient registered to clinic records. Status assigned: OPD Waiting. Token: ${nextToken}`
  });
  
  renderAll();
  updateChartsData();
  alert(`Patient ${patient.name} registered. Assign Token Number: ${nextToken}`);
}

// Prescription Medicine List renderer inside form
function renderPrescriptionMedsTable() {
  const listBody = document.getElementById('presc-meds-list-body');
  listBody.innerHTML = tempPrescriptionMeds.map((med, index) => `
    <tr>
      <td><strong>${med.name}</strong></td>
      <td>${med.dose}</td>
      <td>${med.duration}</td>
      <td>
        <button type="button" class="med-delete-btn" onclick="removeTempRxMed(${index})">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

window.removeTempRxMed = function(idx) {
  tempPrescriptionMeds.splice(idx, 1);
  renderPrescriptionMedsTable();
};

// Billing item list table renderer
function renderBillingItemsTable() {
  const listBody = document.getElementById('billing-items-list-body');
  listBody.innerHTML = tempBillingItems.map((item, index) => `
    <tr>
      <td>${item.desc}</td>
      <td>${state.currency}${item.price.toFixed(2)}</td>
      <td>
        <button type="button" class="med-delete-btn" onclick="removeTempBillingItem(${index})">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
  calculateInvoiceTotals();
}

window.removeTempBillingItem = function(idx) {
  tempBillingItems.splice(idx, 1);
  renderBillingItemsTable();
};

function calculateInvoiceTotals() {
  const subtotal = tempBillingItems.reduce((acc, curr) => acc + curr.price, 0);
  const discountPct = parseFloat(document.getElementById('bill-discount-input').value) || 0;
  const grandTotal = subtotal * (1 - discountPct / 100);
  
  document.getElementById('bill-subtotal').textContent = `${state.currency}${subtotal.toFixed(2)}`;
  document.getElementById('bill-grand-total').textContent = `${state.currency}${grandTotal.toFixed(2)}`;
}

// Generate receipt preview for prescriptions
function triggerPrescriptionPrint(rx) {
  const preview = document.getElementById('prescription-print-preview-container');
  const patient = state.patients.find(p => p.id === rx.patientId);
  
  preview.innerHTML = `
    <div class="prescription-print-header">
      <div>
        <h2 style="font-family:var(--font-title); font-weight:700;">${state.clinicName}</h2>
        <span style="font-size:12px;">Premium Cardiology & Health Services</span>
      </div>
      <div style="text-align:right;">
        <strong>Date:</strong> ${rx.date}<br>
        <strong>Rx ID:</strong> ${rx.id}
      </div>
    </div>
    <div class="prescription-print-body">
      <div>
        <strong>Patient Name:</strong> ${patient ? patient.name : 'Unknown'}<br>
        <strong>Age / Gender:</strong> ${patient ? patient.age : 'n/a'} / ${patient ? patient.gender : 'n/a'}<br>
        <strong>Patient ID:</strong> ${rx.patientId}
      </div>
      <div style="margin-top:16px; border-top:1px solid #333; padding-top:12px;">
        <span style="font-size:24px; font-weight:700; font-family:var(--font-title);">℞</span>
        <table style="width:100%; border-collapse:collapse; margin-top:8px;">
          <thead>
            <tr style="border-bottom:1px solid #333; text-align:left; font-size:12px;">
              <th style="padding:6px 0;">Medicine Brand</th>
              <th style="padding:6px 0;">Dosage Instructions</th>
              <th style="padding:6px 0;">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${rx.meds.map(med => `
              <tr style="font-size:13.5px; border-bottom:1.5px dashed #ccc;">
                <td style="padding:8px 0;"><strong>${med.name}</strong></td>
                <td style="padding:8px 0;">${med.dose}</td>
                <td style="padding:8px 0;">${med.duration}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:16px;">
        <strong>Diagnosis:</strong> ${rx.diagnosis}<br>
        <strong>Physician Notes:</strong> ${rx.symptoms}
      </div>
      <div style="margin-top:40px; border-top:1px solid #eee; padding-top:12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-size:11px;">Always consult your physician for clinical instructions.</span>
        </div>
        <div style="text-align:right;">
          <br><br>
          <strong>${state.doctorName}</strong><br>
          <span style="font-size:11px; color:#555;">${state.doctorRole}</span>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('dialog-print-prescription').showModal();
}

// ==================== LIVE ACTIVE CONSULTATION QUEUE CONTROLLER ====================
function initQueueSystem() {
  const callNextBtn = document.getElementById('queue-call-next-btn');
  callNextBtn.addEventListener('click', () => {
    // 1. Mark in-consultation patient as Completed
    const currentActive = state.queue.find(q => q.status === 'In-Consultation');
    if (currentActive) {
      currentActive.status = 'Completed';
      
      const pat = state.patients.find(p => p.id === currentActive.patientId);
      if (pat) pat.visitStatus = 'Completed';
    }
    
    // 2. Call next waiting patient
    const nextWaiting = state.queue.find(q => q.status === 'Waiting');
    if (nextWaiting) {
      nextWaiting.status = 'In-Consultation';
      
      const pat = state.patients.find(p => p.id === nextWaiting.patientId);
      if (pat) {
        pat.visitStatus = 'In-Consultation';
        
        // Add note log
        state.nursingNotes.unshift({
          time: 'Just now',
          author: state.doctorName,
          priority: 'Routine',
          patientId: pat.id,
          text: `Patient ${pat.name} called into examination room (Cabin A). Token: ${nextWaiting.token}.`
        });
      }
      
      alert(`Calling Token #${nextWaiting.token} (${pat ? pat.name : 'Unknown'}) to consultation room.`);
    } else {
      alert('All queued patients have been processed today.');
    }
    
    renderAll();
  });
}

// ==================== SEARCH & FILTERS ALGORITHM ====================
function initSearch() {
  const globalSearchInput = document.getElementById('global-search');
  const directorySearchInput = document.getElementById('patient-directory-search');
  
  globalSearchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderAll();
      return;
    }
    
    // If global search has input, redirect dashboard table or navigate directory panel
    filterPatientsDirectory(q);
  });
  
  directorySearchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    filterPatientsDirectory(q);
  });
}

function filterPatientsDirectory(query) {
  const filtered = state.patients.filter(p => 
    p.name.toLowerCase().includes(query) || 
    p.id.toLowerCase().includes(query) || 
    p.phone.includes(query)
  );
  
  // Render tables directly with filtered arrays
  renderRecentPatients(filtered);
  renderPatientDirectory(filtered);
}

// ==================== PATIENT CHRONOLOGICAL TIMELINE DRAWER ====================
function initHistoryDrawer() {
  const drawer = document.getElementById('patient-history-drawer');
  const closeBtn = document.getElementById('close-history-drawer-btn');
  
  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('open');
  });
}

window.openHistoryDrawer = function(patientId) {
  const drawer = document.getElementById('patient-history-drawer');
  const pat = state.patients.find(p => p.id === patientId);
  
  if (!pat) return;
  
  // General Demographics Info
  document.getElementById('drawer-patient-avatar').textContent = pat.name.split(' ').map(n => n[0]).join('');
  document.getElementById('drawer-patient-name').textContent = pat.name;
  document.getElementById('drawer-patient-id').textContent = `Patient ID: ${pat.id}`;
  document.getElementById('drawer-patient-age-gender').textContent = `${pat.age} / ${pat.gender}`;
  document.getElementById('drawer-patient-blood').textContent = pat.blood;
  document.getElementById('drawer-patient-phone').textContent = pat.phone;
  document.getElementById('drawer-patient-allergies').textContent = pat.allergies;
  document.getElementById('drawer-patient-address').textContent = pat.address;
  
  // Compile Chronological History Logs
  const timelineFeed = document.getElementById('drawer-timeline-feed');
  
  // Gather elements for patient: invoices, prescriptions, nursingNotes
  const items = [];
  
  state.invoices.filter(i => i.patientId === patientId).forEach(inv => {
    items.push({
      date: inv.date,
      type: 'Billing Invoice',
      tagClass: 'emerald',
      content: `Invoice ${inv.id} authorized for <strong>${state.currency}${inv.amount.toFixed(2)}</strong>. Payment Mode: ${inv.mode}. Status: ${inv.status}.`
    });
  });
  
  state.prescriptions.filter(rx => rx.patientId === patientId).forEach(rx => {
    items.push({
      date: rx.date,
      type: 'Prescription Issued',
      tagClass: 'teal',
      content: `Diagnosis of <strong>${rx.diagnosis}</strong>. Medications: ${rx.meds.map(m => m.name).join(', ')}.`
    });
  });
  
  state.nursingNotes.filter(n => n.patientId === patientId).forEach(note => {
    items.push({
      date: note.time.includes('ago') || note.time.includes('now') ? 'Today' : note.time,
      type: `Nursing log by ${note.author}`,
      tagClass: note.priority === 'Critical' ? 'rose' : 'primary',
      content: note.text
    });
  });
  
  // Sort items by date (mock sorting since some dates are strings, let's sort roughly)
  items.sort((a, b) => b.date.localeCompare(a.date));
  
  if (items.length === 0) {
    timelineFeed.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px 0;">No chronological medical logs exist.</div>`;
  } else {
    timelineFeed.innerHTML = items.map(item => `
      <div class="timeline-note-item ${item.tagClass}">
        <div class="timeline-note-dot"></div>
        <div class="timeline-note-header">
          <span class="timeline-note-author">${item.type}</span>
          <span>${item.date}</span>
        </div>
        <div class="timeline-note-content">${item.content}</div>
      </div>
    `).join('');
  }
  
  drawer.classList.add('open');
};

// ==================== CALENDAR APPOINTMENTS SCHEDULER ====================
let selectedCalendarDate = '2026-06-04';
let currentYear = 2026;
let currentMonth = 5; // June (0-indexed)

function initScheduler() {
  // Calendar Navigation
  const prevBtn = document.getElementById('hims-calendar-prev');
  const nextBtn = document.getElementById('hims-calendar-next');
  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar();
    });
    nextBtn.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar();
    });
  }

  // Segmented Theme Switcher
  const themeLightBtn = document.getElementById('theme-light-btn');
  const themeDarkBtn = document.getElementById('theme-dark-btn');
  if (themeLightBtn && themeDarkBtn) {
    themeLightBtn.addEventListener('click', () => {
      document.body.classList.remove('dark-mode');
      themeLightBtn.classList.add('active');
      themeDarkBtn.classList.remove('active');
      localStorage.setItem('hims-theme', 'light');
    });
    themeDarkBtn.addEventListener('click', () => {
      document.body.classList.add('dark-mode');
      themeDarkBtn.classList.add('active');
      themeLightBtn.classList.remove('active');
      localStorage.setItem('hims-theme', 'dark');
    });

    if (localStorage.getItem('hims-theme') === 'dark') {
      themeDarkBtn.click();
    }
  }

  // Quick Actions dropdown handler
  const quickActionsBtn = document.getElementById('quick-actions-btn');
  const quickActionsDropdown = document.getElementById('quick-actions-dropdown');
  if (quickActionsBtn && quickActionsDropdown) {
    quickActionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const visible = quickActionsDropdown.style.display === 'flex';
      quickActionsDropdown.style.display = visible ? 'none' : 'flex';
      quickActionsDropdown.style.flexDirection = 'column';
    });
    document.addEventListener('click', () => {
      quickActionsDropdown.style.display = 'none';
    });
  }

  // Connect bottom HIMS search
  const himsSearch = document.getElementById('hims-patient-search');
  if (himsSearch) {
    himsSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = state.patients.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.id.toLowerCase().includes(q) || 
        p.dob.includes(q) ||
        p.type.toLowerCase().includes(q)
      );
      renderHimsPatientsTable(filtered);
    });
  }

  // Select all checkbox
  const selectAllCheckbox = document.getElementById('hims-select-all-checkbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const checkboxes = document.querySelectorAll('#hims-patients-table-body .hims-checkbox');
      checkboxes.forEach(cb => cb.checked = checked);
    });
  }

  // HIMS View All Button redirects to Patient Directory
  const himsViewAllBtn = document.getElementById('hims-view-all-btn');
  if (himsViewAllBtn) {
    himsViewAllBtn.addEventListener('click', () => {
      const emrTab = document.querySelector('[data-panel="patient-management"]');
      if (emrTab) emrTab.click();
    });
  }
}

function renderCalendar() {
  const container = document.getElementById('hims-calendar-grid-container');
  if (!container) return;
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById('hims-calendar-month-year').textContent = `${monthNames[currentMonth]} ${currentYear}`;
  
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  let html = '';
  
  // Render day names
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  dayNames.forEach(name => {
    html += `<div class="hims-calendar-day-name">${name}</div>`;
  });
  
  // Empty slots before 1st of month (aligning to Mon-Sun index)
  const startingOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  for (let i = 0; i < startingOffset; i++) {
    html += `<div class="hims-calendar-day other-month"></div>`;
  }
  
  // Render month dates
  for (let day = 1; day <= daysInMonth; day++) {
    const formattedMonth = (currentMonth + 1).toString().padStart(2, '0');
    const formattedDay = day.toString().padStart(2, '0');
    const dateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;
    const isActive = dateStr === selectedCalendarDate ? 'active' : '';
    
    // Check bookings and get corresponding class
    const bookings = state.appointments.filter(a => a.date === dateStr);
    let dotHtml = '';
    if (bookings.length > 0) {
      const bType = bookings[0].type || 'appointment';
      dotHtml = `<span class="hims-calendar-day-dot ${bType.toLowerCase()}"></span>`;
    }
    
    html += `
      <div class="hims-calendar-day ${isActive}" onclick="selectCalendarDate('${dateStr}')">
        <span>${day}</span>
        ${dotHtml}
      </div>
    `;
  }
  
  container.innerHTML = html;
  renderAppointmentsForDate(selectedCalendarDate);
}

window.selectCalendarDate = function(dateStr) {
  selectedCalendarDate = dateStr;
  renderCalendar();
};

function renderAppointmentsForDate(dateStr) {
  const container = document.getElementById('hims-calendar-schedule-details');
  if (!container) return;
  
  const bookings = state.appointments.filter(a => a.date === dateStr);
  if (bookings.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:11px; padding:12px 0;">No schedule for this day.</div>`;
    return;
  }
  
  const dateObj = new Date(dateStr);
  const dayStr = dateObj.getDate();
  const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthStr = monthNamesShort[dateObj.getMonth()];
  const yearStr = dateObj.getFullYear();
  
  container.innerHTML = bookings.map(b => {
    return `
      <div class="hims-calendar-schedule-card">
        <div class="hims-schedule-date-box">
          <span style="font-size:14px;">${dayStr}</span>
          <span>${monthStr} ${yearStr}</span>
        </div>
        <div class="hims-schedule-info">
          <div class="hims-schedule-title">${b.title || 'General Consultation'}</div>
          <div class="hims-schedule-meta">
            <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            <span>${b.hospital || 'RK Clinic'}</span>
          </div>
          <div class="hims-schedule-meta">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>${b.time}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderHimsPatientsTable(patientsArray) {
  const container = document.getElementById('hims-patients-table-body');
  if (!container) return;
  
  container.innerHTML = patientsArray.map((p, index) => {
    const srNo = (index + 1).toString().padStart(2, '0');
    const badgeClass = p.status.toLowerCase() === 'confirmed' ? 'confirmed' : 'pending';
    
    return `
      <tr onclick="openHistoryDrawer('${p.id}')">
        <td onclick="event.stopPropagation()"><input type="checkbox" class="hims-checkbox"></td>
        <td>${srNo}</td>
        <td><strong>${p.id}</strong></td>
        <td>
          <div class="patient-cell">
            <div class="patient-avatar" style="background-color: var(--primary-light); color: var(--primary); font-weight: 700;">
              ${p.name.split(' ').map(n => n[0]).join('')}
            </div>
            <strong>${p.name}</strong>
          </div>
        </td>
        <td>${p.dob}</td>
        <td>${p.gender === 'Male' ? 'M' : 'F'}</td>
        <td>${p.age}Y</td>
        <td>${p.createdDate}</td>
        <td>${p.visitTime}</td>
        <td>${p.type}</td>
        <td><span class="hims-badge ${badgeClass}">${p.status}</span></td>
        <td style="text-align:right; font-weight:700; font-size:16px;" onclick="event.stopPropagation()">
          <span style="cursor:pointer; padding:4px;">...</span>
        </td>
      </tr>
    `;
  }).join('');
}

// ==================== SETTINGS MODULATOR ====================
function initSettings() {
  const saveProfileBtn = document.getElementById('save-profile-settings-btn');
  saveProfileBtn.addEventListener('click', () => {
    state.doctorName = document.getElementById('settings-doc-name').value;
    state.doctorRole = document.getElementById('settings-doc-role').value;
    
    // Update top right header
    document.querySelector('.user-name').textContent = state.doctorName;
    document.querySelector('.user-role').textContent = state.doctorRole;
    
    // Update welcome message
    document.getElementById('welcome-message').textContent = `Good Evening, ${state.doctorName}`;
    
    alert('Doctor clinical settings saved successfully!');
  });
  
  const saveClinicBtn = document.getElementById('save-clinic-settings-btn');
  saveClinicBtn.addEventListener('click', () => {
    state.clinicName = document.getElementById('settings-clinic-name').value;
    state.currency = document.getElementById('settings-currency').value;
    
    // Update logo text
    document.querySelector('.sidebar-logo-text').textContent = state.clinicName;
    
    renderAll();
    updateChartsData();
    alert('Clinic structural configurations updated!');
  });
}

// ==================== RENDERS ENGINE (STATE TO HTML) ====================
function renderAll() {
  // Update HIMS statistics if they exist
  const elProcedures = document.getElementById('hims-procedures-count');
  if (elProcedures) elProcedures.textContent = (15813 + state.appointments.length).toString();
  
  const elVisits = document.getElementById('hims-visits-count');
  if (elVisits) elVisits.textContent = (62 + state.patients.length).toString();
  
  const elPrescribed = document.getElementById('hims-prescribed-count');
  if (elPrescribed) elPrescribed.textContent = (21 + state.prescriptions.length).toString();
  
  const elTotalPat = document.getElementById('hims-total-patients-num');
  if (elTotalPat) elTotalPat.textContent = (26710 + state.patients.length).toString();

  // Keep updating notification count
  const elNotif = document.getElementById('notif-count');
  if (elNotif) elNotif.textContent = state.inventory.filter(i => i.stock <= i.threshold).length.toString();

  // Safe checks for old stats
  const elPatients = document.getElementById('stat-patients');
  if (elPatients) elPatients.textContent = state.patients.length;
  
  const elActiveConsult = document.getElementById('stat-active-consult');
  if (elActiveConsult) elActiveConsult.textContent = state.queue.filter(q => q.status === 'In-Consultation' || q.status === 'Waiting').length;
  
  const elRevenue = document.getElementById('stat-revenue');
  if (elRevenue) {
    const totalRevenue = state.invoices.reduce((sum, inv) => sum + inv.amount, 0);
    elRevenue.textContent = `${state.currency}${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  }
  
  const elPharmSales = document.getElementById('stat-pharmacy-sales');
  if (elPharmSales) {
    const pharmacyRevenue = state.invoices.filter(inv => inv.items.some(i => i.desc.toLowerCase().includes('pharmacy') || i.desc.toLowerCase().includes('medicine'))).reduce((sum, inv) => sum + inv.amount, 0);
    elPharmSales.textContent = `${state.currency}${pharmacyRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  }
  
  const elPendingBills = document.getElementById('stat-pending-bills');
  if (elPendingBills) elPendingBills.textContent = state.invoices.filter(i => i.status === 'Pending').length;
  
  const elLowStock = document.getElementById('stat-low-stock');
  if (elLowStock) elLowStock.textContent = state.inventory.filter(i => i.stock <= i.threshold).length;
  
  // Render sub lists
  renderRecentPatients(state.patients);
  renderPatientQueue();
  renderClinicalTimeline();
  renderPharmacyInventoryAlerts();
  renderOutstandingBilling();
  
  // Sub page panels
  renderPatientDirectory(state.patients);
  renderOpdTable();
  renderIpdTable();
  renderNursingNotesFeed();
  renderPharmacyFulfillmentQueue();
  renderDrugInventoryTable();
  renderBillingTable();
  renderCalendar();
  
  // Render HIMS bottom table
  renderHimsPatientsTable(state.patients);
  
  // Populates dropdown selects in widgets
  const nursingPatSelect = document.getElementById('nursing-patient-select');
  if (nursingPatSelect) {
    nursingPatSelect.innerHTML = state.patients.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');
  }
}

// 1. Dashboard: Recent Patients
function renderRecentPatients(patientsArray) {
  const container = document.getElementById('recent-patients-table-body');
  container.innerHTML = patientsArray.slice(0, 5).map(p => {
    let badgeClass = 'badge-sky';
    if (p.visitStatus === 'Completed') badgeClass = 'badge-emerald';
    if (p.visitStatus === 'In-Consultation') badgeClass = 'badge-teal';
    if (p.visitStatus === 'Waiting') badgeClass = 'badge-amber';
    
    return `
      <tr onclick="openHistoryDrawer('${p.id}')">
        <td><strong>${p.id}</strong></td>
        <td>
          <div class="patient-cell">
            <div class="patient-avatar">${p.name.split(' ').map(n => n[0]).join('')}</div>
            <strong>${p.name}</strong>
          </div>
        </td>
        <td>${p.age}</td>
        <td>${p.phone}</td>
        <td><span class="badge ${badgeClass}">${p.visitStatus}</span></td>
        <td>${p.lastConsultation}</td>
      </tr>
    `;
  }).join('');
}

// 2. Dashboard: OPD Queue
function renderPatientQueue() {
  const container = document.getElementById('queue-list-container');
  container.innerHTML = state.queue.filter(q => q.status !== 'Completed').map(q => {
    const pat = state.patients.find(p => p.id === q.patientId);
    let isConsulting = q.status === 'In-Consultation';
    let itemClass = isConsulting ? 'border-color: var(--teal); background-color: var(--teal-light);' : '';
    
    return `
      <div class="queue-item" style="${itemClass}">
        <div class="queue-item-left">
          <div class="queue-token" style="${isConsulting ? 'background-color: var(--teal); color:white;' : ''}">${q.token}</div>
          <div>
            <div class="queue-info-name">${pat ? pat.name : 'Unknown'}</div>
            <div class="queue-info-meta">Checked-in: ${q.checkin} | Wait: 15m</div>
          </div>
        </div>
        <div class="queue-item-right">
          <span class="badge ${isConsulting ? 'badge-teal' : 'badge-amber'}">${q.status}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 3. Dashboard: Clinical timeline feed
function renderClinicalTimeline() {
  const container = document.getElementById('clinical-feed-container');
  container.innerHTML = state.nursingNotes.slice(0, 3).map(note => {
    const pat = state.patients.find(p => p.id === note.patientId);
    let dotClass = 'primary';
    if (note.priority === 'Critical') dotClass = 'rose';
    if (note.priority === 'Warning') dotClass = 'teal';
    
    return `
      <div class="timeline-note-item ${dotClass}">
        <div class="timeline-note-dot"></div>
        <div class="timeline-note-header">
          <span class="timeline-note-author">${note.author} (${pat ? pat.name : 'All'})</span>
          <span>${note.time}</span>
        </div>
        <div class="timeline-note-content">${note.text}</div>
      </div>
    `;
  }).join('');
}

// 4. Dashboard: Pharmacy Warnings
function renderPharmacyInventoryAlerts() {
  const container = document.getElementById('pharmacy-alerts-container');
  const alertItems = state.inventory.filter(i => i.stock <= i.threshold);
  
  if (alertItems.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:13px;">
        All drugs in-stock above margin limits.
      </div>
    `;
    return;
  }
  
  container.innerHTML = alertItems.slice(0, 3).map(item => `
    <div class="inventory-item warning">
      <div>
        <div class="inventory-name">${item.name}</div>
        <div class="inventory-meta">Category: ${item.category} | Threshold: ${item.threshold}</div>
      </div>
      <div class="inventory-stock">
        <div class="inventory-qty">${item.stock} left</div>
        <button class="btn btn-rose btn-sm" onclick="restockMedicine('${item.name}')" style="padding: 2px 8px; font-size:11px; margin-top:4px;">Restock</button>
      </div>
    </div>
  `).join('');
}

window.restockMedicine = function(name) {
  const item = state.inventory.find(i => i.name === name);
  if (item) {
    item.stock += 100;
    renderAll();
    updateChartsData();
    alert(`Restocked 100 units of ${name}.`);
  }
};

// 5. Dashboard: Outstanding invoices
function renderOutstandingBilling() {
  const container = document.getElementById('billing-outstanding-body');
  const outstanding = state.invoices.filter(i => i.status === 'Pending');
  
  if (outstanding.length === 0) {
    container.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No outstanding invoices.</td></tr>`;
    return;
  }
  
  container.innerHTML = outstanding.slice(0, 4).map(inv => {
    const pat = state.patients.find(p => p.id === inv.patientId);
    return `
      <tr>
        <td><strong>${pat ? pat.name : 'Unknown'}</strong></td>
        <td style="color:var(--rose); font-weight:700;">${state.currency}${inv.amount.toFixed(2)}</td>
        <td>
          <button class="btn btn-emerald btn-sm" onclick="payInvoice('${inv.id}')" style="padding: 4px 8px; font-size:11px;">Collect</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.payInvoice = function(invId) {
  const inv = state.invoices.find(i => i.id === invId);
  if (inv) {
    inv.status = 'Paid';
    renderAll();
    updateChartsData();
    alert(`Invoice ${invId} successfully recorded as PAID!`);
  }
};

// 6. MODULE: Full Directory Listing
function renderPatientDirectory(arr) {
  const container = document.getElementById('directory-table-body');
  container.innerHTML = arr.map(p => `
    <tr onclick="openHistoryDrawer('${p.id}')">
      <td><strong>${p.id}</strong></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.age} yrs / ${p.gender}</td>
      <td>${p.phone}</td>
      <td>${p.email}</td>
      <td><span class="badge badge-sky">${p.blood}</span></td>
      <td style="font-size:12px; color:var(--text-secondary); max-width:200px;">${p.allergies}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openHistoryDrawer('${p.id}')" style="padding: 4px 8px; font-size:11px;">View History</button>
      </td>
    </tr>
  `).join('');
}

// 7. MODULE: OPD Management table
function renderOpdTable() {
  const container = document.getElementById('opd-table-body');
  container.innerHTML = state.queue.map(q => {
    const pat = state.patients.find(p => p.id === q.patientId);
    let badgeClass = 'badge-sky';
    if (q.status === 'Completed') badgeClass = 'badge-emerald';
    if (q.status === 'In-Consultation') badgeClass = 'badge-teal';
    if (q.status === 'Waiting') badgeClass = 'badge-amber';
    
    return `
      <tr>
        <td><strong>${q.token}</strong></td>
        <td><strong>${pat ? pat.name : 'Unknown'}</strong></td>
        <td>${q.doctor}</td>
        <td>${q.specialty}</td>
        <td><span class="badge ${badgeClass}">${q.status}</span></td>
        <td>${q.checkin}</td>
        <td>
          ${q.status !== 'Completed' ? `<button class="btn btn-secondary btn-sm" onclick="resolveQueueToken('${q.token}')" style="padding: 4px 8px; font-size:11px;">Mark Finished</button>` : '—'}
        </td>
      </tr>
    `;
  }).join('');
}

window.resolveQueueToken = function(token) {
  const item = state.queue.find(q => q.token === token);
  if (item) {
    item.status = 'Completed';
    const pat = state.patients.find(p => p.id === item.patientId);
    if (pat) pat.visitStatus = 'Completed';
    renderAll();
  }
};

// 8. MODULE: IPD Bed table
function renderIpdTable() {
  const container = document.getElementById('ipd-table-body');
  container.innerHTML = state.inpatients.map(ip => {
    const pat = state.patients.find(p => p.id === ip.patientId);
    return `
      <tr>
        <td><strong>${ip.bed}</strong></td>
        <td>
          <div class="patient-cell">
            <strong>${pat ? pat.name : 'Unknown'}</strong>
          </div>
        </td>
        <td>${ip.diagnosis}</td>
        <td>${ip.date}</td>
        <td>${ip.doctor}</td>
        <td style="font-size:12px;"><code>${ip.vitals}</code></td>
        <td><span class="badge ${ip.billing === 'Pending' ? 'badge-amber' : 'badge-emerald'}">${ip.billing}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="dischargeInpatient('${ip.patientId}')" style="padding: 4px 8px; font-size:11px;">Discharge</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.dischargeInpatient = function(patId) {
  const index = state.inpatients.findIndex(ip => ip.patientId === patId);
  if (index !== -1) {
    const inpatient = state.inpatients[index];
    state.inpatients.splice(index, 1);
    
    // Add bill
    state.invoices.push({
      id: `RK-INV-2026-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString().split('T')[0],
      patientId: patId,
      amount: 1200.00,
      mode: 'Cash',
      status: 'Paid',
      items: [{ desc: `Ward Admission Discharge fee [${inpatient.bed}]`, price: 1200 }]
    });
    
    renderAll();
    updateChartsData();
    alert("Inpatient discharged and invoice recorded.");
  }
};

// 9. MODULE: Nursing Notes documentation listing
function renderNursingNotesFeed() {
  const container = document.getElementById('nursing-feed-container');
  container.innerHTML = state.nursingNotes.map(note => {
    const pat = state.patients.find(p => p.id === note.patientId);
    let labelClass = 'badge-sky';
    if (note.priority === 'Critical') labelClass = 'badge-rose';
    if (note.priority === 'Warning') labelClass = 'badge-amber';
    
    return `
      <div class="timeline-note-item" style="margin-bottom:16px;">
        <div class="timeline-note-dot"></div>
        <div class="timeline-note-header">
          <strong>${note.author} &mdash; ${pat ? pat.name : 'Unknown'} (${note.patientId})</strong>
          <span>${note.time}</span>
        </div>
        <div style="margin-top:4px; margin-bottom:4px;">
          <span class="badge ${labelClass}">${note.priority}</span>
        </div>
        <div class="timeline-note-content">${note.text}</div>
      </div>
    `;
  }).join('');
}

// 10. MODULE: Pharmacy Fulfillment queue table
function renderPharmacyFulfillmentQueue() {
  const container = document.getElementById('pharmacy-fulfillment-table-body');
  container.innerHTML = state.prescriptions.map(rx => {
    const pat = state.patients.find(p => p.id === rx.patientId);
    return `
      <tr>
        <td>${rx.date}</td>
        <td><strong>${rx.id}</strong></td>
        <td><strong>${pat ? pat.name : 'Unknown'}</strong></td>
        <td>${rx.diagnosis}</td>
        <td style="font-size:12px;">${rx.meds.map(m => `${m.name} (${m.duration})`).join(', ')}</td>
        <td><span class="badge ${rx.status === 'Fulfilled' ? 'badge-emerald' : 'badge-amber'}">${rx.status}</span></td>
        <td>
          ${rx.status !== 'Fulfilled' ? `<button class="btn btn-emerald btn-sm" onclick="fulfillPrescription('${rx.id}')" style="padding: 4px 8px; font-size:11px;">Fulfill & Dispense</button>` : `<button class="btn btn-secondary btn-sm" onclick="printRxFromHistory('${rx.id}')" style="padding: 4px 8px; font-size:11px;">Print rx</button>`}
        </td>
      </tr>
    `;
  }).join('');
}

window.fulfillPrescription = function(rxId) {
  const rx = state.prescriptions.find(r => r.id === rxId);
  if (rx) {
    rx.status = 'Fulfilled';
    renderAll();
  }
};

window.printRxFromHistory = function(rxId) {
  const rx = state.prescriptions.find(r => r.id === rxId);
  if (rx) triggerPrescriptionPrint(rx);
};

// 11. MODULE: Full Drug inventory database
function renderDrugInventoryTable() {
  const container = document.getElementById('inventory-table-body');
  container.innerHTML = state.inventory.map(item => {
    const lowStock = item.stock <= item.threshold;
    return `
      <tr style="${lowStock ? 'background-color: var(--rose-light);' : ''}">
        <td><strong>${item.name}</strong></td>
        <td>${item.category}</td>
        <td style="font-weight:700; ${lowStock ? 'color:var(--rose);' : ''}">${item.stock} Units</td>
        <td>${item.threshold}</td>
        <td>${state.currency}${item.price.toFixed(2)}</td>
        <td>${item.expiry}</td>
        <td>
          <span class="badge ${lowStock ? 'badge-rose' : 'badge-emerald'}">${lowStock ? 'Low Stock' : 'Good'}</span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="restockMedicine('${item.name}')" style="padding: 4px 8px; font-size:11px;">+100 Restock</button>
        </td>
      </tr>
    `;
  }).join('');
}

// 12. MODULE: Billing history table
function renderBillingTable() {
  const container = document.getElementById('billing-table-body');
  container.innerHTML = state.invoices.map(inv => {
    const pat = state.patients.find(p => p.id === inv.patientId);
    return `
      <tr>
        <td><strong>${inv.id}</strong></td>
        <td>${inv.date}</td>
        <td><strong>${pat ? pat.name : 'Unknown'}</strong></td>
        <td style="font-weight:700; color:var(--text-primary);">${state.currency}${inv.amount.toFixed(2)}</td>
        <td>${inv.mode}</td>
        <td><span class="badge ${inv.status === 'Paid' ? 'badge-emerald' : 'badge-amber'}">${inv.status}</span></td>
        <td>
          ${inv.status === 'Pending' ? `<button class="btn btn-emerald btn-sm" onclick="payInvoice('${inv.id}')" style="padding: 4px 8px; font-size:11px;">Pay Invoice</button>` : 'Paid'}
        </td>
      </tr>
    `;
  }).join('');
}

// ==================== VISUAL CHARTS RENDERING ENGINE (CHART.JS) ====================
let chartHimsTotalInstance = null;

function initCharts() {
  // New HIMS Clustered Bar Chart (Total Patients)
  const ctxHimsTotal = document.getElementById('himsTotalPatientsChart');
  if (ctxHimsTotal) {
    chartHimsTotalInstance = new Chart(ctxHimsTotal.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [
          {
            label: 'Male',
            data: [1200, 1150, 1300, 1100, 1250, 1050, 1180, 1240, 1090, 1120, 1150, 1210],
            backgroundColor: '#0fb77a',
            borderRadius: 4
          },
          {
            label: 'Female',
            data: [1350, 1250, 1400, 1200, 1380, 1150, 1290, 1431, 1210, 1280, 1310, 1370],
            backgroundColor: '#a7f3d0',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { borderDash: [4, 4] }, beginAtZero: true }
        }
      }
    });
  }

  // Chart 1: Patient Growth (Line) - Safe check
  const ctxGrowth = document.getElementById('patientGrowthChart');
  if (ctxGrowth) {
    chartGrowthInstance = new Chart(ctxGrowth.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        datasets: [{
          label: 'Consulted Patients',
          data: [15, 19, 12, state.patients.length, 0, 0],
          borderColor: '#0fb77a',
          backgroundColor: 'rgba(15, 183, 122, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Chart 2: Revenue Trends (Bar) - Safe check
  const ctxRevenue = document.getElementById('revenueTrendsChart');
  if (ctxRevenue) {
    const revenueTotal = state.invoices.reduce((sum, i) => sum + i.amount, 0);
    chartRevenueInstance = new Chart(ctxRevenue.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['June 1', 'June 2', 'June 3', 'June 4'],
        datasets: [{
          label: 'Daily Revenue',
          data: [1200, 1500, 900, revenueTotal],
          backgroundColor: '#0fb77a',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Chart 3: Specialty consultation share (Donut) - Safe check
  const ctxSpecialty = document.getElementById('specialtyChart');
  if (ctxSpecialty) {
    chartSpecialtyInstance = new Chart(ctxSpecialty.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Cardiology', 'Pediatrics', 'General OPD', 'IPD Rounds'],
        datasets: [{
          data: [35, 20, 30, 15],
          backgroundColor: ['#0fb77a', '#a7f3d0', '#059669', '#d97706']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
      }
    });
  }

  // Chart 4: Top Dispensed Drugs (Horizontal Bar) - Safe check
  const ctxMedicine = document.getElementById('medicineUsageChart');
  if (ctxMedicine) {
    chartMedicineInstance = new Chart(ctxMedicine.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Metoprolol', 'Amlodipine', 'Atorvastatin', 'Albuterol'],
        datasets: [{
          axis: 'y',
          label: 'Dispensed Qty',
          data: [25, 45, 15, 8],
          backgroundColor: '#f43f5e',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }
  
  // Reports page: Large demographics inpatient growth
  const ctxLargeGrowth = document.getElementById('largeGrowthChart');
  if (ctxLargeGrowth) {
    chartLargeGrowthInstance = new Chart(ctxLargeGrowth.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
          { label: 'Outpatients', data: [120, 150, 180, 220, 240, 280], borderColor: '#0fb77a', fill: false },
          { label: 'Inpatients', data: [20, 30, 45, 40, 55, 60], borderColor: '#3b82f6', fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // Reports page: Large specialty donut
  const ctxLargeSpecialty = document.getElementById('largeSpecialtyChart');
  if (ctxLargeSpecialty) {
    chartLargeSpecialtyInstance = new Chart(ctxLargeSpecialty.getContext('2d'), {
      type: 'pie',
      data: {
        labels: ['Cardiology', 'Pediatrics', 'General OPD', 'Orthopedics', 'Neurology'],
        datasets: [{
          data: [40, 18, 25, 12, 5],
          backgroundColor: ['#0fb77a', '#a7f3d0', '#059669', '#d97706', '#f43f5e']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } }
      }
    });
  }
}

// Update charts when transactions modify the database
function updateChartsData() {
  if (chartRevenueInstance) {
    const revenueTotal = state.invoices.reduce((sum, i) => sum + i.amount, 0);
    chartRevenueInstance.data.datasets[0].data[3] = revenueTotal;
    chartRevenueInstance.update();
  }
  
  if (chartGrowthInstance) {
    chartGrowthInstance.data.datasets[0].data[3] = state.patients.length;
    chartGrowthInstance.update();
  }

  if (chartHimsTotalInstance) {
    // Dynamically update August dataset values
    chartHimsTotalInstance.data.datasets[0].data[7] = 1240 + state.patients.filter(p => p.gender === 'Male').length;
    chartHimsTotalInstance.data.datasets[1].data[7] = 1431 + state.patients.filter(p => p.gender === 'Female').length;
    chartHimsTotalInstance.update();
  }
}
