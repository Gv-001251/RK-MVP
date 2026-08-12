/**
 * Shared, edge-safe auth configuration.
 *
 * resolveJwtSecret() centralises how the JWT signing/verification secret is
 * obtained and FAILS FAST in production if a strong secret has not been
 * configured — so the app can never run with the forgeable dev fallback.
 *
 * This module only touches process.env and throws, so it is safe to import
 * from both the Node runtime (route handlers) and the Edge runtime
 * (middleware.js).
 */

const DEV_FALLBACK = 'dev_secret_change_me';

/**
 * Values that pass an "is it set?" check while being no secret at all.
 *
 * The placeholder shipped in .env.example is exactly this shape, so an install
 * that copied the example forward would have had forgeable sessions while
 * appearing correctly configured — the failure is completely invisible from
 * outside, which is what makes it worth checking for explicitly.
 */
const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /^change[_-]?me/i,
  /^replace[_-]/i,
  /^secret$/i,
  /^test$/i,
];

/** Below this, a token signing key is worth brute-forcing. */
const MIN_SECRET_LENGTH = 32;

export function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;

  // `next build` evaluates modules to collect route metadata, and middleware.js
  // resolves this at module scope — so a strict check would make the BUILD depend
  // on production secrets being present. That is the wrong place to enforce it:
  // the machine that compiles the app is not the machine that serves it, and CI
  // has no business holding a clinic's signing key. Enforcement belongs at
  // runtime, which is where a forgeable token would actually be issued.
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  const isProd = process.env.NODE_ENV === 'production' && !isBuild;

  const missing = !secret || secret === DEV_FALLBACK;
  const placeholder = !!secret && PLACEHOLDER_PATTERNS.some((p) => p.test(secret));
  const tooShort = !!secret && secret.length < MIN_SECRET_LENGTH;

  if (missing || placeholder || tooShort) {
    if (isProd) {
      // Refusing to boot is correct. A weak signing key lets anyone mint a
      // session cookie for any role, admin included, against a system holding
      // patient records.
      const reason = missing
        ? 'not set, or still the development default'
        : placeholder
          ? 'still a placeholder value'
          : `too short — ${secret.length} characters, minimum ${MIN_SECRET_LENGTH}`;
      throw new Error(
        `FATAL: JWT_SECRET is ${reason}. Refusing to start, because sessions would be forgeable. `
        + 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    // Development / test only.
    return missing ? DEV_FALLBACK : secret;
  }

  return secret;
}

/**
 * Role groupings for LIS role-based access control (RBAC).
 * Kept here so route handlers share one source of truth.
 */
export const ROLES = {
  // Lab staff who operate the workflow engine and manage reagents.
  LAB_STAFF: ['technician', 'admin'],
  // Anyone allowed to read lab data (order, view, download reports).
  LAB_READ: ['doctor', 'technician', 'admin'],
  // Who may create a lab order (doctors order; techs register walk-ins).
  ORDER_CREATE: ['doctor', 'technician', 'admin'],
  // Order Entry module: doctors and receptionists raise/edit/cancel orders.
  ORDER_ENTRY: ['doctor', 'receptionist', 'admin'],
  // Sample collection: phlebotomists/nurses collect; lab staff receive/process.
  SAMPLE_COLLECT: ['technician', 'nurse_pharmacy', 'admin'],
  // Who may view the collection worklist / sample details.
  SAMPLE_READ: ['doctor', 'technician', 'nurse_pharmacy', 'admin'],
  // Who may acknowledge critical-value alerts.
  ALERT_ACK: ['doctor', 'technician', 'admin'],

  // ── Result verification hierarchy ──
  // Technician review: verify / reject a pending result.
  VERIFY_TECH: ['technician', 'senior_technician', 'admin'],
  // Senior final approval: approve + release.
  VERIFY_SENIOR: ['senior_technician', 'pathologist', 'admin'],
  // Pathologist: amend an already-released report.
  VERIFY_AMEND: ['pathologist', 'admin'],
  // Who may view verification worklist / details.
  VERIFY_READ: ['doctor', 'technician', 'senior_technician', 'pathologist', 'admin'],

  // ── Critical result detection ──
  // Who may configure critical-value thresholds (Admin Panel only).
  CRITICAL_CONFIG: ['admin'],
  // Who may view critical alerts, notifications, and history.
  CRITICAL_READ: ['doctor', 'technician', 'senior_technician', 'pathologist', 'admin'],
  // Who may confirm/acknowledge a critical result (technician confirmation).
  CRITICAL_ACK: ['technician', 'senior_technician', 'pathologist', 'admin'],

  // ── Delta check validation ──
  // Who may configure per-test delta thresholds (Admin Panel only).
  DELTA_CONFIG: ['admin'],
  // Who may view delta flags / rules.
  DELTA_READ: ['doctor', 'technician', 'senior_technician', 'pathologist', 'admin'],
  // Who may manually verify (review) a delta-flagged result.
  DELTA_REVIEW: ['technician', 'senior_technician', 'pathologist', 'admin'],

  // ── Analyzer management ──
  // Who may view the analyzer management dashboard + communication logs.
  ANALYZER_READ: ['doctor', 'technician', 'senior_technician', 'pathologist', 'admin'],
  // Who may control analyzer connections (reconnect / restart / disable / maintenance).
  ANALYZER_MANAGE: ['technician', 'senior_technician', 'admin'],

  // ── Exception / unmatched-result reconciliation queue ──
  // Who may view held (barcode-unmatched) analyzer results.
  EXCEPTION_READ: ['technician', 'senior_technician', 'pathologist', 'admin'],
  // Who may reconcile a held result — assign it to an order, or dismiss it.
  EXCEPTION_MANAGE: ['technician', 'senior_technician', 'admin'],

  // ── Quality Control ──
  // Who may view QC dashboards, charts, and reports.
  QC_READ: ['doctor', 'technician', 'senior_technician', 'pathologist', 'admin'],
  // Who may run QC (enter control results).
  QC_RUN: ['technician', 'senior_technician', 'admin'],
  // Who may configure QC materials / analyte targets.
  QC_CONFIG: ['senior_technician', 'admin'],
  // Who may override a failed QC batch (release the verification block).
  QC_OVERRIDE: ['senior_technician', 'pathologist', 'admin'],

  // ── Laboratory inventory ──
  // Who may view inventory, alerts, and reports.
  INVENTORY_READ: ['doctor', 'technician', 'senior_technician', 'pathologist', 'admin'],
  // Who may manage stock (items, stock in/out, adjustments).
  INVENTORY_MANAGE: ['technician', 'senior_technician', 'admin'],

  // ── Laboratory reports ──
  // Who may view / print report data and history.
  REPORT_READ: ['doctor', 'technician', 'senior_technician', 'pathologist', 'admin'],
  // Who may generate reports and email them out.
  REPORT_MANAGE: ['technician', 'senior_technician', 'pathologist', 'admin'],

  // ── Analytics ──
  // Who may view the laboratory analytics dashboard.
  ANALYTICS_READ: ['admin', 'doctor', 'senior_technician', 'pathologist', 'technician'],
};
