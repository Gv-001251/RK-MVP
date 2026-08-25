/**
 * ============================================================================
 * Process supervisor for the RK Clinic LIS desktop app
 * ============================================================================
 * Owns the long-running children: the Next.js server that serves the web UI to
 * the rest of the hospital, and one analyzer bridge per instrument.
 *
 * Why children rather than in-process
 * ----------------------------------
 * One instrument's driver crashing must not take the others, or the web server,
 * down with it, and a bridge holding a serial port should be restartable on its
 * own. Separate processes give that for free, and they keep the bridges the same
 * programs that were proven against real instruments.
 *
 * What runs them
 * --------------
 * The Electron binary itself, with ELECTRON_RUN_AS_NODE=1 — NOT a system Node.
 * This is a deployment requirement, not a preference. An app launched from
 * Finder inherits a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin), so
 * spawn('node') fails with ENOENT on any machine that has not installed Node
 * into one of those directories — which is every clean Mac. The failure is also
 * confusing: launched from a terminal it works, because the developer's shell
 * has Homebrew on PATH.
 *
 * This is only possible because `serialport` is built on Node-API, whose ABI is
 * stable across Node and Electron, so the same prebuilt binding loads under
 * both. Verified by listing ports under ELECTRON_RUN_AS_NODE before relying on
 * it. A native module that used raw V8 headers instead would have to be rebuilt
 * for Electron.
 *
 * Restart policy
 * --------------
 * A crashed bridge is restarted, because an unattended lab needs it back. But a
 * bridge that cannot possibly start — a serial adapter that is unplugged, say,
 * which is exactly the state the Maglumi is in — must not be respawned forever.
 * So failures are classified: a child that dies within QUICK_FAIL_MS of starting
 * counts as a failure to start, backs off exponentially, and after
 * MAX_QUICK_FAILURES gives up and reports `failed` so the tray can show it and a
 * human can fix the cause. A child that ran longer than that is treated as a
 * genuine crash: the counter resets and it comes straight back.
 *
 * Nothing here decides that a service is healthy just because a process exists.
 * A service may declare a `healthUrl`, and until that answers it stays
 * `starting` — `next start` prints its banner well before it can serve a
 * request, and a green light that means "the process is alive" would be a lie
 * told to the one person relying on it.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn, execFileSync } = require('node:child_process');

/** Died this soon after starting? Then it never really started. */
const QUICK_FAIL_MS = 10_000;

/** Consecutive failures to start before we stop trying and say so. */
const MAX_QUICK_FAILURES = 5;

/** Backoff schedule for repeated start failures. */
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/** How long a child gets to exit on its own before it is killed outright. */
const SIGTERM_GRACE_MS = 6_000;

/** Log lines kept in memory per service for the UI. The file keeps everything. */
const LOG_TAIL_LINES = 300;

/** Readiness probing. */
const HEALTH_INTERVAL_MS = 1_000;
const HEALTH_TIMEOUT_MS = 90_000;

class Supervisor extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.appRoot   directory the children run in
   * @param {string} opts.logsDir   where per-service log files are written
   * @param {string} opts.nodePath  binary used to run children
   * @param {boolean} [opts.runAsNode] set ELECTRON_RUN_AS_NODE on children,
   *   required when nodePath is the Electron binary itself
   * @param {object} [opts.env]     extra environment for every child
   */
  constructor({ appRoot, logsDir, nodePath, runAsNode = false, env = {}, stateFile = null }) {
    super();
    this.appRoot = appRoot;
    this.logsDir = logsDir;
    this.nodePath = nodePath;
    this.runAsNode = runAsNode;
    this.extraEnv = env;
    this.stateFile = stateFile;
    /** @type {Map<string, object>} */
    this.services = new Map();
    fs.mkdirSync(logsDir, { recursive: true });
  }

  /**
   * Register a service without starting it.
   *
   * @param {object} def
   * @param {string} def.id
   * @param {string} def.label
   * @param {string} def.script          absolute path to the .mjs/.js to run
   * @param {string[]} [def.args]
   * @param {object} [def.env]
   * @param {string} [def.healthUrl]     probed before reporting `running`
   * @param {boolean} [def.enabled]      start with the app
   * @param {string} [def.note]          shown in the UI, e.g. why it's disabled
   */
  register(def) {
    this.services.set(def.id, {
      def,
      status: 'stopped',      // stopped | starting | running | failed
      degraded: null,         // running, but its health check is unhappy
      child: null,
      pid: null,
      startedAt: null,
      quickFailures: 0,
      restarts: 0,
      lastExit: null,
      lastError: null,
      stopping: false,
      retryTimer: null,
      healthTimer: null,
      logTail: [],
      logStream: null,
    });
  }

  list() {
    return [...this.services.values()].map((s) => ({
      id: s.def.id,
      label: s.def.label,
      note: s.def.note || null,
      status: s.status,
      degraded: s.degraded || null,
      pid: s.pid,
      restarts: s.restarts,
      lastExit: s.lastExit,
      lastError: s.lastError,
      uptimeMs: s.startedAt && s.status === 'running' ? Date.now() - s.startedAt : null,
      logTail: s.logTail.slice(-40),
      logFile: this.logFileFor(s.def.id),
    }));
  }

  get(id) {
    return this.list().find((s) => s.id === id) || null;
  }

  logFileFor(id) {
    return path.join(this.logsDir, `${id}.log`);
  }

  /** Push a line to the in-memory tail and the log file, and tell the UI. */
  _record(s, line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    s.logTail.push(stamped);
    if (s.logTail.length > LOG_TAIL_LINES) s.logTail.splice(0, s.logTail.length - LOG_TAIL_LINES);
    try {
      if (!s.logStream) {
        s.logStream = fs.createWriteStream(this.logFileFor(s.def.id), { flags: 'a' });
      }
      s.logStream.write(`${stamped}\n`);
    } catch {
      // A logging failure must never stop a bridge from running.
    }
    this.emit('log', s.def.id, stamped);
  }

  _setStatus(s, status) {
    if (s.status === status) return;
    s.status = status;
    this.emit('change', this.get(s.def.id));
    this.publishState();
  }

  /**
   * Write the current state where another process can read it.
   *
   * This is what lets the headless supervisor run the lab while the tray app is
   * merely a window onto it. The alternative — having the GUI ask the supervisor
   * over a socket — means inventing a protocol, a handshake and a reconnect
   * story for information that is a few dozen bytes and changes every few
   * seconds. A file that one process writes and the other watches has none of
   * those failure modes, and it survives either side restarting.
   *
   * Written to a temporary file and renamed, so a reader never sees a half-written
   * document.
   */
  publishState() {
    if (!this.stateFile) return;
    const payload = {
      updatedAt: new Date().toISOString(),
      pid: process.pid,
      aggregate: this.aggregate(),
      services: this.list().map(({ logTail, ...rest }) => rest),
    };
    try {
      const tmp = `${this.stateFile}.tmp`;
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
      fs.renameSync(tmp, this.stateFile);
    } catch {
      // Losing a status file must never disturb a running bridge.
    }
  }

  /**
   * Kill children left behind by a previous supervisor, and report what was
   * killed. Call this before starting anything.
   *
   * Stopping the Windows scheduled task ends the supervisor but does not
   * reliably take its children with it — Windows has no process group to signal,
   * and the IPC shutdown path only runs when the parent gets the chance to ask.
   * An abandoned bridge keeps listening on its analyzer port, so the replacement
   * bridge fails with EADDRINUSE, retries, and is given up on. Observed on the
   * clinic machine: `listen EADDRINUSE :::8080` five times, then
   * `gave up after 5 failed starts`, leaving the LIS running with no route for
   * results while the dashboard looked healthy.
   *
   * The old process is also the wrong code after an upgrade, so adopting it
   * instead of killing it would be worse than the crash.
   */
  reclaimOrphans() {
    if (!this.stateFile) return [];

    let previous;
    try {
      previous = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return [];
    }
    // Our own state file from this run: nothing to reclaim.
    if (!previous || previous.pid === process.pid) return [];

    const reclaimed = [];
    for (const service of previous.services || []) {
      const pid = service?.pid;
      if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) continue;
      if (!this._looksLikeOurChild(pid)) continue;
      try {
        process.kill(pid, 'SIGKILL');
        reclaimed.push({ id: service.id ?? 'unknown', pid });
      } catch {
        // Already gone, or not ours to signal. Either way, leave it.
      }
    }
    return reclaimed;
  }

  /**
   * Would killing this pid kill one of our children, or something innocent?
   *
   * A recorded pid on its own is not enough to act on. Pids are recycled, and the
   * number written yesterday may belong to anything at all today — on a machine
   * holding patient records, killing a stranger by arithmetic is not acceptable.
   * So confirm the process is still running the binary we spawn children with,
   * and treat "cannot tell" as "do not touch".
   */
  _looksLikeOurChild(pid) {
    const expected = path.basename(this.nodePath).toLowerCase();
    try {
      // stderr is discarded: asking about a pid that is out of range or already
      // gone makes ps and tasklist complain, and that complaint would land in
      // the service log looking like a fault when it is a normal answer of "no".
      const io = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true };
      const out = process.platform === 'win32'
        ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], io)
        : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], io);
      return out.toLowerCase().includes(expected);
    } catch {
      return false;
    }
  }

  start(id) {
    const s = this.services.get(id);
    if (!s) throw new Error(`unknown service "${id}"`);
    if (s.child) return;

    clearTimeout(s.retryTimer);
    s.retryTimer = null;
    s.stopping = false;
    s.lastError = null;
    this._setStatus(s, 'starting');

    const { def } = s;
    const args = [def.script, ...(def.args || [])];
    this._record(s, `starting: ${this.nodePath} ${args.join(' ')}`);

    let child;
    try {
      child = spawn(this.nodePath, args, {
        cwd: this.appRoot,
        // The fourth stdio slot is an IPC pipe, and it is how a child is asked to
        // shut down cleanly. Signals cannot do that job on Windows: kill('SIGTERM')
        // there becomes TerminateProcess, so a bridge would be stopped mid-batch
        // with results parsed but not yet posted. See tools/lib/shutdown.mjs.
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
        env: {
          ...process.env,
          ...this.extraEnv,
          ...(def.env || {}),
          // Turns the Electron binary into a plain Node interpreter. Without it,
          // Electron would try to boot a second copy of the app instead of
          // running the script.
          ...(this.runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      s.lastError = err.message;
      this._record(s, `could not spawn: ${err.message}`);
      this._setStatus(s, 'failed');
      return;
    }

    s.child = child;
    s.pid = child.pid;
    s.startedAt = Date.now();

    const onOutput = (buf) => {
      for (const line of buf.toString('utf8').split(/\r?\n/)) {
        if (line.trim()) this._record(s, line);
      }
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);

    child.on('error', (err) => {
      s.lastError = err.message;
      this._record(s, `process error: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
      const ranFor = Date.now() - s.startedAt;
      s.child = null;
      s.pid = null;
      s.lastExit = { code, signal, at: Date.now(), ranForMs: ranFor };
      clearInterval(s.healthTimer);
      s.healthTimer = null;

      this._record(s, `exited (${signal ? `signal ${signal}` : `code ${code}`}) after ${Math.round(ranFor / 1000)}s`);

      // Only an exit WE asked for is allowed to stay stopped.
      //
      // Exit code is deliberately not consulted here. Every bridge handles
      // SIGTERM by flushing and exiting 0, so `pkill`, a logout, or anything else
      // that signals the process produces a clean exit code that looks identical
      // to a deliberate shutdown. Treating code 0 as "it meant to stop" left a
      // killed bridge down, with the LIS still listening to nothing and results
      // arriving nowhere. If we did not ask for it, it comes back.
      if (s.stopping) { this._setStatus(s, 'stopped'); return; }

      if (ranFor < QUICK_FAIL_MS) {
        s.quickFailures += 1;
        if (s.quickFailures >= MAX_QUICK_FAILURES) {
          this._record(s, `gave up after ${s.quickFailures} failed starts — fix the cause, then start it again`);
          this._setStatus(s, 'failed');
          return;
        }
      } else {
        s.quickFailures = 0;       // it had been running; this was a crash
      }

      const delay = BACKOFF_MS[Math.min(s.quickFailures, BACKOFF_MS.length - 1)];
      s.restarts += 1;
      this._record(s, `restarting in ${delay / 1000}s`);
      this._setStatus(s, 'starting');
      s.retryTimer = setTimeout(() => this.start(id), delay);
    });

    if (def.healthUrl) this._probe(s);
    else {
      // Nothing to probe: give it long enough to fail immediately, then call it
      // running. The exit handler above corrects this if it dies.
      setTimeout(() => { if (s.child && !s.stopping) this._setStatus(s, 'running'); }, 1_500);
    }
  }

  /** Poll healthUrl until it answers, or until we have waited long enough. */
  _probe(s) {
    const startedProbing = Date.now();
    clearInterval(s.healthTimer);

    s.healthTimer = setInterval(async () => {
      if (!s.child || s.stopping) { clearInterval(s.healthTimer); return; }

      try {
        // ANY answer means the HTTP server is accepting requests, which is the
        // only question this probe is entitled to ask.
        //
        // It deliberately does not require 2xx. /api/health also checks the
        // database and answers 503 when that is unreachable — and gating on 2xx
        // meant a database problem left every analyzer bridge unstarted, so
        // results that could have been spooled to disk and forwarded later were
        // instead never received at all. The instrument does not wait for us.
        // A degraded server is still a server; the bridges start, queue, and
        // deliver when it recovers.
        const res = await fetch(s.def.healthUrl, { signal: AbortSignal.timeout(2_000) });
        clearInterval(s.healthTimer);
        s.healthTimer = null;
        s.quickFailures = 0;
        s.degraded = res.ok ? null : `health check answered ${res.status}`;
        this._record(s, res.ok
          ? `ready — ${s.def.healthUrl} answered ${res.status}`
          : `ready but DEGRADED — ${s.def.healthUrl} answered ${res.status} (check the database)`);
        this._setStatus(s, 'running');
      } catch {
        if (Date.now() - startedProbing > HEALTH_TIMEOUT_MS) {
          clearInterval(s.healthTimer);
          s.healthTimer = null;
          s.lastError = `did not answer ${s.def.healthUrl} within ${HEALTH_TIMEOUT_MS / 1000}s`;
          this._record(s, s.lastError);
          this._setStatus(s, 'failed');
        }
      }
    }, HEALTH_INTERVAL_MS);
  }

  /**
   * Stop a service and do not restart it.
   *
   * SIGTERM first, because every bridge uses it to flush in-flight results and
   * report itself offline to the LIS. Only a child that ignores that gets killed.
   */
  stop(id) {
    const s = this.services.get(id);
    if (!s) return Promise.resolve();

    clearTimeout(s.retryTimer);
    s.retryTimer = null;
    clearInterval(s.healthTimer);
    s.healthTimer = null;
    s.stopping = true;

    if (!s.child) { this._setStatus(s, 'stopped'); return Promise.resolve(); }

    return new Promise((resolve) => {
      const child = s.child;
      const timer = setTimeout(() => {
        this._record(s, 'did not exit in time — killing it');
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }, SIGTERM_GRACE_MS);

      child.once('exit', () => { clearTimeout(timer); resolve(); });

      // Ask over IPC first. This is the only request that works on every
      // platform: on Windows a signal would terminate the process outright,
      // discarding results it has parsed but not yet posted.
      if (child.connected) {
        this._record(s, 'stopping (shutdown request)');
        try {
          child.send({ type: 'shutdown' });
          return;
        } catch {
          // Channel already gone; fall through to the signal.
        }
      }

      this._record(s, 'stopping (SIGTERM)');
      try { child.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
    });
  }

  async restart(id) {
    await this.stop(id);
    const s = this.services.get(id);
    if (s) { s.quickFailures = 0; s.restarts = 0; }
    this.start(id);
  }

  /**
   * Start everything marked enabled, respecting declared order.
   *
   * A service may declare `after: 'server'`, and this matters more than it
   * looks. Each bridge reports itself to the LIS once when it comes up, and some
   * of them — the Hemat 60 among them — only report again when an instrument
   * connects. Start a bridge before the web server can answer and that one
   * report is lost, leaving a working analyzer showing as offline in Analyzer
   * Management until the next time a sample runs. Results are never lost to this
   * (the spool covers them), but the dashboard lies, which costs someone a
   * pointless trip to the bench.
   *
   * The wait is bounded. If the server never becomes ready, the bridges start
   * anyway: a bridge that is up and queueing to disk is strictly better than an
   * instrument transmitting into a machine where nothing is listening.
   */
  startEnabled({ dependencyTimeoutMs = 60_000 } = {}) {
    const enabled = [...this.services.values()].filter((s) => s.def.enabled);

    for (const s of enabled.filter((x) => !x.def.after)) this.start(s.def.id);

    for (const s of enabled.filter((x) => x.def.after)) {
      const depId = s.def.after;
      const dep = this.services.get(depId);

      if (!dep) { this.start(s.def.id); continue; }
      if (dep.status === 'running') { this.start(s.def.id); continue; }

      // Nothing to wait for: the dependency is switched off. This is the normal
      // shape for a lab machine that runs bridges only, with the LIS at another
      // site — waiting for a local server that will never start would delay every
      // analyzer link by the full dependency timeout for no reason.
      if (!dep.def.enabled) {
        this._record(s, `"${depId}" is disabled here, so there is nothing to wait for`);
        this.start(s.def.id);
        continue;
      }

      let launched = false;
      const launch = (reason) => {
        if (launched) return;
        launched = true;
        this.off('change', onChange);
        clearTimeout(timer);
        this._record(s, `waited for "${depId}": ${reason}`);
        this.start(s.def.id);
      };

      const onChange = (changed) => {
        if (changed.id !== depId) return;
        if (changed.status === 'running') launch('it is ready');
        else if (changed.status === 'failed') launch('it failed, starting anyway so nothing is missed');
      };

      const timer = setTimeout(
        () => launch(`it did not become ready within ${dependencyTimeoutMs / 1000}s, starting anyway`),
        dependencyTimeoutMs
      );

      this.on('change', onChange);
    }
  }

  /** Stop everything, for app shutdown. */
  async stopAll() {
    await Promise.all([...this.services.keys()].map((id) => this.stop(id)));
    for (const s of this.services.values()) {
      try { s.logStream?.end(); } catch { /* nothing to do */ }
      s.logStream = null;
    }
  }

  /** One word for the whole system, for the menu-bar title. */
  aggregate() {
    const all = [...this.services.values()];
    const considered = all.filter((s) => s.def.enabled || s.status !== 'stopped');
    if (!considered.length) return 'stopped';
    if (considered.some((s) => s.status === 'failed')) return 'failed';
    if (considered.every((s) => s.status === 'running')) return 'running';
    if (considered.some((s) => s.status === 'starting')) return 'starting';
    return 'partial';
  }
}

module.exports = { Supervisor, QUICK_FAIL_MS, MAX_QUICK_FAILURES };
