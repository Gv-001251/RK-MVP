/**
 * Hospital modules parked for a later phase.
 *
 * The client is only running the laboratory workflow right now, so these
 * screens are not reachable from the UI. They are still complete, working
 * components and this registry keeps them referenced rather than orphaned:
 *
 *   - the loaders below are real imports, so a rename or a broken import in a
 *     parked panel still fails the build instead of rotting silently;
 *   - each entry is a `() => import(...)` thunk, so nothing here is pulled
 *     into the LIS bundle until it is actually rendered;
 *   - re-enabling a module is a one-line change: flip `enabled` to `true` and
 *     add its `panelId` to the nav model in `src/lib/lis-navigation.js`.
 *
 * Nothing in the LIS render path reads this file. It is a manifest.
 */

export const LEGACY_MODULES = [
  {
    panelId: 'hospital_dashboard',
    // The old whole-hospital dashboard (bed occupancy, pharmacy stock, daily
    // collections). The LIS uses `components/lis/LisDashboardPanel` instead.
    label: 'Hospital Dashboard',
    enabled: false,
    load: () => import('../components/DashboardPanel'),
  },
  {
    panelId: 'opd',
    label: 'OPD / Outpatient',
    enabled: false,
    load: () => import('../components/OpdPanel'),
  },
  {
    panelId: 'ipd',
    label: 'IPD / Inpatient & Beds',
    enabled: false,
    load: () => import('../components/IpdPanel'),
  },
  {
    panelId: 'consultation',
    label: 'Doctor Consultation',
    enabled: false,
    load: () => import('../components/DoctorConsultationPanel'),
  },
  {
    panelId: 'emr',
    label: 'Patient EMR',
    enabled: false,
    load: () => import('../components/EmrPanel'),
  },
  {
    panelId: 'pharmacy',
    label: 'Pharmacy',
    enabled: false,
    load: () => import('../components/PharmacyPanel'),
  },
  {
    panelId: 'billing',
    label: 'Billing & Invoicing',
    enabled: false,
    load: () => import('../components/BillingPanel'),
  },
  {
    panelId: 'reports',
    // Distinct from the LIS Report Centre (LabReportsPanel), which stays live.
    label: 'Hospital Reports',
    enabled: false,
    load: () => import('../components/ReportsPanel'),
  },
  {
    panelId: 'emergency',
    label: 'Emergency',
    enabled: false,
    load: () => import('../components/EmergencyPanel'),
  },
  {
    panelId: 'rad',
    label: 'Radiology',
    enabled: false,
    load: () => import('../components/RadPanel'),
  },
  {
    panelId: 'sterilization',
    label: 'Sterilization (CSSD)',
    enabled: false,
    load: () => import('../components/SterilizationPanel'),
  },
  {
    panelId: 'scheduler',
    label: 'Appointment Scheduler',
    enabled: false,
    load: () => import('../components/SchedulerPanel'),
  },
  {
    panelId: 'insurance',
    label: 'Insurance Claims',
    enabled: false,
    load: () => import('../components/InsurancePanel'),
  },
  {
    panelId: 'suppliers',
    label: 'Suppliers & Procurement',
    enabled: false,
    load: () => import('../components/SuppliersPanel'),
  },
  {
    panelId: 'backup',
    label: 'Backup & Restore',
    enabled: false,
    load: () => import('../components/BackupPanel'),
  },
  {
    panelId: 'prescription_print',
    label: 'Prescription Printout',
    enabled: false,
    load: () => import('../components/legacy/PrescriptionPrintModal'),
  },
];

/** Panel ids that are deliberately absent from the LIS navigation. */
export const LEGACY_PANEL_IDS = LEGACY_MODULES.map((m) => m.panelId);

/** Modules switched back on. Empty during the LIS-only phase. */
export function enabledLegacyModules() {
  return LEGACY_MODULES.filter((m) => m.enabled);
}

/** Resolve a parked module's component, for when one is re-enabled. */
export async function loadLegacyModule(panelId) {
  const entry = LEGACY_MODULES.find((m) => m.panelId === panelId);
  if (!entry) return null;
  const mod = await entry.load();
  return mod.default ?? null;
}
