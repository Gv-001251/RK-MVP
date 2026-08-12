/**
 * ============================================================================
 * Store-and-forward delivery of analyzer results to the LIS
 * ============================================================================
 * Shared by the per-instrument bridges. Extracted from tools/lis-bridge.mjs,
 * which has carried the only working version of this since the Hemat 60 went
 * live; the Maglumi and Mispa bridges logged a warning and moved on when a POST
 * failed, which quietly loses a patient result.
 *
 * That was survivable while the LIS was on localhost. It stops being survivable
 * the moment the bridge sits in the lab and the server sits at the clinic: a WAN
 * link WILL drop, and the analyzer does not keep the result waiting for us.
 *
 * The contract is deliberately small:
 *
 *   send(payload)   deliver now; if the LIS cannot be reached, write the payload
 *                   to disk and report that it is queued. Never throws.
 *   drain()         retry everything queued, oldest first.
 *   start()/stop()  retry on a timer, so a result posts itself as soon as the
 *                   link returns rather than waiting for someone to restart us.
 *
 * Two decisions worth knowing about:
 *
 *   Ordering is preserved. drain() stops at the first payload that still cannot
 *   be delivered instead of skipping ahead, so results reach the LIS in the
 *   order the analyzer produced them and a dead link is not hammered once per
 *   queued file.
 *
 *   Nothing is ever discarded to keep the queue tidy. A 4xx that is not going to
 *   succeed on retry is dropped from the queue (it has been reported, and the
 *   raw bytes are kept separately by each bridge), but a full disk or a long
 *   outage produces a loud warning rather than a rotation that would throw away
 *   results.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Warn once the queue passes this, so an outage is visible before it's a crisis. */
const QUEUE_WARN_AT = 200;

/**
 * @param {object} opts
 * @param {string} opts.analyzerId    for log lines and the spool file name
 * @param {string} opts.baseUrl       LIS base URL, no trailing slash
 * @param {string} opts.apiKey        sent as x-lis-api-key
 * @param {string} opts.spoolDir      directory for queued payloads
 * @param {(m: string) => void} opts.log
 * @param {(m: string) => void} opts.warn
 * @param {boolean} [opts.dryRun]     log what would be sent, touch nothing
 * @param {number}  [opts.retryMs]    background retry interval
 * @param {typeof fetch} [opts.fetchImpl] injectable for tests
 */
export function createForwarder({
  analyzerId, baseUrl, apiKey, spoolDir,
  log = () => {}, warn = () => {},
  dryRun = false, retryMs = 60_000, fetchImpl = fetch,
}) {
  if (!dryRun) fs.mkdirSync(spoolDir, { recursive: true });

  let timer = null;
  let draining = false;

  /** Queued payload files, oldest first. Names start with a timestamp. */
  function queuedFiles() {
    if (!fs.existsSync(spoolDir)) return [];
    return fs.readdirSync(spoolDir).filter((f) => f.endsWith('.json')).sort();
  }

  function pendingCount() {
    return queuedFiles().length;
  }

  /**
   * Write a payload to the queue.
   *
   * The random suffix matters: two results for the same sample can be produced
   * inside one millisecond, and a name collision would mean the second one
   * overwrites the first.
   */
  function enqueue(payload) {
    const safeId = String(payload.specimenId || 'no-id').replace(/[^\w.-]/g, '_').slice(0, 40);
    const suffix = crypto.randomBytes(3).toString('hex');
    const file = path.join(spoolDir, `${Date.now()}-${safeId}-${suffix}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    return file;
  }

  /**
   * POST one payload.
   *
   * Returns an outcome rather than throwing, because the caller's decision is
   * always the same three-way choice: forget it, keep it for later, or give up
   * on it.
   *
   * @returns {Promise<'done'|'retry'|'drop'>}
   */
  async function deliver(payload) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/api/lab/analyzer/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lis-api-key': apiKey },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      warn(`LIS unreachable (${err.message}) — result queued for retry`);
      return 'retry';
    }

    let body = null;
    try { body = await res.json(); } catch { /* an HTML error page, most likely */ }

    if (res.status === 200) {
      log(body?.status === 'duplicate'
        ? `↺ already processed (${payload.specimenId}) — nothing re-applied`
        : `✅ applied to order (${payload.specimenId}), ${payload.tests?.length ?? 0} result(s)`);
      return 'done';
    }

    // Expected whenever the analyzer's own sample number is not an accession.
    if (res.status === 409) {
      log(`⏸ held as unmatched (${payload.specimenId}) — reconcile in the Exception Queue`);
      return 'done';
    }

    if (res.status === 401) {
      warn('401 Unauthorized — LIS_ANALYZER_API_KEY does not match the server; result queued');
      return 'retry';
    }

    warn(`POST failed ${res.status}: ${body ? JSON.stringify(body).slice(0, 160) : '(no body)'}`);
    // 5xx is the server having a bad moment and is worth retrying. A 4xx means
    // this payload will be refused every time, so keeping it would block the
    // queue behind it forever.
    return res.status >= 500 ? 'retry' : 'drop';
  }

  /**
   * Deliver now, queueing on failure.
   *
   * @returns {Promise<'done'|'queued'|'drop'|'dry'>}
   */
  async function send(payload) {
    if (dryRun) {
      log(`(dry run) would post ${payload.tests?.length ?? 0} result(s) for ${payload.specimenId}`);
      return 'dry';
    }

    // Anything already queued goes first, or a recovered link would deliver the
    // newest result ahead of the ones waiting on disk.
    if (pendingCount()) await drain();

    const outcome = await deliver(payload);
    if (outcome !== 'retry') return outcome;

    const file = enqueue(payload);
    const depth = pendingCount();
    warn(`   queued ${path.basename(file)} — ${depth} payload(s) waiting to be delivered`);
    if (depth >= QUEUE_WARN_AT) {
      warn(`   ⚠ the queue has reached ${depth} results. The LIS has been unreachable for a while;`);
      warn('     check the link to the server before the lab loses track of what is outstanding.');
    }
    return 'queued';
  }

  /**
   * Retry every queued payload, oldest first, stopping at the first one that
   * still will not go.
   *
   * @returns {Promise<{delivered: number, remaining: number}>}
   */
  async function drain() {
    if (draining) return { delivered: 0, remaining: pendingCount() };
    draining = true;
    let delivered = 0;

    try {
      const files = queuedFiles();
      if (files.length) log(`spool: ${files.length} payload(s) pending`);

      for (const name of files) {
        const full = path.join(spoolDir, name);
        let payload;
        try {
          payload = JSON.parse(fs.readFileSync(full, 'utf8'));
        } catch {
          // Never delete something we failed to read — it may be a result.
          warn(`spool: ${name} is unreadable, leaving it in place`);
          continue;
        }

        const outcome = await deliver(payload);
        if (outcome === 'retry') break;          // link still down; keep the order
        fs.unlinkSync(full);
        delivered += 1;
      }
    } finally {
      draining = false;
    }

    return { delivered, remaining: pendingCount() };
  }

  /** Retry queued results periodically, without waiting for the next sample. */
  function start() {
    if (dryRun || timer) return;
    timer = setInterval(() => {
      if (pendingCount()) drain().catch((e) => warn(`spool drain failed: ${e.message}`));
    }, retryMs);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { send, drain, start, stop, pendingCount, deliver, enqueue, analyzerId };
}
