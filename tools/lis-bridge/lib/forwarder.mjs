/**
 * Forwards normalised results to the LIS ingestion endpoint with the analyzer
 * API key, and provides store-and-forward: if the LIS is unreachable or returns
 * a server error, the payload is written to a local queue directory and retried
 * later — so a result is never lost when the network/LIS is briefly down.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createForwarder({ endpoint, apiKey, queueDir, log }) {
  fs.mkdirSync(queueDir, { recursive: true });
  const logf = log || (() => {});

  async function post(payload) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lis-api-key': apiKey || '' },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, data };
  }

  function enqueue(payload) {
    const file = path.join(queueDir, `${Date.now()}-${crypto.randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify(payload));
    logf(`queued for retry: ${path.basename(file)}`);
  }

  // Returns true if the payload is "done" (delivered or terminally rejected),
  // false if it should be retried later.
  function classify(status, data, specimenId) {
    if (status === 200) { logf(`✓ ${specimenId}: ${data.status || 'ok'} ${data.workflowStatus ? '(' + data.workflowStatus + ')' : ''}`); return true; }
    if (status === 409) { logf(`⚠ ${specimenId}: UNMATCHED — held in LIS for manual review`); return true; }
    if (status === 400) { logf(`✗ ${specimenId}: 400 ${data.error || 'bad request'} (not retried)`); return true; }
    if (status === 401) { logf(`✗ ${specimenId}: 401 Unauthorized — check LIS_ANALYZER_API_KEY (will retry)`); return false; }
    logf(`… ${specimenId}: HTTP ${status} — will retry`);
    return false;
  }

  async function forward(payload) {
    try {
      const { status, data } = await post(payload);
      if (!classify(status, data, payload.specimenId)) enqueue(payload);
    } catch (e) {
      logf(`… ${payload.specimenId}: network error (${e.message}) — queuing for retry`);
      enqueue(payload);
    }
  }

  async function flushQueue() {
    let files;
    try { files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json')); } catch { return; }
    for (const f of files) {
      const full = path.join(queueDir, f);
      let payload;
      try { payload = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { fs.unlinkSync(full); continue; }
      try {
        const { status, data } = await post(payload);
        if (classify(status, data, payload.specimenId)) fs.unlinkSync(full);
      } catch { /* keep the file, try again next round */ }
    }
  }

  return { forward, flushQueue };
}
