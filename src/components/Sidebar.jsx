"use client";

import React from 'react';
import { useClinic } from '../context/ClinicContext';

export default function Sidebar({ activePanel, setActivePanel }) {
  const { darkMode, setDarkMode, activeRole, logout, labActiveTab, setLabActiveTab, ipdActiveTab, setIpdActiveTab } = useClinic();

  const getFilteredMenuItems = () => {
    switch (activeRole) {
      case 'doctor':
        return [
          { id: 'consultation', label: 'Consultation Workspace', icon: (
            <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )},
          { id: 'opd', label: 'OPD', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          )},
          { id: 'ipd', label: 'IPD', icon: (
            <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
          )},
          { id: 'emr', label: 'Patient EMR', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          )},
          { id: 'prescriptions', label: 'Prescriptions', icon: (
            <svg viewBox="0 0 24 24"><path d="M20.5 7.5a4.95 4.95 0 0 1 0 7l-6 6a4.95 4.95 0 0 1-7 0 4.95 4.95 0 0 1 0-7l6-6a4.95 4.95 0 0 1 7 0z"/><line x1="8.5" y1="15.5" x2="15.5" y2="8.5"/></svg>
          ), action: () => { setActivePanel('opd'); }},
          { id: 'laboratory', label: 'Lab Reports', icon: (
            <svg viewBox="0 0 24 24"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('reports'); }}
        ];
      case 'nurse_pharmacy':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          )},
          { id: 'registration', label: 'Patient Registration', icon: (
            <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
          )},
          { id: 'opd', label: 'OPD', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          )},
          { id: 'ipd', label: 'IPD', icon: (
            <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
          ), action: () => { setActivePanel('ipd'); setIpdActiveTab('dashboard'); }},
          { id: 'emergency', label: 'Emergency', icon: (
            <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          ), action: () => { setActivePanel('emr'); }},
          { id: 'discharge', label: 'Discharge', icon: (
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>
          ), action: () => { setActivePanel('ipd'); setIpdActiveTab('discharge'); }},
          { id: 'bed_management', label: 'Bed Management', icon: (
            <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20"/></svg>
          ), action: () => { setActivePanel('ipd'); setIpdActiveTab('beds'); }},
          { id: 'pharmacy', label: 'Pharmacy', icon: (
            <svg viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.25-2.5 3-2.5 4.5h20c0-1.5-1-3.25-2.5-4.5"/><ellipse cx="12" cy="10" rx="7" ry="6"/><path d="M12 4v12"/></svg>
          )}
        ];
      case 'technician':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('dashboard'); }},
          { id: 'sample_reg', label: 'Sample Registration', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('registration'); }},
          { id: 'tracking', label: 'Sample Tracking', icon: (
            <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('tracking'); }},
          { id: 'barcode', label: 'Barcode Management', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('barcode'); }},
          { id: 'result', label: 'Result Entry', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('results'); }},
          { id: 'laboratory', label: 'Laboratory Reports', icon: (
            <svg viewBox="0 0 24 24"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('reports'); }}
        ];
      case 'admin':
      default:
        return [
          { id: 'dashboard', label: 'Dashboard', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          )},
          { id: 'consultation', label: 'Consultation Workspace', icon: (
            <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )},
          { id: 'opd', label: 'OPD', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          )},
          { id: 'ipd', label: 'IPD', icon: (
            <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
          ), action: () => { setActivePanel('ipd'); setIpdActiveTab('dashboard'); }},
          { id: 'emr', label: 'Emergency', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          ), action: () => { setActivePanel('emr'); }},
          { id: 'laboratory', label: 'Laboratory', icon: (
            <svg viewBox="0 0 24 24"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('dashboard'); }},
          { id: 'pharmacy', label: 'Pharmacy', icon: (
            <svg viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.25-2.5 3-2.5 4.5h20c0-1.5-1-3.25-2.5-4.5"/><ellipse cx="12" cy="10" rx="7" ry="6"/><path d="M12 4v12"/></svg>
          )},
          { id: 'billing', label: 'Billing', icon: (
            <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          )},
          { id: 'reports', label: 'Reports', icon: (
            <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          )}
        ];
    }
  };

  const getFilteredConfigItems = () => {
    switch (activeRole) {
      case 'admin':
        return [
          { id: 'admin', label: 'Administration', icon: (
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          )},
          { id: 'settings', label: 'Settings', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          )}
        ];
      default:
        return [
          { id: 'settings', label: 'Settings', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          )}
        ];
    }
  };

  const visibleMenuItems = getFilteredMenuItems();
  const visibleConfigItems = getFilteredConfigItems();

  const isItemActive = (item) => {
    if (activeRole === 'technician') {
      if (item.id === 'dashboard' && activePanel === 'laboratory' && labActiveTab === 'dashboard') return true;
      if (item.id === 'sample_reg' && activePanel === 'laboratory' && labActiveTab === 'registration') return true;
      if (item.id === 'tracking' && activePanel === 'laboratory' && labActiveTab === 'tracking') return true;
      if (item.id === 'barcode' && activePanel === 'laboratory' && labActiveTab === 'barcode') return true;
      if (item.id === 'result' && activePanel === 'laboratory' && labActiveTab === 'results') return true;
      if (item.id === 'laboratory' && activePanel === 'laboratory' && labActiveTab === 'reports') return true;
      return activePanel === item.id;
    }
    if (activeRole === 'nurse_pharmacy') {
      if (item.id === 'ipd' && activePanel === 'ipd' && ipdActiveTab === 'dashboard') return true;
      if (item.id === 'discharge' && activePanel === 'ipd' && ipdActiveTab === 'discharge') return true;
      if (item.id === 'bed_management' && activePanel === 'ipd' && ipdActiveTab === 'beds') return true;
      return activePanel === item.id;
    }
    return activePanel === item.id;
  };

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-hims">RK Clinic</div>
        <div className="sidebar-logo-container">
          <span className="sidebar-logo-desc">Healthcare</span>
          <span className="sidebar-logo-desc" style={{ color: 'var(--text-secondary)' }}>ERP Platform</span>
        </div>
      </div>
      
      <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 150px)', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {visibleMenuItems.length > 0 && (
            <>
              <div className="sidebar-nav-group">Main Menu</div>
              {visibleMenuItems.map(item => (
                <div 
                  key={item.id} 
                  className={`nav-item ${isItemActive(item) ? 'active' : ''}`}
                  onClick={() => {
                    if (item.action) {
                      item.action();
                    } else {
                      setActivePanel(item.id);
                    }
                    document.getElementById('sidebar').classList.remove('mobile-open');
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              ))}
            </>
          )}
          
          {visibleConfigItems.length > 0 && (
            <>
              <div className="sidebar-nav-group" style={{ marginTop: '16px' }}>Configuration & Setups</div>
              {visibleConfigItems.map(item => (
                <div 
                  key={item.id} 
                  className={`nav-item ${isItemActive(item) ? 'active' : ''}`}
                  onClick={() => {
                    if (item.action) {
                      item.action();
                    } else {
                      setActivePanel(item.id);
                    }
                    document.getElementById('sidebar').classList.remove('mobile-open');
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* LOGOUT SESSION BUTTON */}
        <div style={{ padding: '10px 0 16px 0', borderTop: '1px solid var(--border-color)', marginTop: '20px' }}>
          <div 
            className="nav-item"
            onClick={() => {
              logout();
            }}
            style={{
              border: '1px solid rgba(244, 63, 94, 0.25)',
              backgroundColor: 'rgba(244, 63, 94, 0.05)',
              color: 'var(--rose)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '12.5px',
              transition: 'all 0.2s'
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            <span>Logout Session</span>
          </div>
        </div>
      </nav>
      
      <div className="sidebar-footer">
        <div className="theme-switch-container">
          <button 
            className={`theme-switch-btn ${!darkMode ? 'active' : ''}`} 
            onClick={() => setDarkMode(false)}
          >
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            Light
          </button>
          <button 
            className={`theme-switch-btn ${darkMode ? 'active' : ''}`} 
            onClick={() => setDarkMode(true)}
          >
            <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            Dark
          </button>
        </div>
        <div className="sidebar-copyright">© 2026. RK Clinic ERP - V 1.0.0</div>
      </div>
    </aside>
  );
}
