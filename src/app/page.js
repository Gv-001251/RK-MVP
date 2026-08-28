"use client";

/**
 * RK Clinic — Laboratory Information System shell.
 *
 * Layout: a dark side dock (icon rail + persistent worklist), then the
 * workspace with a greeting bar and the active panel.
 *
 * Scope: laboratory only. The navigation model lives in
 * `src/lib/lis-navigation.js`, and the remaining hospital modules stay in the
 * repository, catalogued in `src/lib/legacy-modules.js` — they are simply not
 * routed while the client is running the lab workflow on its own.
 */

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import { canAccessPanel, landingPanelForRole } from '../lib/lis-navigation';

import LoginPage from '../components/LoginPage';
import LisSideDock from '../components/lis/LisSideDock';
import LisTopBar from '../components/lis/LisTopBar';
import LisDashboardPanel from '../components/lis/LisDashboardPanel';
import CriticalAlertBanner from '../components/CriticalAlertBanner';

// ── Laboratory panels ───────────────────────────────────────────────
import OrderEntryPanel from '../components/OrderEntryPanel';
import PatientsPanel from '../components/PatientsPanel';
import SampleCollectionPanel from '../components/SampleCollectionPanel';
import SpecimenTrackingPanel from '../components/SpecimenTrackingPanel';
import AnalyzerResultsPanel from '../components/AnalyzerResultsPanel';
import ExceptionQueuePanel from '../components/ExceptionQueuePanel';
import ManualEntryPanel from '../components/ManualEntryPanel';
import VerificationPanel from '../components/VerificationPanel';
import CriticalResultsPanel from '../components/CriticalResultsPanel';
import DeltaReviewPanel from '../components/DeltaReviewPanel';
import QualityControlPanel from '../components/QualityControlPanel';
import LabReportsPanel from '../components/LabReportsPanel';
import LaboratoryPanel from '../components/LaboratoryPanel';
import AnalyzerManagementPanel from '../components/AnalyzerManagementPanel';
import MaglumiControlPanel from '../components/MaglumiControlPanel';
import InventoryManagementPanel from '../components/InventoryManagementPanel';
import DoctorPortalPanel from '../components/DoctorPortalPanel';
import AnalyticsDashboardPanel from '../components/AnalyticsDashboardPanel';
import AdminPanel from '../components/AdminPanel';
import SettingsPanel from '../components/SettingsPanel';

/** Panels that read better without the worklist column stealing width. */
const WIDE_PANELS = new Set([
  'laboratory',
  'analytics',
  'lab_reports',
  'quality_control',
  'maglumi_control',
  'admin',
  'registration',
]);

export default function Home() {
  const { user, activeRole } = useClinic();

  const [requestedPanel, setActivePanel] = useState(null);
  const [editPatientTarget, setEditPatientTarget] = useState(null);

  // The open panel is derived rather than stored, so it can never be one the
  // active role is not allowed to see. This covers first paint and the admin
  // role switcher, which can drop the user into a role without access to the
  // screen they were on.
  const activePanel = requestedPanel && canAccessPanel(activeRole, requestedPanel)
    ? requestedPanel
    : landingPanelForRole(activeRole);

  const handleGlobalSearch = (query) => {
    if (query && canAccessPanel(activeRole, 'specimen_tracking')) {
      setActivePanel('specimen_tracking');
    }
  };

  const renderActivePanel = () => {
    switch (activePanel) {
      case 'dashboard':
        return <LisDashboardPanel onNavigateToTab={setActivePanel} />;
      case 'doctor_portal':
        return <DoctorPortalPanel />;
      case 'analytics':
        return <AnalyticsDashboardPanel />;

      case 'order_entry':
        return <OrderEntryPanel />;
      case 'registration':
        return (
          <PatientsPanel
            onOpenPatientProfile={() => setActivePanel('order_entry')}
            editPatientTarget={editPatientTarget}
            setEditPatientTarget={setEditPatientTarget}
          />
        );
      case 'sample_collection':
        return <SampleCollectionPanel />;
      case 'specimen_tracking':
        return <SpecimenTrackingPanel />;
      case 'analyzer_results':
        return <AnalyzerResultsPanel />;
      case 'exception_queue':
        return <ExceptionQueuePanel />;
      case 'manual_entry':
        return <ManualEntryPanel />;

      case 'verification':
        return <VerificationPanel />;
      case 'critical_results':
        return <CriticalResultsPanel />;
      case 'delta_review':
        return <DeltaReviewPanel />;
      case 'quality_control':
        return <QualityControlPanel />;

      case 'lab_reports':
        return <LabReportsPanel />;
      case 'laboratory':
        return <LaboratoryPanel />;
      case 'analyzer_mgmt':
        return <AnalyzerManagementPanel />;
      case 'maglumi_control':
        return <MaglumiControlPanel />;
      case 'inventory':
        return <InventoryManagementPanel />;

      case 'admin':
        return <AdminPanel />;
      case 'settings':
        return <SettingsPanel />;

      default:
        return <LisDashboardPanel onNavigateToTab={setActivePanel} />;
    }
  };

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="lis-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <LisSideDock
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        showWorklist={!WIDE_PANELS.has(activePanel)}
      />

      <main className="lis-workspace" id="main-content" tabIndex={-1}>
        <LisTopBar
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          onSearch={handleGlobalSearch}
        />

        {/* Live critical-result alerts, acknowledged in place. */}
        <CriticalAlertBanner />

        <div className="lis-panel-area">
          {renderActivePanel()}
        </div>
      </main>
    </div>
  );
}
