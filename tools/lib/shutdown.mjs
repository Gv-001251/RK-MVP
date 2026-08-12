/**
 * ============================================================================
 * Orderly shutdown, on Windows as well as POSIX
 * ============================================================================
 * Every bridge has work to do before it exits: flush results it has parsed but
 * not yet posted, and tell the LIS it is going offline so the analyzer tile does
 * not sit there claiming a live link.
 *
 * On macOS and Linux that hangs off SIGTERM. On Windows there are no POSIX
 * signals — Node emulates a few names, but `child.kill('SIGTERM')` from a parent
 * process ends up calling TerminateProcess, which stops the process dead with no
 * chance to run anything. Handlers registered for SIGTERM never fire.
 *
 * That difference is not cosmetic. The Mispa bridge gathers a sample's results
 * for a few seconds before posting them, so an abrupt kill during that window
 * discards results the instrument has already reported and will not send again.
 *
 * So a second, explicit channel: the supervisor spawns each bridge with an IPC
 * pipe and sends { type: 'shutdown' }. That works identically on every platform.
 * Signals stay registered too, for the case where a bridge is run by hand from a
 * terminal and stopped with Ctrl-C.
 *
 * @param {() => void} handler runs at most once, however the request arrives
 */
export function onShutdown(handler) {
  let ran = false;

  const once = (reason) => {
    if (ran) return;
    ran = true;
    handler(reason);
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => once(signal));
  }

  process.on('message', (message) => {
    if (message && message.type === 'shutdown') once('ipc');
  });
}
