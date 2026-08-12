#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — on-prem Analyzer Bridge
 * ============================================================================
 * The piece between the instrument and the web app. Next.js route handlers
 * cannot hold a raw TCP socket open, so this runs as its own long-lived
 * process on the lab PC:
 *
 *   Hemat 60  --TCP-->  this bridge  --HTTPS-->  POST /api/lab/analyzer/results
 *
 *   node tools/lis-bridge.mjs
 *
 * Configuration (all via .env.local, loaded below):
 *   LIS_ANALYZER_API_KEY   required — shared secret, sent as x-lis-api-key
 *   LIS_BASE_URL           default http://localhost:3000
 *   BRIDGE_PORT            default 8080 — must match the analyzer's LIS Port
 *   BRIDGE_ANALYZER_ID     default hemat60 — must match analyzer_connections.id
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROTOCOL (established from a live capture, not from documentation)
 *
 *   transport : TCP, analyzer dials in to the address set as "LIS IP"
 *   framing   : MLLP — <VT> message <FS><CR>
 *   payload   : HL7 v2.3.1, ORU^R01
 *   idle      : a lone <STX> every 3.000s as a keep-alive, needing no reply
 *
 * Note the keep-alive is 0x02, which is also ASTM's frame-start byte. This
 * instrument is NOT ASTM: a 22 KB capture contained zero 0x03/<ETX> bytes.
 * Treating 0x02 as a frame start is the trap here, and isKeepAlive() exists to
 * avoid it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { onShutdown } from './lib/shutdown.mjs';
import { dataDir } from './lib/data-dir.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = parseInt(process.env.BRIDGE_PORT || '8080', 10);
const BASE_URL = (process.env.LIS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.LIS_ANALYZER_API_KEY;
const ANALYZER_ID = process.env.BRIDGE_ANALYZER_ID || 'hemat60';
const REPLAY = process.argv.includes('--replay');

const SPOOL_DIR = dataDir('bridge-spool');
const RAW_DIR = dataDir('bridge-raw');
fs.mkdirSync(SPOOL_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
const log = (m) => console.log(`[${ts()}] ${m}`);
const warn = (m) => console.warn(`[${ts()}] ⚠  ${m}`);

/* ══════════════════════════════════════════════════════════════════════════
 * Parameter map — Hemat 60 (Genrui, 3-part diff, firmware V1.3.1.33)
 *
 * Read off the instrument's own result screen, so the codes and units match
 * what it displays. `catalogName` is what the LIS matches on: applyAnalyzerResults()
 * compares the incoming code case-insensitively against the ordered test's
 * name, updating that row when it matches and appending a new result row when
 * it does not. HGB is the one parameter that already exists in
 * lab_test_catalog (as "Hemoglobin"), so it is mapped onto it deliberately.
 * ══════════════════════════════════════════════════════════════════════════ */
export const HEMAT60_PARAMS = [
  { code: 'WBC',    catalogName: 'WBC',                unit: '10^9/L' },
  { code: 'LYM#',   catalogName: 'Lymphocyte Absolute', unit: '10^9/L', aliases: ['LYMPH#', 'LY#'] },
  { code: 'MID#',   catalogName: 'Mid Cell Absolute',   unit: '10^9/L' },
  { code: 'GRAN#',  catalogName: 'Granulocyte Absolute', unit: '10^9/L', aliases: ['GRA#'] },
  { code: 'LYM%',   catalogName: 'Lymphocyte Percent',  unit: '%', aliases: ['LYMPH%', 'LY%'] },
  { code: 'MID%',   catalogName: 'Mid Cell Percent',    unit: '%' },
  { code: 'GRAN%',  catalogName: 'Granulocyte Percent', unit: '%', aliases: ['GRA%'] },
  { code: 'RBC',    catalogName: 'RBC',                unit: '10^12/L' },
  { code: 'HGB',    catalogName: 'Hemoglobin',         unit: 'g/dL', aliases: ['HB'] },
  { code: 'HCT',    catalogName: 'Hematocrit',         unit: '%' },
  { code: 'MCV',    catalogName: 'MCV',                unit: 'fL' },
  { code: 'MCH',    catalogName: 'MCH',                unit: 'pg' },
  { code: 'MCHC',   catalogName: 'MCHC',               unit: 'g/dL' },
  { code: 'RDW-CV', catalogName: 'RDW-CV',             unit: '%' },
  { code: 'RDW-SD', catalogName: 'RDW-SD',             unit: 'fL' },
  { code: 'PLT',    catalogName: 'Platelet Count',     unit: '10^9/L' },
  { code: 'MPV',    catalogName: 'MPV',                unit: 'fL' },
  // PDW's unit was not shown on the instrument screen; confirm before relying on it.
  { code: 'PDW',    catalogName: 'PDW',                unit: '' },
  { code: 'PCT',    catalogName: 'Plateletcrit',       unit: '%' },
  { code: 'PLCC',   catalogName: 'Large Platelet Count', unit: '10^9/L', aliases: ['P-LCC'] },
  { code: 'PLCR',   catalogName: 'Large Platelet Ratio', unit: '%', aliases: ['P-LCR'] },
];

const PARAM_BY_TOKEN = new Map();
for (const p of HEMAT60_PARAMS) {
  for (const token of [p.code, ...(p.aliases || [])]) {
    PARAM_BY_TOKEN.set(token.toUpperCase().replace(/[\s_-]/g, ''), p);
  }
}

/** Resolve an analyzer-reported token to our canonical parameter, or null. */
export function resolveParam(token) {
  return PARAM_BY_TOKEN.get(String(token).toUpperCase().replace(/[\s_-]/g, '')) || null;
}

/** The instrument prints ↑ / ↓ / ? next to abnormal values. */
export function normaliseFlag(raw) {
  const s = String(raw || '').trim();
  if (s.includes('↑') || /^H$/i.test(s)) return 'H';
  if (s.includes('↓') || /^L$/i.test(s)) return 'L';
  if (s.includes('?')) return 'A';       // instrument-suspect result
  return '';
}

/* ══════════════════════════════════════════════════════════════════════════
 * Framing
 * ══════════════════════════════════════════════════════════════════════════ */

const CTRL_SET = new Set([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0a, 0x0d, 0x11, 0x15, 0x16, 0x17]);

/** A lone control byte is the 3-second keep-alive, not data. */
function isKeepAlive(buf) {
  return buf.length === 1 && CTRL_SET.has(buf[0]);
}

const MLLP_START = 0x0b;   // <VT>
const MLLP_END = 0x1c;     // <FS>

/**
 * Split a receive buffer into complete MLLP-framed messages.
 *
 * Confirmed against a real Hemat 60 capture: the instrument wraps each HL7
 * message as <VT> … <FS><CR>, the standard MLLP envelope. It is NOT ASTM —
 * there were zero 0x03/<ETX> bytes in a 22 KB capture, so an <ETX> scan would
 * never have terminated a frame.
 *
 * The lone 0x02/<STX> keep-alive is unrelated to framing and is filtered
 * upstream by isKeepAlive(), which matters because a naive <STX> scan would
 * otherwise treat every heartbeat as the start of a message.
 *
 * A 21 KB message arrives across several TCP segments, so partial data is
 * returned in `rest` and carried into the next read.
 *
 * @returns {{frames: Buffer[], rest: Buffer}}
 */
export function splitFrames(buffer) {
  const frames = [];
  let rest = buffer;

  for (;;) {
    const start = rest.indexOf(MLLP_START);
    if (start === -1) break;
    const end = rest.indexOf(MLLP_END, start + 1);
    if (end === -1) {
      // Message still arriving; drop anything before <VT> as noise.
      rest = rest.subarray(start);
      break;
    }
    frames.push(rest.subarray(start + 1, end));   // payload without the envelope
    // Skip <FS> and the trailing <CR>.
    rest = rest.subarray(Math.min(end + 2, rest.length));
  }

  return { frames, rest };
}

class FrameFormatUnknown extends Error {}

/** OBX value types that carry an embedded image rather than a result. */
const IMAGE_VALUE_TYPES = new Set(['ED', 'RP']);

/** Refuse anything implausible for a histogram; MEDIUMBLOB tops out at 16 MB. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** HL7 ED data-subtype → MIME. Keys are lower-cased subtypes as sent. */
const IMAGE_SUBTYPE_MIME = {
  'image-png': 'image/png', png: 'image/png',
  'image-bmp': 'image/bmp', bmp: 'image/bmp',
  'image-jpeg': 'image/jpeg', jpeg: 'image/jpeg', jpg: 'image/jpeg',
  'image-gif': 'image/gif', gif: 'image/gif',
};

/** File signatures, checked against the bytes we actually decoded. */
const IMAGE_MAGIC = [
  { mime: 'image/png', hex: '89504e47' },
  { mime: 'image/jpeg', hex: 'ffd8ff' },
  { mime: 'image/gif', hex: '47494638' },
  { mime: 'image/bmp', hex: '424d' },
];

/** MIME implied by the bytes themselves, or null if unrecognised. */
function sniffMime(bytes) {
  const head = bytes.subarray(0, 4).toString('hex');
  return IMAGE_MAGIC.find((m) => head.startsWith(m.hex))?.mime || null;
}

/** Pixel dimensions read from the image header, for PNG and BMP. */
function imageSize(mime, bytes) {
  try {
    if (mime === 'image/png' && bytes.length >= 24) {
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    if (mime === 'image/bmp' && bytes.length >= 26) {
      return { width: bytes.readInt32LE(18), height: Math.abs(bytes.readInt32LE(22)) };
    }
  } catch { /* a malformed header is not worth failing the whole message over */ }
  return { width: null, height: null };
}

/**
 * "WBC Histogram BMP" → "WBC". The short form is what a reviewer needs as a
 * caption; the instrument's full name is kept alongside it.
 */
function shortImageLabel(name) {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? first.toUpperCase() : '';
}

/** Encodings the HL7 ED type allows. Only base64 is decodable here. */
const ED_ENCODINGS = new Set(['base64', 'hex', 'a']);

/**
 * Decode one OBX-5 encapsulated-data field.
 *
 * HL7 ED is nominally source app ^ type ^ subtype ^ encoding ^ data, but this
 * instrument is not consistent about the optional leading source-application
 * component, and gets it wrong within a single message:
 *
 *   WBC:  ^Application^Image-PNG^Base64^iVBORw0…    (5 components, leading empty)
 *   RBC:   Application^Image-PNG^Base64^iVBORw0…    (4 components, no leading)
 *
 * So the components are identified by what they are, not where they sit: the
 * payload is always the last one, and encoding/subtype are matched against
 * known vocabularies. Indexing positionally silently dropped two of the three
 * histograms — the payload landed in the encoding slot and was rejected as an
 * "unsupported encoding".
 *
 * Two further traps:
 *
 *  • The instrument names these segments "WBC Histogram BMP" but the payload is
 *    genuinely PNG. The name is a label, not a format — so the declared subtype
 *    is used and then confirmed against the file signature. Trusting the name
 *    would write .bmp files full of PNG bytes.
 *  • Only Base64 is decoded. Hex and raw ("A") encodings are legal in the
 *    standard; rather than guess and store corrupt bytes, they are reported as
 *    undecodable so the log says so out loud.
 *
 * @returns {{ok: true, mime, bytes, width, height} | {ok: false, reason: string}}
 */
function parseEncapsulated(field) {
  const parts = String(field || '').split('^').map((p) => p.trim());
  if (parts.length < 2) return { ok: false, reason: 'not an ED field' };

  // The payload is always last; everything before it describes it.
  const data = parts[parts.length - 1];
  const descriptors = parts.slice(0, -1).filter(Boolean);

  const encoding = (descriptors.find((p) => ED_ENCODINGS.has(p.toLowerCase())) || '').toLowerCase();
  const subtype = (descriptors.find((p) => IMAGE_SUBTYPE_MIME[p.toLowerCase()]) || '').toLowerCase();

  if (!data) return { ok: false, reason: 'empty payload' };
  if (encoding && encoding !== 'base64') {
    return { ok: false, reason: `unsupported encoding "${encoding}"` };
  }

  let bytes;
  try {
    bytes = Buffer.from(data, 'base64');
  } catch {
    return { ok: false, reason: 'base64 decode failed' };
  }
  if (!bytes.length) return { ok: false, reason: 'decoded to zero bytes' };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, reason: `${bytes.length} bytes exceeds the ${MAX_IMAGE_BYTES} byte cap` };
  }

  const sniffed = sniffMime(bytes);
  if (!sniffed) return { ok: false, reason: 'decoded bytes are not a recognised image' };

  const declared = IMAGE_SUBTYPE_MIME[subtype] || null;
  const mime = sniffed;
  const { width, height } = imageSize(mime, bytes);

  return {
    ok: true,
    mime,
    declaredMime: declared,
    mismatch: declared && declared !== sniffed ? `declared ${declared}, actually ${sniffed}` : null,
    bytes,
    width,
    height,
  };
}

/**
 * Histogram discriminator lines, e.g. "WBC Lym Left line" = 30.
 *
 * These are the dashed verticals on the printed curve — the cursor positions
 * the instrument used to split the differential. Kept with the image so a
 * viewer can annotate the plot rather than show a bare bitmap.
 */
function parseHistogramMarker(code, name, value) {
  const cleaned = String(name || '').replace(/\s*line$/i, '').trim();
  const tokens = cleaned.split(/\s+/);
  const channel = tokens.length > 1 ? tokens[0].toUpperCase() : '';
  const label = tokens.length > 1 ? tokens.slice(1).join(' ') : cleaned;
  const numeric = Number(value);
  return {
    code,
    name,
    channel,
    label,
    value: Number.isFinite(numeric) ? numeric : value,
  };
}

/**
 * OBX entries that are not clinical results and must not land on a patient
 * record as one. The Hemat 60 mixes three kinds of thing into its OBX list:
 *
 *  • histogram discriminator positions (codes 15001–15113, names ending
 *    "line") — instrument geometry for redrawing the curve, not a measurement
 *  • demographics it is echoing back (Age)
 *  • operational fields (Blood Mode, Remark)
 *
 * These are captured into `meta` instead, so nothing is lost.
 */
const NON_RESULT_CODES = new Set([
  '30525-0',  // Age
  '08002',    // Blood Mode
  '01001',    // Remark
]);
const isHistogramGeometry = (code, name) =>
  /^15\d{3}$/.test(code) || /\bline$/i.test(name);

/** HL7 escape sequences that can appear inside a field. */
function unescapeHl7(value) {
  return String(value)
    .replace(/\\F\\/g, '|')
    .replace(/\\S\\/g, '^')
    .replace(/\\T\\/g, '&')
    .replace(/\\R\\/g, '~')
    .replace(/\\E\\/g, '\\');
}

/** "20260806122229" -> ISO-ish "2026-08-06T12:22:29" */
function hl7Timestamp(value) {
  const m = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

/**
 * Turn one MLLP payload into the ingest payload.
 *
 * Written against a real Hemat 60 message (firmware V1.3.1.33):
 *
 *   MSH|^~\&|||||20260806122245||ORU^R01|0|P|2.3.1||||||UNICODE||
 *   PID|1||||sivaswamy|||Male
 *   PV1|1||
 *   OBR|1||1272||||20260806122229|...|HM||||||||Admin
 *   OBX|1|NM|6690-2^WBC^99MRC||7.2|10^9/L|||||F
 *   OBX|30|ED|15008^WBC Histogram BMP^99MRC||^Application^Image-PNG^Base64^iVBOR…
 *
 * Field positions were verified against the capture, not assumed:
 *   OBR-3  sample id ("1272")        PID-5  patient name
 *   OBR-7  observation timestamp     PID-8  gender
 *   OBX-2  value type   OBX-3  code^name^system
 *   OBX-5  value        OBX-6  units     OBX-8  abnormal flag
 *
 * Two traps this deliberately avoids:
 *
 *  • OBX-6 is read RAW. Units arrive as "10^9/L", and `^` is HL7's component
 *    separator, so component-splitting yields "10" — a silently wrong unit on
 *    every cell count.
 *  • ED/RP segments carry base64 PNG histograms (~5 KB each, three per record,
 *    which is 86% of the 21 KB message). They are decoded into `images` and
 *    never pushed into `tests` — an image is not a measurement.
 *
 * @returns {{
 *   specimenId: string,
 *   tests: Array<{code,value,unit,flag}>,
 *   images: Array<{code,name,label,mimeType,width,height,byteSize,base64,markers}>,
 *   raw: string,
 *   meta: object
 * }}
 */
export function parseFrame(frame) {
  const text = frame.toString('latin1');
  const segments = text.split('\r').map((s) => s.trim()).filter(Boolean);
  if (!segments.length) throw new FrameFormatUnknown('empty message');

  const find = (type) => segments.find((s) => s.startsWith(type + '|'));
  const fieldsOf = (segment) => (segment ? segment.split('|') : []);

  const msh = fieldsOf(find('MSH'));
  const messageType = msh[8] || '';
  if (msh.length && !messageType.startsWith('ORU')) {
    // Only unsolicited results carry patient data; anything else is not ours.
    throw new FrameFormatUnknown(`unsupported HL7 message type "${messageType}"`);
  }

  const obr = fieldsOf(find('OBR'));
  const pid = fieldsOf(find('PID'));

  const specimenId = (obr[3] || '').trim();
  if (!specimenId) {
    throw new FrameFormatUnknown('no sample id in OBR-3 — cannot match safely');
  }

  const tests = [];
  const images = [];
  const markers = [];
  const extras = {};
  const imageWarnings = [];
  let geometry = 0;

  for (const segment of segments) {
    if (!segment.startsWith('OBX|')) continue;
    const f = segment.split('|');

    const identifier = (f[3] || '').split('^');
    const code = unescapeHl7(identifier[0] || '').trim();
    const name = unescapeHl7(identifier[1] || '').trim();

    // ── Encapsulated images (the cell-distribution histograms) ──
    // Note this reads OBX-5 raw rather than the unescaped value: base64 is
    // '^'-free by definition but escape-processing a 7 KB payload would be
    // pointless work, and the ED components are themselves '^'-delimited.
    const valueType = (f[2] || '').trim();
    if (IMAGE_VALUE_TYPES.has(valueType)) {
      const decoded = parseEncapsulated(f[5] || '');
      if (!decoded.ok) {
        imageWarnings.push(`${name || code}: ${decoded.reason}`);
        continue;
      }
      if (decoded.mismatch) imageWarnings.push(`${name || code}: ${decoded.mismatch}`);
      images.push({
        code: code || name,
        name,
        label: shortImageLabel(name),
        mimeType: decoded.mime,
        width: decoded.width,
        height: decoded.height,
        byteSize: decoded.bytes.length,
        // Re-encoded from the verified bytes rather than forwarding the original
        // string, so whatever reaches the LIS is known to decode to an image.
        base64: decoded.bytes.toString('base64'),
      });
      continue;
    }

    const value = unescapeHl7(f[5] || '').trim();
    const unit = unescapeHl7(f[6] || '').trim();     // RAW — see note above
    const flag = normaliseFlag(f[8] || '');

    if (!code && !name) continue;
    if (value === '') continue;                       // e.g. an empty Remark

    // Keep non-clinical entries out of the patient's result list.
    if (isHistogramGeometry(code, name)) {
      geometry += 1;
      markers.push(parseHistogramMarker(code, name, value));
      continue;
    }
    if (NON_RESULT_CODES.has(code)) { extras[name || code] = value; continue; }

    // Prefer our canonical name so applyAnalyzerResults() can match an ordered
    // test by name; fall back to whatever the instrument called it.
    const param = resolveParam(name) || resolveParam(code);

    tests.push({
      code: param ? param.catalogName : (name || code),
      value,
      unit: unit || (param ? param.unit : ''),
      flag,
      // Kept for traceability; ignored by the ingest endpoint.
      analyzerCode: code,
      analyzerName: name,
    });
  }

  if (!tests.length) throw new FrameFormatUnknown('no usable OBX results in message');

  // Attach each channel's discriminator lines to its own histogram, so the
  // image and the cursor positions that produced it travel together.
  for (const image of images) {
    image.markers = markers.filter((m) => m.channel && m.channel === image.label);
  }

  return {
    specimenId,
    tests,
    images,
    raw: text,
    meta: {
      messageType,
      // MSH is numbered with the field separator as MSH-1, so MSH-12 (version)
      // is index 11 once split on '|'. Off-by-one here is the classic HL7 trap.
      hl7Version: msh[11] || '',
      patientName: unescapeHl7(pid[5] || '') || null,
      gender: (pid[8] || '') || null,
      observedAt: hl7Timestamp(obr[7]),
      operator: (obr[32] || '') || null,
      department: (obr[24] || '') || null,
      imagesKept: images.length,
      imageWarnings,
      geometrySkipped: geometry,
      markers,
      extras,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Delivery
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Report the machine's live state to the LIS.
 *
 * `POST /api/lab/analyzer/status` is what drives the Analyzer Results screen's
 * status tiles and the dashboard's availability card — nothing else writes
 * `analyzer_connections.status`. Without this the instrument sits at "Offline"
 * in the UI no matter how healthy the socket is, which was exactly the symptom.
 *
 * The response may carry a queued control command for us to act on; it is
 * delivered once and then cleared server-side, so it must not be dropped
 * silently.
 *
 * @param {'active'|'online'|'offline'} status
 */
async function reportStatus(status, extra = {}) {
  try {
    const res = await fetch(`${BASE_URL}/api/lab/analyzer/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lis-api-key': API_KEY },
      body: JSON.stringify({
        analyzerId: ANALYZER_ID,
        status,
        name: 'Hemat 60',
        department: 'Hematology',
        protocol: 'HL7 v2.3.1 / MLLP',
        connectionType: 'Ethernet (TCP)',
        ...extra,
      }),
    });

    if (!res.ok) {
      warn(`status report rejected ${res.status} — analyzer tile will stay stale`);
      return;
    }

    const body = await res.json().catch(() => null);
    if (body?.command) {
      log(`⚙ command from LIS: ${body.command}`);
      handleCommand(body.command);
    }
  } catch (err) {
    // A heartbeat failure is not fatal; the analyzer link is unaffected.
    warn(`status report failed (${err.message})`);
  }
}

/**
 * Act on a control command handed back on the heartbeat. Anything not
 * implemented is logged rather than swallowed, so it is obvious that the
 * operator's request had no effect.
 */
function handleCommand(command) {
  switch (command) {
    case 'reconnect':
      // The analyzer is the TCP client, so we cannot dial it. Dropping our side
      // makes it redial, which is the closest equivalent.
      log('   → dropping the socket so the analyzer reconnects');
      for (const sock of liveSockets) sock.destroy();
      break;
    case 'maintenance_on':
    case 'maintenance_off':
    case 'disable':
    case 'enable':
    case 'restart':
      warn(`   → "${command}" is not implemented in the bridge; no action taken`);
      break;
    default:
      warn(`   → unrecognised command "${command}"; ignored`);
  }
}

/** Open analyzer sockets, so a reconnect command can cycle them. */
const liveSockets = new Set();

function messageIdFor(specimenId, tests) {
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify({ ANALYZER_ID, specimenId, tests }))
    .digest('hex').slice(0, 24);
  return `${ANALYZER_ID}:${specimenId}:${digest}`;
}

/**
 * POST one normalised result set. Returns an outcome string rather than
 * throwing, so the caller can decide whether to keep the spool file.
 */
async function deliver(payload) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/api/lab/analyzer/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lis-api-key': API_KEY },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    warn(`LIS unreachable (${err.message}) — keeping spool file for retry`);
    return 'retry';
  }

  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }

  if (res.status === 200) {
    if (body?.status === 'duplicate') {
      log(`↺ already processed (${payload.specimenId}) — nothing re-applied`);
      return 'done';
    }
    log(`✅ applied to order (${payload.specimenId}), ${payload.tests.length} parameter(s)`);
    return 'done';
  }
  if (res.status === 409) {
    // Expected whenever the analyzer's own Sample ID is not an accession number.
    log(`⏸ held as unmatched (${payload.specimenId}) — reconcile in the Exception Queue`);
    return 'done';
  }
  if (res.status === 401) {
    warn('401 Unauthorized — check LIS_ANALYZER_API_KEY matches the server, and restart next dev');
    return 'retry';
  }
  warn(`POST failed ${res.status}: ${body ? JSON.stringify(body).slice(0, 160) : '(no body)'}`);
  return res.status >= 500 ? 'retry' : 'drop';
}

/** Write a payload (or an unparsed frame) to the durable spool. */
function spool(name, contents) {
  const file = path.join(SPOOL_DIR, `${Date.now()}-${name}`);
  fs.writeFileSync(file, contents);
  return file;
}

/** Re-attempt every spooled payload. Used at startup and by --replay. */
async function drainSpool() {
  const files = fs.readdirSync(SPOOL_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) return;
  log(`spool: ${files.length} payload(s) pending`);
  for (const f of files) {
    const full = path.join(SPOOL_DIR, f);
    let payload;
    try { payload = JSON.parse(fs.readFileSync(full, 'utf8')); }
    catch { warn(`spool: ${f} is unreadable, leaving it`); continue; }

    const outcome = await deliver(payload);
    if (outcome === 'done' || outcome === 'drop') fs.unlinkSync(full);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * Server
 * ══════════════════════════════════════════════════════════════════════════ */

async function handleFrame(frame) {
  // Always keep the raw bytes; they are the only record of what arrived.
  const rawFile = path.join(RAW_DIR, `${Date.now()}-frame.bin`);
  fs.writeFileSync(rawFile, frame);

  let parsed;
  try {
    parsed = parseFrame(frame);
  } catch (err) {
    if (err instanceof FrameFormatUnknown) {
      warn(`${err.message}`);
      log(`   raw frame kept at ${rawFile}`);
      log('   → send this file over and the parser can be written against it');
      return;
    }
    warn(`parse error: ${err.message} — raw frame kept at ${rawFile}`);
    return;
  }

  const payload = {
    analyzerId: ANALYZER_ID,
    specimenId: parsed.specimenId,
    messageId: messageIdFor(parsed.specimenId, parsed.tests),
    tests: parsed.tests,
    images: parsed.images,
    raw: parsed.raw,
  };

  if (parsed.images.length) {
    const summary = parsed.images
      .map((i) => `${i.label || i.name} ${i.width}x${i.height} ${Math.round(i.byteSize / 1024)}KB`)
      .join(', ');
    log(`   🖼 ${parsed.images.length} histogram(s): ${summary}`);
  }
  for (const warning of parsed.meta.imageWarnings) warn(`   image: ${warning}`);

  const file = spool(`${payload.specimenId}.json`, JSON.stringify(payload, null, 2));
  const outcome = await deliver(payload);
  if (outcome === 'done' || outcome === 'drop') fs.unlinkSync(file);
}

function main() {
  if (!API_KEY) {
    console.error('❌ LIS_ANALYZER_API_KEY is not set in .env.local — refusing to start.');
    console.error('   Generate one with:  openssl rand -hex 32');
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log(' RK Clinic LIS — Analyzer Bridge');
  console.log(`  analyzer : ${ANALYZER_ID}`);
  console.log(`  LIS      : ${BASE_URL}`);
  console.log(`  listening: 0.0.0.0:${PORT} (analyzer dials in)`);
  console.log(`  spool    : ${SPOOL_DIR}`);
  console.log('  protocol : HL7 v2.3.1 ORU^R01 over MLLP');
  console.log('════════════════════════════════════════════════════════════\n');

  drainSpool().catch((e) => warn(`spool drain failed: ${e.message}`));
  if (REPLAY) return;

  // Tell the LIS the machine is down until it actually dials in, otherwise a
  // bridge restart would leave a stale "active" tile on screen.
  reportStatus('offline');

  const server = net.createServer((sock) => {
    const peer = `${sock.remoteAddress}:${sock.remotePort}`;
    log(`✅ analyzer connected: ${peer}`);
    liveSockets.add(sock);
    reportStatus('active');

    let buffer = Buffer.alloc(0);
    let beats = 0;
    let lastHeartbeatReport = Date.now();

    sock.on('data', (chunk) => {
      if (isKeepAlive(chunk)) {
        beats += 1;
        if (beats % 20 === 1) log(`♥ keep-alive ×${beats} — link healthy, idle`);
        // The analyzer beats every 3s; refreshing last_ping that often would be
        // pointless write load. Once a minute is enough to keep the tile live.
        if (Date.now() - lastHeartbeatReport > 60000) {
          lastHeartbeatReport = Date.now();
          reportStatus('active');
        }
        return;
      }

      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest } = splitFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        log(`⬇ frame: ${frame.length} bytes`);
        handleFrame(frame).catch((e) => warn(`frame handling failed: ${e.message}`));
      }

      // Guard against a runaway buffer if framing assumptions are wrong.
      if (buffer.length > 1_000_000) {
        warn('receive buffer exceeded 1 MB without a complete frame — flushing to spool');
        fs.writeFileSync(path.join(RAW_DIR, `${Date.now()}-overflow.bin`), buffer);
        buffer = Buffer.alloc(0);
      }
    });

    sock.on('close', () => {
      liveSockets.delete(sock);
      log(`🔌 disconnected: ${peer} (${beats} keep-alive(s))`);
      if (liveSockets.size === 0) reportStatus('offline');
    });
    sock.on('error', (e) => warn(`socket: ${e.message}`));
  });

  server.on('error', (err) => {
    console.error(`❌ ${err.message}${err.code === 'EADDRINUSE' ? ` — port ${PORT} is busy; stop the capture tool first` : ''}`);
    process.exit(1);
  });

  server.listen(PORT, () => log(`bridge ready on port ${PORT}`));

  onShutdown(() => {
    log('shutting down — marking the analyzer offline');
    // Best effort: don't leave a stale "active" tile behind.
    reportStatus('offline').finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}

/**
 * Only start the server when run directly. Without this guard, importing the
 * module to unit-test splitFrames()/parseFrame() would try to bind the port and
 * fail with EADDRINUSE whenever a capture tool is already listening.
 */
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();
