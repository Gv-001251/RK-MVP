import { v4 as uuidv4 } from 'uuid';
import { query as poolQuery } from '@/lib/mysql/db';

/**
 * Storage and retrieval for analyzer-generated images — the cell-distribution
 * histograms a haematology analyzer sends alongside the numbers.
 *
 * Images arrive with a message whether or not its barcode matched an order, so
 * they are stored against `message_id` with a nullable `lab_task_id`. The
 * automatic path sets the task immediately; the Exception Queue path calls
 * linkResultImages() when an operator reconciles the held result. One mechanism,
 * both routes.
 *
 * The bridge already decodes and checks these before sending. It is validated
 * again here on purpose: the bridge authenticates with a shared API key, and
 * anything holding that key could otherwise store arbitrary bytes that we would
 * later serve back with an image content type. Payloads are re-decoded, size
 * capped, and confirmed against a file signature before they reach the database.
 *
 * The signature check is duplicated from tools/lis-bridge.mjs rather than
 * imported. That bridge runs on-prem as a standalone Node process with no
 * bundler and no dependency on this source tree, and keeping it that way is
 * worth a few lines of repetition.
 */

/** Matches the bridge's cap. MEDIUMBLOB itself tops out at 16 MB. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** A haematology record carries three histograms; this is generous headroom. */
const MAX_IMAGES_PER_MESSAGE = 12;

const IMAGE_MAGIC = [
  { mime: 'image/png', hex: '89504e47' },
  { mime: 'image/jpeg', hex: 'ffd8ff' },
  { mime: 'image/gif', hex: '47494638' },
  { mime: 'image/bmp', hex: '424d' },
];

/** MIME implied by the bytes themselves, or null when unrecognised. */
function sniffMime(bytes) {
  const head = bytes.subarray(0, 4).toString('hex');
  return IMAGE_MAGIC.find((m) => head.startsWith(m.hex))?.mime || null;
}

const clamp = (v, max) => (v == null ? null : String(v).slice(0, max));
const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Turn the bridge's `images[]` into rows safe to insert, discarding anything
 * that does not decode to a recognised image.
 *
 * @param {Array} images  [{ code, name, label, mimeType, width, height, base64, markers }]
 * @returns {{rows: Array, rejected: Array<{code: string, reason: string}>}}
 */
export function normaliseResultImages(images) {
  const rows = [];
  const rejected = [];

  if (!Array.isArray(images) || !images.length) return { rows, rejected };

  for (const image of images.slice(0, MAX_IMAGES_PER_MESSAGE)) {
    const code = clamp(image?.code || image?.name || '', 40);
    if (!code) { rejected.push({ code: '(unnamed)', reason: 'no code or name' }); continue; }

    if (typeof image.base64 !== 'string' || !image.base64) {
      rejected.push({ code, reason: 'no base64 payload' });
      continue;
    }

    let bytes;
    try {
      bytes = Buffer.from(image.base64, 'base64');
    } catch {
      rejected.push({ code, reason: 'base64 decode failed' });
      continue;
    }
    if (!bytes.length) { rejected.push({ code, reason: 'decoded to zero bytes' }); continue; }
    if (bytes.length > MAX_IMAGE_BYTES) {
      rejected.push({ code, reason: `${bytes.length} bytes exceeds the cap` });
      continue;
    }

    // The bytes decide the type, not whatever the caller claimed.
    const mime = sniffMime(bytes);
    if (!mime) { rejected.push({ code, reason: 'not a recognised image format' }); continue; }

    const markers = Array.isArray(image.markers) && image.markers.length
      ? JSON.stringify(image.markers)
      : null;

    rows.push({
      code,
      name: clamp(image.name || code, 120),
      label: clamp(image.label || '', 40),
      mimeType: mime,
      width: asInt(image.width),
      height: asInt(image.height),
      byteSize: bytes.length,
      markersJson: markers,
      content: bytes,
    });
  }

  if (Array.isArray(images) && images.length > MAX_IMAGES_PER_MESSAGE) {
    rejected.push({
      code: '(overflow)',
      reason: `only the first ${MAX_IMAGES_PER_MESSAGE} images were stored`,
    });
  }

  return { rows, rejected };
}

/**
 * Insert images for a message. Idempotent on (message_id, code), so a bridge
 * retry updates in place rather than duplicating.
 *
 * @param {{query: Function}} exec  a transaction handle, or omitted for the pool
 */
export async function storeResultImages(exec, { messageId, analyzerId, specimenId, labTaskId, rows }) {
  const run = exec?.query ? exec.query.bind(exec) : poolQuery;
  if (!rows?.length) return 0;

  for (const r of rows) {
    await run(
      `INSERT INTO lab_result_images
         (id, message_id, lab_task_id, analyzer_id, specimen_id, code, name, label,
          mime_type, width, height, byte_size, markers_json, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         lab_task_id = VALUES(lab_task_id),
         mime_type   = VALUES(mime_type),
         width       = VALUES(width),
         height      = VALUES(height),
         byte_size   = VALUES(byte_size),
         markers_json= VALUES(markers_json),
         content     = VALUES(content)`,
      [
        uuidv4(), messageId, labTaskId || null, analyzerId, specimenId || null,
        r.code, r.name, r.label || null, r.mimeType, r.width, r.height,
        r.byteSize, r.markersJson, r.content,
      ]
    );
  }
  return rows.length;
}

/**
 * Attach a message's images to an order. Used when an operator reconciles a
 * held result from the Exception Queue — the images arrived unmatched and only
 * now have a patient to belong to.
 */
export async function linkResultImages(exec, { messageId, labTaskId }) {
  const run = exec?.query ? exec.query.bind(exec) : poolQuery;
  const res = await run(
    'UPDATE lab_result_images SET lab_task_id = ? WHERE message_id = ?',
    [labTaskId, messageId]
  );
  return res?.affectedRows || 0;
}

/**
 * Image metadata for an order — deliberately never selects `content`, so the
 * blobs are only read by the endpoint that streams one.
 */
export async function resultImagesForTask(labTaskId) {
  const rows = await poolQuery(
    `SELECT id, code, name, label, mime_type, width, height, byte_size, markers_json, analyzer_id, created_at
       FROM lab_result_images
      WHERE lab_task_id = ?
      ORDER BY label, name`,
    [labTaskId]
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    label: r.label || r.name,
    mimeType: r.mime_type,
    width: r.width,
    height: r.height,
    byteSize: r.byte_size,
    analyzerId: r.analyzer_id,
    createdAt: r.created_at,
    markers: (() => {
      if (!r.markers_json) return [];
      try { return JSON.parse(r.markers_json); } catch { return []; }
    })(),
    url: `/api/lab/results/images/${r.id}`,
  }));
}

/** One image's bytes plus what is needed to serve and authorise it. */
export async function resultImageContent(id) {
  const rows = await poolQuery(
    'SELECT id, lab_task_id, mime_type, byte_size, content FROM lab_result_images WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}
