"use client";

/**
 * Icon-only navigation rail — the dark column on the far left of the shell.
 *
 * Destinations come from `src/lib/lis-navigation.js` and are filtered by the
 * active role, so the rail is the only thing that needs to change when a
 * module is added or a role's access is adjusted.
 *
 * Accessibility notes: the rail is a `<nav>` with a labelled list; each button
 * carries an accessible name (the icon is decorative) and the current panel is
 * marked with `aria-current="page"`. The hover label is a CSS tooltip driven
 * by `data-label`, and it is also shown on keyboard focus.
 */

import React from 'react';
import { LogOut, Microscope, MoonStar, Sun } from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { groupedNavForRole, utilityItemsForRole } from '../../lib/lis-navigation';

export default function LisRail({ activePanel, setActivePanel }) {
  const { activeRole, darkMode, setDarkMode, logout } = useClinic();

  const groups = groupedNavForRole(activeRole);
  const utilities = utilityItemsForRole(activeRole);

  const renderItem = (item) => {
    const Icon = item.icon;
    const isActive = activePanel === item.id;
    return (
      <li key={item.id}>
        <button
          type="button"
          className={`lis-rail-btn${isActive ? ' is-active' : ''}`}
          data-label={item.label}
          aria-label={item.label}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => setActivePanel(item.id)}
        >
          <Icon aria-hidden="true" size={19} strokeWidth={1.9} />
        </button>
      </li>
    );
  };

  return (
    <nav className="lis-rail" aria-label="Laboratory modules">
      <div className="lis-rail-brand" aria-hidden="true">
        <Microscope size={20} strokeWidth={2} />
      </div>

      <div className="lis-rail-scroll">
        {groups.map((group, index) => (
          <div
            key={group.id}
            className={`lis-rail-group${index > 0 ? ' has-divider' : ''}`}
          >
            <h2 className="sr-only">{group.label}</h2>
            <ul className="lis-rail-list">{group.items.map(renderItem)}</ul>
          </div>
        ))}
      </div>

      <div className="lis-rail-foot">
        <ul className="lis-rail-list">
          <li>
            <button
              type="button"
              className="lis-rail-btn"
              data-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-pressed={darkMode}
              onClick={() => setDarkMode(!darkMode)}
            >
              {darkMode
                ? <Sun aria-hidden="true" size={19} strokeWidth={1.9} />
                : <MoonStar aria-hidden="true" size={19} strokeWidth={1.9} />}
            </button>
          </li>
          {utilities.map(renderItem)}
          <li>
            <button
              type="button"
              className="lis-rail-btn is-danger"
              data-label="Sign out"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut aria-hidden="true" size={19} strokeWidth={1.9} />
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
