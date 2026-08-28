import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jsPDF } from 'jspdf';

/**
 * TESTING-ONLY sink for incoming analyzer results.
 *
 * When LIS_DUMP_RESULTS_PDF is enabled, every result that reaches
 * POST /api/lab/analyzer/results is rendered to a PDF verbatim — no barcode
 * matching, no patient lookup, no database writes. It exists so that during
 * bring-up/testing a machine's output can be captured and eyeballed without any
 * of the "positive match only" safety plumbing getting in the way.
 *
 * This MUST NOT be enabled in production: it bypasses the entire safety model
 * (a result is never attributed to a patient, but it is also never verified,
 * matched, or de-duplicated). The normal flow remains the default; this only
 * runs when the flag is explicitly set.
 */

/** True only when the dump flag is explicitly turned on. */
export function isPdfDumpEnabled() {
  const v = String(process.env.LIS_DUMP_RESULTS_PDF ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

const APP_DIR_NAME = 'rk-clinic';

/**
 * Per-user application data directory, mirroring desktop/paths.js so the desktop
 * build and a plain `next dev` agree. In the packaged app this lands under
 * %APPDATA%\rk-clinic (Windows) / Application Support (mac). An explicit
 * LIS_DUMP_RESULTS_DIR overrides everything.
 */
function userDataDir() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_DIR_NAME);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, APP_DIR_NAME);
}

/** Directory the PDFs are written to. Created on demand. */
export function dumpDir() {
  const override = String(process.env.LIS_DUMP_RESULTS_DIR ?? '').trim();
  if (override) return override;
  // In dev the cwd is the project root; a project-local folder is easiest to find.
  if (process.env.NODE_ENV !== 'production') {
    return path.join(process.cwd(), 'received-results');
  }
  return path.join(userDataDir(), 'received-results');
}

/** Filesystem-safe slug for building a filename from analyzer/specimen ids. */
function slug(v, fallback) {
  const s = String(v ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || fallback;
}

function fmt(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * Render one incoming result payload to a PDF on disk. Best-effort: any failure
 * is thrown to the caller to log; it must never take down ingestion.
 *
 * @param {object} payload
 * @param {string} payload.analyzerId
 * @param {string} payload.specimenId
 * @param {string} [payload.messageId]
 * @param {Array}  payload.tests    [{ code|name, value, unit, flag }]
 * @param {string} [payload.raw]
 * @param {Array}  [payload.images]
 * @param {string} [payload.actorName]
 * @returns {{ filePath: string, fileName: string }}
 */
export function dumpResultToPdf({ analyzerId, specimenId, messageId, tests, raw, images, actorName }) {
  const dir = dumpDir();
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `${slug(analyzerId, 'analyzer')}_${slug(specimenId, 'specimen')}_${stamp}.pdf`;
  const filePath = path.join(dir, fileName);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottom = pageHeight - 40;
  let y = 54;

  const line = (text, { size = 10, bold = false, gap = 16, color = [30, 30, 30] } = {}) => {
    if (y > bottom) { doc.addPage(); y = 54; }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(String(text), pageWidth - marginX * 2);
    for (const w of wrapped) {
      if (y > bottom) { doc.addPage(); y = 54; }
      doc.text(w, marginX, y);
      y += gap;
    }
  };

  // ── Header ──
  line('RK Clinic LIS — Received Analyzer Result', { size: 16, bold: true, gap: 22 });
  line('TESTING CAPTURE — not matched to any patient, not verified.', { size: 9, color: [180, 60, 60], gap: 18 });
  y += 4;

  // ── Metadata ──
  line(`Analyzer:    ${fmt(analyzerId)}`, { bold: true });
  line(`Specimen ID: ${fmt(specimenId)}`, { bold: true });
  line(`Message ID:  ${fmt(messageId)}`);
  line(`Received at: ${now.toLocaleString()} (${now.toISOString()})`);
  if (actorName) line(`Source:      ${fmt(actorName)}`);
  line(`Tests:       ${Array.isArray(tests) ? tests.length : 0}`);
  if (Array.isArray(images) && images.length) line(`Images:      ${images.length} (not embedded)`);
  y += 8;

  // ── Results table ──
  line('Results', { size: 12, bold: true, gap: 18 });

  const cols = [
    { key: 'code', label: 'Test', x: marginX, w: 200 },
    { key: 'value', label: 'Value', x: marginX + 200, w: 110 },
    { key: 'unit', label: 'Unit', x: marginX + 310, w: 110 },
    { key: 'flag', label: 'Flag', x: marginX + 420, w: 80 },
  ];

  const drawRow = (cells, { bold = false } = {}) => {
    if (y > bottom) { doc.addPage(); y = 54; }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    for (const c of cols) {
      const text = doc.splitTextToSize(fmt(cells[c.key]), c.w - 6);
      doc.text(text.length ? text[0] : '', c.x, y);
    }
    y += 15;
  };

  drawRow({ code: 'Test', value: 'Value', unit: 'Unit', flag: 'Flag' }, { bold: true });
  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y - 10, pageWidth - marginX, y - 10);

  const list = Array.isArray(tests) ? tests : [];
  if (!list.length) {
    line('(no test values in payload)', { size: 9, color: [120, 120, 120] });
  } else {
    for (const t of list) {
      drawRow({
        code: t.code ?? t.name ?? '',
        value: t.value ?? '',
        unit: t.unit ?? '',
        flag: t.flag ?? '',
      });
    }
  }

  // ── Raw message ──
  if (raw) {
    y += 12;
    line('Raw message', { size: 12, bold: true, gap: 18 });
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    const rawLines = doc.splitTextToSize(String(raw), pageWidth - marginX * 2);
    for (const rl of rawLines) {
      if (y > bottom) { doc.addPage(); y = 54; }
      doc.text(rl, marginX, y);
      y += 11;
    }
  }

  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(filePath, buffer);

  return { filePath, fileName };
}
