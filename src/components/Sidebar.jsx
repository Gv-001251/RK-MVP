"use client";

/**
 * DEPRECATED — superseded by `components/lis/LisRail`.
 *
 * This was the wide labelled sidebar. It had already been hidden from the UI
 * by CSS (`.app-container.no-sidebar aside.sidebar { display: none }`) and its
 * menu had drifted out of sync with the panels actually routed in `page.js`.
 * Navigation now comes from the single model in `src/lib/lis-navigation.js`.
 *
 * Nothing imports this file. Kept for one release so the old role-to-menu
 * mapping can be diffed against the new model; safe to delete after that.
 */

import React from 'react';
import { useClinic } from '../context/ClinicContext';

export default function Sidebar({ activePanel, setActivePanel }) {
  const { darkMode, setDarkMode, activeRole, logout, labActiveTab, setLabActiveTab, ipdActiveTab, setIpdActiveTab } = useClinic();

  const getFilteredMenuItems = () => {
    switch (activeRole) {
      case 'doctor':
        return [
          { id: 'doctor_portal', label: 'Doctor Portal', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          )},
          { id: 'analytics', label: 'Analytics', icon: (
            <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/></svg>
          )},
          { id: 'order_entry', label: 'Order Entry', icon: (
            <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M12 11v5M9.5 13.5h5"/></svg>
          )},
          { id: 'consultation', label: 'Order Lab Tests', icon: (
            <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )},
          { id: 'emr', label: 'Patient Records', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          )},
          { id: 'analyzer_results', label: 'Analyzer Results', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 10h4l2 4 3-8 2 4h4"/></svg>
          )},
          { id: 'laboratory', label: 'Lab Reports', icon: (
            <svg viewBox="0 0 24 24"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('reports'); }},
          { id: 'lab_reports', label: 'Report Center', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
          )}
        ];
      case 'technician':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('dashboard'); }},
          { id: 'analytics', label: 'Analytics', icon: (
            <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/></svg>
          )},
          { id: 'sample_collection', label: 'Sample Collection', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2v14a4 4 0 0 1-8 0V2"/><path d="M5 2h10M6 9h7"/></svg>
          )},
          { id: 'specimen_tracking', label: 'Specimen Tracking', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 7v10"/></svg>
          )},
          { id: 'verification', label: 'Verification', icon: (
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
          )},
          { id: 'critical_results', label: 'Critical Alerts', icon: (
            <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          )},
          { id: 'delta_review', label: 'Delta Review', icon: (
            <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          )},
          { id: 'quality_control', label: 'Quality Control', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>
          )},
          { id: 'inventory', label: 'Inventory', icon: (
            <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          )},
          { id: 'lab_reports', label: 'Report Center', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
          )},
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
          { id: 'analyzer_results', label: 'Analyzer Results', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 10h4l2 4 3-8 2 4h4"/></svg>
          ), action: () => { setActivePanel('analyzer_results'); }},
          { id: 'analyzer_mgmt', label: 'Analyzer Management', icon: (
            <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          )},
          { id: 'laboratory', label: 'Laboratory Reports', icon: (
            <svg viewBox="0 0 24 24"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('reports'); }}
        ];
      case 'receptionist':
        return [
          { id: 'order_entry', label: 'Order Entry', icon: (
            <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M12 11v5M9.5 13.5h5"/></svg>
          )},
          { id: 'analyzer_results', label: 'Analyzer Results', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 10h4l2 4 3-8 2 4h4"/></svg>
          ), action: () => { setActivePanel('analyzer_results'); }},
        ];
      case 'admin':
      default:
        return [
          { id: 'dashboard', label: 'Dashboard', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          )},
          { id: 'doctor_portal', label: 'Doctor Portal', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          )},
          { id: 'analytics', label: 'Analytics', icon: (
            <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/></svg>
          )},
          { id: 'order_entry', label: 'Order Entry', icon: (
            <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M12 11v5M9.5 13.5h5"/></svg>
          )},
          { id: 'consultation', label: 'Order Lab Tests', icon: (
            <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )},
          { id: 'sample_collection', label: 'Sample Collection', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2v14a4 4 0 0 1-8 0V2"/><path d="M5 2h10M6 9h7"/></svg>
          )},
          { id: 'specimen_tracking', label: 'Specimen Tracking', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 7v10"/></svg>
          )},
          { id: 'verification', label: 'Verification', icon: (
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
          )},
          { id: 'critical_results', label: 'Critical Alerts', icon: (
            <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          )},
          { id: 'delta_review', label: 'Delta Review', icon: (
            <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          )},
          { id: 'quality_control', label: 'Quality Control', icon: (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>
          )},
          { id: 'inventory', label: 'Inventory', icon: (
            <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          )},
          { id: 'lab_reports', label: 'Report Center', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
          )},
          { id: 'laboratory', label: 'Laboratory', icon: (
            <svg viewBox="0 0 24 24"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
          ), action: () => { setActivePanel('laboratory'); setLabActiveTab('dashboard'); }},
          { id: 'analyzer_results', label: 'Analyzer Results', icon: (
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 10h4l2 4 3-8 2 4h4"/></svg>
          )},
          { id: 'analyzer_mgmt', label: 'Analyzer Management', icon: (
            <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          )},
          { id: 'emr', label: 'Patient Records', icon: (
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          )}
        ];
    }
  };

  const getFilteredConfigItems = () => {
    switch (activeRole) {
      case 'admin':
        return [
          { id: 'admin', label: 'User Management', icon: (
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
          <span className="sidebar-logo-desc">Laboratory</span>
          <span className="sidebar-logo-desc" style={{ color: 'var(--text-secondary)' }}>Workflow &amp; Reporting</span>
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
        <div className="sidebar-copyright">© 2026. RK Clinic LIS - V 1.0.0</div>
      </div>
    </aside>
  );
}
