"use client";

/**
 * DEPRECATED — superseded by `components/lis/LisTopBar`.
 *
 * The old top bar. Its `navItems` / `getVisibleNavItems()` block was dead code
 * that still advertised OPD, IPD, Pharmacy and Billing long after those panels
 * left the navigation — the drift that motivated the central nav model in
 * `src/lib/lis-navigation.js`.
 *
 * Nothing imports this file. Safe to delete once the new bar has shipped.
 */

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function Header({ 
  activePanel, 
  setActivePanel, 
  onSearch 
}) {
  const { 
    activeRole, 
    setActiveRole, 
    nursingNotes,
    user,
    logout
  } = useClinic();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Map active role to professional display name
  const roleDisplayMap = {
    admin: 'Administrator',
    doctor: 'Doctor (MD)',
    nurse_pharmacy: 'Nurse & Pharmacy',
    technician: 'Laboratory Technician',
    senior_technician: 'Senior Technician',
    pathologist: 'Pathologist',
    receptionist: 'Receptionist'
  };
  const roleDisplay = roleDisplayMap[activeRole] || activeRole;

  // Check if current authenticated user has role-switching capabilities (MD users / Admin)
  const canSwitchRole = user && user.role === 'admin';

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      iconColor: '#3b82f6',
      icon: (
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
      )
    },
    {
      id: 'consultation',
      label: 'Consultation',
      iconColor: '#6366f1',
      icon: (
        <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      )
    },
    {
      id: 'opd',
      label: 'OPD',
      iconColor: '#a855f7',
      icon: (
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      )
    },
    {
      id: 'ipd',
      label: 'IPD',
      iconColor: '#db2777',
      icon: (
        <svg viewBox="0 0 24 24"><path d="M2 4v16M2 14h20M22 14v6M2 18h20M10 8H5v6h5V8z"/></svg>
      )
    },
    {
      id: 'laboratory',
      label: 'Laboratory',
      iconColor: '#059669',
      icon: (
        <svg viewBox="0 0 24 24"><path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z"/></svg>
      )
    },
    {
      id: 'pharmacy',
      label: 'Pharmacy',
      iconColor: '#e11d48',
      icon: (
        <svg viewBox="0 0 24 24"><path d="M20.5 7.5a4.95 4.95 0 0 1 0 7l-6 6a4.95 4.95 0 0 1-7 0 4.95 4.95 0 0 1 0-7l6-6a4.95 4.95 0 0 1 7 0z"/><line x1="8.5" y1="15.5" x2="15.5" y2="8.5"/></svg>
      )
    },
    {
      id: 'billing',
      label: 'Billing',
      iconColor: '#d97706',
      icon: (
        <svg viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8H8M16 12H8M16 16H8"/></svg>
      )
    },
    {
      id: 'reports',
      label: 'Reports',
      iconColor: '#ea580c',
      icon: (
        <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      )
    },
    {
      id: 'admin',
      label: 'Admin',
      iconColor: '#4b5563',
      icon: (
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      )
    }
  ];

  // Filter header navigation pills based on activeRole
  const getVisibleNavItems = () => {
    switch (activeRole) {
      case 'doctor':
        return navItems.filter(item => ['consultation', 'opd', 'ipd', 'laboratory', 'reports'].includes(item.id));
      case 'nurse_pharmacy':
        return navItems.filter(item => ['dashboard', 'opd', 'ipd', 'pharmacy'].includes(item.id));
      case 'technician':
      case 'senior_technician':
      case 'pathologist':
        return navItems.filter(item => ['dashboard', 'laboratory'].includes(item.id));
      case 'admin':
      default:
        return navItems; // Admin gets everything
    }
  };

  const visibleNavItems = getVisibleNavItems();

  const handleRoleChange = (role) => {
    setActiveRole(role);
    setShowProfileMenu(false);
    // Land on the role's primary screen (matches the role-scoped navigation).
    const landing = {
      admin: 'dashboard',
      doctor: 'doctor_portal',
      technician: 'dashboard',
      senior_technician: 'dashboard',
      pathologist: 'verification',
      receptionist: 'order_entry',
      nurse_pharmacy: 'sample_collection',
    };
    setActivePanel(landing[role] || 'dashboard');
  };

  return (
    <header className="top-header erp-header" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '20px', alignItems: 'center' }}>
      
      {/* LEFT: Profile toggle pill */}
      <div className="header-profile-section" style={{ position: 'relative' }}>
        <button 
          type="button"
          className="user-profile-menu-erp" 
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          aria-haspopup="true"
          aria-expanded={showProfileMenu}
          style={{
            backgroundColor: '#ffffff',
            border: '1.5px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '24px',
            padding: '4px 14px 4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            height: '42px',
            font: 'inherit',
            textAlign: 'left'
          }}
          title={canSwitchRole ? "Switch Active Role" : "User Profile"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=150&auto=format&fit=crop" 
            alt="User Avatar" 
            className="user-avatar-erp" 
            style={{ width: '32px', height: '32px', borderRadius: '50%' }}
          />
          <span className="user-info-erp" style={{ gap: '1px', display: 'flex', flexDirection: 'column' }}>
            <span className="user-name-erp" style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', lineHeight: '1.1' }}>{user ? user.username.split('@')[0] : 'Oliver Jack'}</span>
            <span className="user-role-erp" style={{ fontSize: '9.5px', fontWeight: '600', color: '#64748b', lineHeight: '1.1' }}>{roleDisplay}</span>
          </span>
          
          <span 
            aria-hidden="true"
            style={{
              width: '0',
              height: '0',
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '5px solid #64748b',
              marginLeft: '2px',
              marginTop: '2px'
            }}
          />
        </button>

        {/* PROFILE/ROLE SWITCHING DROPDOWN FOR MD/ADMIN USERS */}
        {showProfileMenu && (
          <div className="profile-dropdown-card" style={{ top: 'calc(100% + 6px)', left: 0, width: '200px', padding: '12px', zIndex: 100 }}>
            {canSwitchRole ? (
              <>
                <span className="dropdown-title" style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
                  🔄 Switch Active Role
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {[
                    { id: 'admin', name: 'Administrator' },
                    { id: 'doctor', name: 'Doctor' },
                    { id: 'technician', name: 'Laboratory Technician' },
                    { id: 'senior_technician', name: 'Senior Technician' },
                    { id: 'pathologist', name: 'Pathologist' },
                    { id: 'receptionist', name: 'Receptionist' },
                    { id: 'nurse_pharmacy', name: 'Nurse (Collection)' }
                  ].map(r => (
                    <button 
                      key={r.id}
                      className={`btn ${activeRole === r.id ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleRoleChange(r.id)}
                      style={{ 
                        fontSize: '11.5px', 
                        padding: '6px 10px', 
                        width: '100%', 
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        textTransform: 'none'
                      }}
                    >
                      <span>{r.name}</span>
                      {activeRole === r.id && <span style={{ fontSize: '10px' }}>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '6px 0', marginBottom: '10px' }}>
                Signed in securely as <strong>{user?.username}</strong>. Role switching restricted to Admin/MD.
              </div>
            )}
            
            {/* LOGOUT BUTTON IN PROFILE MENU */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <button 
                onClick={() => {
                  logout();
                }}
                className="btn btn-rose"
                style={{ 
                  fontSize: '11px', 
                  padding: '8px 12px', 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '6px',
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: 'var(--rose)',
                  fontWeight: '700',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textTransform: 'none'
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: '12.5px', height: '12.5px', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5 }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                </svg>
                Logout Session
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CENTER: System Title */}
      <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <span aria-hidden="true" style={{
          width: '34px', height: '34px', borderRadius: '10px',
          background: 'var(--primary-gradient)', color: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: '800', fontSize: '13px', fontFamily: 'var(--font-title)',
          letterSpacing: '0.5px', boxShadow: '0 6px 14px -4px rgba(79,70,229,0.6)'
        }}>RK</span>
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a', letterSpacing: '0.4px', margin: 0, fontFamily: 'var(--font-title)', textTransform: 'uppercase' }}>RK Clinic Laboratory</h1>
          <span style={{ fontSize: '9.5px', fontWeight: '600', color: '#64748b', marginTop: '2px', letterSpacing: '0.2px' }}>Laboratory Workflow &amp; Reporting System</span>
        </div>
      </div>

      {/* RIGHT: Search, Notifications, Settings */}
      <div className="header-right-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        
        {/* Search bar pill */}
        <div 
          className="search-bar-container-erp" 
          style={{ 
            backgroundColor: '#ffffff', 
            borderRadius: '20px', 
            border: '1px solid rgba(0, 0, 0, 0.08)', 
            padding: '0 12px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            width: '140px',
            height: '34px'
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '12px', height: '12px', stroke: '#64748b', fill: 'none', strokeWidth: 2.5 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input 
            type="search" 
            className="search-input-erp" 
            placeholder="Search.." 
            aria-label="Search patients and records"
            style={{ 
              border: 'none', 
              fontSize: '11px', 
              width: '100%', 
              background: 'transparent',
              padding: 0
            }}
            onChange={(e) => onSearch && onSearch(e.target.value)}
          />
        </div>

        {/* Notifications Bell */}
        <div style={{ position: 'relative' }}>
          <button 
            className="erp-action-btn" 
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications and alerts"
            aria-haspopup="true"
            aria-expanded={showNotifications}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '14px', height: '14px', stroke: '#1e293b', fill: 'none', strokeWidth: 2 }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span aria-hidden="true" style={{ position: 'absolute', top: '7px', right: '7px', width: '5px', height: '5px', backgroundColor: '#e11d48', borderRadius: '50%' }} />
          </button>

          {showNotifications && (
            <div className="notifications-dropdown-card" style={{ top: 'calc(100% + 6px)', right: 0, width: '220px', zIndex: 100 }}>
              <h4 style={{ fontSize: '11px', fontWeight: '700', marginBottom: '8px' }}>System Logs & Alerts</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {nursingNotes.slice(0, 3).map((note, idx) => (
                  <div key={idx} style={{ fontSize: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                      <span>{note.author.split(',')[0]}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{note.time}</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '2px', lineheight: '1.2' }}>{note.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings Gear - navigates to SettingsPanel */}
        <button 
          className="erp-action-btn" 
          onClick={() => setActivePanel('settings')}
          aria-label="Open settings"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '50%',
            width: '34px',
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '14px', height: '14px', stroke: '#1e293b', fill: 'none', strokeWidth: 2 }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </header>
  );
}
