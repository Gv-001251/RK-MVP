"use client";

/**
 * Top bar of the LIS workspace: a greeting on the left, and search /
 * notifications / profile as circular controls on the right.
 *
 * Replaces the old `Header.jsx`, which mixed a role switcher, a centre title
 * block and a second navigation list that was never rendered.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bell, LogOut, Search, UserRound } from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { ROLE_IDS, ROLE_LABELS, landingPanelForRole, panelLabel } from '../../lib/lis-navigation';

/**
 * `user.username` is the profile's full name where one is set, and the email
 * otherwise. Prefer the name; tidy an email into something greetable.
 *
 * "Dr. R. Kumar" -> "Dr. R. Kumar";  "aisha.khan@rk.test" -> "Aisha Khan"
 */
function displayName(user) {
  const raw = user?.username?.trim();
  if (!raw) return 'there';
  if (!raw.includes('@')) return raw;
  return raw
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase())
    .trim() || 'there';
}

export default function LisTopBar({ activePanel, setActivePanel, onSearch }) {
  const { user, activeRole, setActiveRole, logout, nursingNotes } = useClinic();

  const [searchOpen, setSearchOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);

  const searchInputRef = useRef(null);
  const profileRef = useRef(null);
  const alertsRef = useRef(null);

  const canSwitchRole = user?.role === 'admin';
  const alerts = (nursingNotes || []).slice(0, 4);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Dismiss the menus on outside click or Escape.
  useEffect(() => {
    if (!showProfile && !showAlerts) return;

    const handlePointer = (event) => {
      if (showProfile && !profileRef.current?.contains(event.target)) setShowProfile(false);
      if (showAlerts && !alertsRef.current?.contains(event.target)) setShowAlerts(false);
    };
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      setShowProfile(false);
      setShowAlerts(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showProfile, showAlerts]);

  const handleRoleChange = (role) => {
    setActiveRole(role);
    setShowProfile(false);
    setActivePanel(landingPanelForRole(role));
  };

  const currentLabel = panelLabel(activePanel);

  return (
    <header className="lis-topbar">
      <div className="lis-greeting">
        <h1 className="lis-greeting-title">Hello, {displayName(user)}!</h1>
        <p className="lis-greeting-sub">
          {ROLE_LABELS[activeRole] || activeRole}
          {currentLabel ? <> &middot; {currentLabel}</> : null}
        </p>
      </div>

      <div className="lis-topbar-actions">
        <div className={`lis-search${searchOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="lis-round-btn"
            aria-label={searchOpen ? 'Close search' : 'Search orders and patients'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search aria-hidden="true" size={17} strokeWidth={2.1} />
          </button>
          {searchOpen && (
            <>
              <label className="sr-only" htmlFor="lis-global-search">
                Search orders, accessions and patients
              </label>
              <input
                id="lis-global-search"
                ref={searchInputRef}
                type="search"
                className="lis-search-input"
                placeholder="Search accession, order or patient…"
                onChange={(event) => onSearch?.(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearchOpen(false);
                }}
              />
            </>
          )}
        </div>

        <div className="lis-menu-anchor" ref={alertsRef}>
          <button
            type="button"
            className="lis-round-btn"
            aria-label={`Notifications${alerts.length ? `, ${alerts.length} recent` : ''}`}
            aria-haspopup="true"
            aria-expanded={showAlerts}
            onClick={() => { setShowAlerts((open) => !open); setShowProfile(false); }}
          >
            <Bell aria-hidden="true" size={17} strokeWidth={2.1} />
            {alerts.length > 0 && <span className="lis-round-btn-dot" aria-hidden="true" />}
          </button>

          {showAlerts && (
            <div className="lis-menu" role="menu" aria-label="Recent activity">
              <p className="lis-menu-title">Recent activity</p>
              {alerts.length === 0 && <p className="lis-menu-empty">Nothing to report.</p>}
              {alerts.map((note, index) => (
                <div key={index} className="lis-menu-note">
                  <div className="lis-menu-note-head">
                    <span>{note.author?.split(',')[0]}</span>
                    <span>{note.time}</span>
                  </div>
                  <p>{note.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lis-menu-anchor" ref={profileRef}>
          <button
            type="button"
            className="lis-round-btn is-profile"
            aria-label={`Account: ${user?.username || 'signed in'}`}
            aria-haspopup="true"
            aria-expanded={showProfile}
            onClick={() => { setShowProfile((open) => !open); setShowAlerts(false); }}
          >
            <UserRound aria-hidden="true" size={17} strokeWidth={2.1} />
          </button>

          {showProfile && (
            <div className="lis-menu is-wide" role="menu" aria-label="Account">
              <div className="lis-menu-identity">
                <span className="lis-menu-identity-name">{user?.username}</span>
                <span className="lis-menu-identity-role">{ROLE_LABELS[activeRole] || activeRole}</span>
              </div>

              {canSwitchRole ? (
                <>
                  <p className="lis-menu-title">View as role</p>
                  <div className="lis-menu-roles">
                    {ROLE_IDS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeRole === role}
                        className={`lis-menu-role${activeRole === role ? ' is-active' : ''}`}
                        onClick={() => handleRoleChange(role)}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="lis-menu-empty">
                  Role switching is limited to administrators.
                </p>
              )}

              <button type="button" className="lis-menu-signout" onClick={logout}>
                <LogOut aria-hidden="true" size={14} strokeWidth={2.2} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
