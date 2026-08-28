/**
 * Central navigation model for the Laboratory Information System (LIS).
 *
 * This is the single source of truth for what the signed-in user can reach.
 * Before this module the navigation was duplicated in three places
 * (`app/page.js`, `Sidebar.jsx` and `Header.jsx`) which had already drifted
 * out of sync — `Header.jsx` still listed modules that were no longer routed.
 *
 * Scope: the client is running the laboratory workflow only, so this file
 * intentionally lists LIS destinations exclusively. The remaining hospital
 * modules stay in the repository as working code and are catalogued in
 * `src/lib/legacy-modules.js`; they are simply not reachable from the UI.
 */

import {
  Activity,
  ChartColumn,
  ClipboardPlus,
  Cpu,
  FileText,
  FlaskConical,
  Inbox,
  LayoutGrid,
  Package,
  PencilLine,
  Route,
  Scan,
  Settings,
  ShieldCheck,
  Siren,
  Stethoscope,
  Target,
  TestTubes,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';

/** Every role the auth layer can issue. */
export const ROLE_IDS = [
  'admin',
  'doctor',
  'pathologist',
  'senior_technician',
  'technician',
  'receptionist',
  'nurse_pharmacy',
];

/** Human-readable role names used in the profile menu and role switcher. */
export const ROLE_LABELS = {
  admin: 'Administrator',
  doctor: 'Doctor (MD)',
  pathologist: 'Pathologist',
  senior_technician: 'Senior Technician',
  technician: 'Laboratory Technician',
  receptionist: 'Receptionist',
  nurse_pharmacy: 'Nurse (Collection)',
};

/**
 * Rail groups, rendered top to bottom with a hairline divider between them.
 * Grouping keeps an icon-only rail scannable as the module count grows.
 */
export const NAV_GROUPS = [
  { id: 'overview', label: 'Overview' },
  { id: 'workflow', label: 'Specimen workflow' },
  { id: 'oversight', label: 'Clinical oversight' },
  { id: 'resources', label: 'Lab resources' },
];

/**
 * LIS destinations.
 *
 * @property id      Panel id consumed by the switch in `app/page.js`.
 * @property label   Accessible name; also the rail tooltip.
 * @property icon    lucide-react component rendered in the rail.
 * @property group   One of NAV_GROUPS.
 * @property roles   Roles allowed to see the item.
 */
export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutGrid,
    group: 'overview',
    roles: ['admin', 'technician', 'senior_technician', 'pathologist'],
  },
  {
    id: 'doctor_portal',
    label: 'Clinician Portal',
    icon: Stethoscope,
    group: 'overview',
    roles: ['admin', 'doctor'],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: ChartColumn,
    group: 'overview',
    roles: ['admin', 'doctor', 'pathologist', 'senior_technician', 'technician'],
  },

  {
    id: 'order_entry',
    label: 'Order Entry',
    icon: ClipboardPlus,
    group: 'workflow',
    roles: ['admin', 'doctor', 'receptionist'],
  },
  {
    id: 'registration',
    label: 'Patient Registry',
    icon: Users,
    group: 'workflow',
    roles: ['admin', 'receptionist'],
  },
  {
    id: 'sample_collection',
    label: 'Sample Collection',
    icon: TestTubes,
    group: 'workflow',
    roles: ['admin', 'technician', 'senior_technician', 'nurse_pharmacy'],
  },
  {
    id: 'specimen_tracking',
    label: 'Specimen Tracking',
    icon: Route,
    group: 'workflow',
    roles: ['admin', 'technician', 'senior_technician', 'nurse_pharmacy'],
  },
  {
    id: 'analyzer_results',
    label: 'Analyzer Results',
    icon: Activity,
    group: 'workflow',
    roles: ['admin', 'technician', 'senior_technician', 'receptionist'],
  },
  {
    id: 'exception_queue',
    label: 'Exception Queue',
    icon: Inbox,
    group: 'workflow',
    roles: ['admin', 'technician', 'senior_technician'],
  },
  {
    id: 'manual_entry',
    label: 'Manual Entry',
    icon: PencilLine,
    group: 'workflow',
    roles: ['admin', 'technician', 'senior_technician'],
  },

  {
    id: 'verification',
    label: 'Verification',
    icon: ShieldCheck,
    group: 'oversight',
    roles: ['admin', 'technician', 'senior_technician', 'pathologist'],
  },
  {
    id: 'critical_results',
    label: 'Critical Alerts',
    icon: Siren,
    group: 'oversight',
    roles: ['admin', 'technician', 'senior_technician', 'pathologist'],
  },
  {
    id: 'delta_review',
    label: 'Delta Review',
    icon: TrendingUp,
    group: 'oversight',
    roles: ['admin', 'technician', 'senior_technician', 'pathologist'],
  },
  {
    id: 'quality_control',
    label: 'Quality Control',
    icon: Target,
    group: 'oversight',
    roles: ['admin', 'technician', 'senior_technician', 'pathologist'],
  },

  {
    id: 'lab_reports',
    label: 'Report Centre',
    icon: FileText,
    group: 'resources',
    roles: ['admin', 'doctor', 'pathologist', 'senior_technician', 'technician'],
  },
  {
    id: 'laboratory',
    label: 'Lab Bench',
    icon: FlaskConical,
    group: 'resources',
    roles: ['admin', 'technician', 'senior_technician'],
  },
  {
    id: 'analyzer_mgmt',
    label: 'Analyzer Management',
    icon: Cpu,
    group: 'resources',
    roles: ['admin', 'technician', 'senior_technician'],
  },
  {
    id: 'maglumi_control',
    label: 'Maglumi 800',
    icon: Scan,
    group: 'resources',
    roles: ['admin', 'technician', 'senior_technician'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    group: 'resources',
    roles: ['admin', 'technician', 'senior_technician'],
  },
];

/** Pinned to the foot of the rail, above the logout control. */
export const UTILITY_ITEMS = [
  { id: 'admin', label: 'User Management', icon: UserCog, roles: ['admin'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ROLE_IDS },
];

/**
 * Where each role lands on sign-in. Roles without a dashboard are sent to the
 * screen they actually work in, so nobody opens on an empty panel.
 */
export const ROLE_LANDING = {
  admin: 'dashboard',
  technician: 'dashboard',
  senior_technician: 'dashboard',
  pathologist: 'verification',
  doctor: 'doctor_portal',
  receptionist: 'order_entry',
  nurse_pharmacy: 'sample_collection',
};

const allowedFor = (role) => (item) => item.roles.includes(role);

/** Nav items visible to `role`, in rail order. */
export function navItemsForRole(role) {
  return NAV_ITEMS.filter(allowedFor(role));
}

/** Utility items visible to `role`. */
export function utilityItemsForRole(role) {
  return UTILITY_ITEMS.filter(allowedFor(role));
}

/**
 * Nav items for `role` bucketed into NAV_GROUPS order, with empty groups
 * dropped so the rail never renders a stray divider.
 */
export function groupedNavForRole(role) {
  const visible = navItemsForRole(role);
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: visible.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);
}

/** True when `role` is allowed to open `panelId`. */
export function canAccessPanel(role, panelId) {
  return [...NAV_ITEMS, ...UTILITY_ITEMS].some(
    (item) => item.id === panelId && item.roles.includes(role)
  );
}

/** The landing panel for `role`, falling back to its first visible item. */
export function landingPanelForRole(role) {
  const preferred = ROLE_LANDING[role];
  if (preferred && canAccessPanel(role, preferred)) return preferred;
  return navItemsForRole(role)[0]?.id || 'settings';
}

/** Display label for a panel id, for headings and breadcrumbs. */
export function panelLabel(panelId) {
  return (
    [...NAV_ITEMS, ...UTILITY_ITEMS].find((item) => item.id === panelId)?.label || ''
  );
}
