/**
 * Best-effort status reporter: tells the LIS each machine's live state
 * (offline | online | active). Status is ephemeral, so failures are ignored
 * (unlike results, which use store-and-forward).
 */

export function createReporter({ endpoint, apiKey, log, onCommand }) {
  const logf = log || (() => {});

  async function report(analyzerId, status, meta = {}) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lis-api-key': apiKey || '' },
        body: JSON.stringify({ analyzerId, status, ...meta }),
      });

      // The LIS may return a queued control action on the heartbeat response
      // (reconnect | restart | disable | enable | maintenance_on | maintenance_off).
      // This reuses the existing heartbeat — no separate command-poll channel.
      if (onCommand) {
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON body */ }
        if (data && data.command) {
          try { onCommand(analyzerId, data.command); }
          catch (e) { logf(`[${analyzerId}] command handler error: ${e.message}`); }
        }
      }
    } catch {
      // status is a heartbeat; a missed one is fine, the next will correct it
      logf(`[${analyzerId}] status report failed (will retry on next heartbeat)`);
    }
  }

  return { report };
}
