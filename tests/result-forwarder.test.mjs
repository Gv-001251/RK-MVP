import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createForwarder } from '../tools/lib/result-forwarder.mjs';

/**
 * Store-and-forward delivery.
 *
 * These tests are about the unhappy paths, because those are the ones that lose
 * patient results and the ones nobody exercises by hand. A dropped WAN link is
 * simulated by a fetch that throws, which is exactly what node's fetch does when
 * the host is unreachable.
 */

let spoolDir;
let forwarder;

/** A fetch stand-in driven by a scripted list of outcomes. */
function scriptedFetch(script) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const next = script.shift();
    if (!next) throw new Error('script exhausted');
    if (next.throws) throw new Error(next.throws);
    return {
      status: next.status,
      json: async () => next.body ?? {},
    };
  };
  impl.calls = calls;
  return impl;
}

const payload = (specimenId, value = '28.1945') => ({
  analyzerId: 'mispaplus',
  specimenId,
  messageId: `mispaplus:${specimenId}:x`,
  tests: [{ code: 'Glucose (Random)', value, unit: 'mg/dL', flag: '' }],
  raw: `$07/08/2026|29|mbglu|${value}|mg/dL|1#`,
});

function build(fetchImpl, extra = {}) {
  return createForwarder({
    analyzerId: 'mispaplus',
    baseUrl: 'http://clinic-lis:3000',
    apiKey: 'test-key',
    spoolDir,
    fetchImpl,
    ...extra,
  });
}

beforeEach(() => {
  spoolDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-spool-'));
});

afterEach(() => {
  forwarder?.stop();
  fs.rmSync(spoolDir, { recursive: true, force: true });
});

describe('delivery', () => {
  it('reports success and queues nothing', async () => {
    forwarder = build(scriptedFetch([{ status: 200, body: { status: 'applied' } }]));
    expect(await forwarder.send(payload('29'))).toBe('done');
    expect(forwarder.pendingCount()).toBe(0);
  });

  it('treats an unmatched result as delivered — it is held in the LIS, not lost', async () => {
    forwarder = build(scriptedFetch([{ status: 409, body: { status: 'unmatched' } }]));
    expect(await forwarder.send(payload('29'))).toBe('done');
    expect(forwarder.pendingCount()).toBe(0);
  });

  it('treats a duplicate as delivered', async () => {
    forwarder = build(scriptedFetch([{ status: 200, body: { status: 'duplicate' } }]));
    expect(await forwarder.send(payload('29'))).toBe('done');
  });
});

describe('a dropped link', () => {
  it('queues the result instead of losing it', async () => {
    forwarder = build(scriptedFetch([{ throws: 'fetch failed' }]));
    expect(await forwarder.send(payload('29'))).toBe('queued');
    expect(forwarder.pendingCount()).toBe(1);
  });

  it('keeps the full payload on disk, not a summary of it', async () => {
    forwarder = build(scriptedFetch([{ throws: 'fetch failed' }]));
    await forwarder.send(payload('29'));

    const [file] = fs.readdirSync(spoolDir);
    const saved = JSON.parse(fs.readFileSync(path.join(spoolDir, file), 'utf8'));
    expect(saved).toEqual(payload('29'));
  });

  it('delivers the queue when the link returns', async () => {
    const impl = scriptedFetch([
      { throws: 'fetch failed' },
      { status: 200, body: { status: 'applied' } },
    ]);
    forwarder = build(impl);

    await forwarder.send(payload('29'));
    expect(forwarder.pendingCount()).toBe(1);

    const { delivered, remaining } = await forwarder.drain();
    expect(delivered).toBe(1);
    expect(remaining).toBe(0);
  });

  it('queues a 401 rather than discarding it, since the key can be corrected', async () => {
    forwarder = build(scriptedFetch([{ status: 401, body: { error: 'Unauthorized' } }]));
    expect(await forwarder.send(payload('29'))).toBe('queued');
    expect(forwarder.pendingCount()).toBe(1);
  });

  it('queues a 500, because the server may simply be restarting', async () => {
    forwarder = build(scriptedFetch([{ status: 500, body: { error: 'boom' } }]));
    expect(await forwarder.send(payload('29'))).toBe('queued');
  });

  it('drops a 400 instead of blocking the queue behind it forever', async () => {
    forwarder = build(scriptedFetch([{ status: 400, body: { error: 'tests[] required' } }]));
    expect(await forwarder.send(payload('29'))).toBe('drop');
    expect(forwarder.pendingCount()).toBe(0);
  });
});

describe('ordering', () => {
  it('delivers queued results oldest first', async () => {
    const down = scriptedFetch([{ throws: 'down' }, { throws: 'down' }, { throws: 'down' }]);
    forwarder = build(down);
    await forwarder.send(payload('29', '1'));
    await forwarder.send(payload('30', '2'));
    expect(forwarder.pendingCount()).toBe(2);

    const up = scriptedFetch([
      { status: 200, body: {} },
      { status: 200, body: {} },
    ]);
    forwarder = build(up);
    await forwarder.drain();

    expect(up.calls.map((c) => c.body.specimenId)).toEqual(['29', '30']);
  });

  it('stops at the first result that still will not go, keeping the order intact', async () => {
    const down = scriptedFetch([{ throws: 'down' }, { throws: 'down' }, { throws: 'down' }]);
    forwarder = build(down);
    await forwarder.send(payload('29'));
    await forwarder.send(payload('30'));

    // Link comes back for one result, then drops again mid-drain.
    const flaky = scriptedFetch([{ status: 200, body: {} }, { throws: 'down again' }]);
    forwarder = build(flaky);
    const { delivered, remaining } = await forwarder.drain();

    expect(delivered).toBe(1);
    expect(remaining).toBe(1);
  });

  it('sends anything already queued before a brand-new result', async () => {
    const down = scriptedFetch([{ throws: 'down' }, { throws: 'down' }]);
    forwarder = build(down);
    await forwarder.send(payload('29', 'old'));

    const up = scriptedFetch([{ status: 200, body: {} }, { status: 200, body: {} }]);
    forwarder = build(up);
    await forwarder.send(payload('30', 'new'));

    expect(up.calls.map((c) => c.body.specimenId)).toEqual(['29', '30']);
  });

  it('gives two results in the same millisecond distinct queue files', async () => {
    const down = scriptedFetch([{ throws: 'd' }, { throws: 'd' }, { throws: 'd' }, { throws: 'd' }]);
    forwarder = build(down);
    await Promise.all([forwarder.send(payload('29')), forwarder.send(payload('29'))]);
    expect(fs.readdirSync(spoolDir)).toHaveLength(2);
  });
});

describe('resilience', () => {
  it('leaves an unreadable spool file alone rather than deleting a possible result', async () => {
    fs.writeFileSync(path.join(spoolDir, `${Date.now()}-broken.json`), '{ not json');
    forwarder = build(scriptedFetch([]));
    const { delivered, remaining } = await forwarder.drain();
    expect(delivered).toBe(0);
    expect(remaining).toBe(1);
  });

  it('posts nothing at all in dry-run mode', async () => {
    const impl = scriptedFetch([]);
    forwarder = build(impl, { dryRun: true });
    expect(await forwarder.send(payload('29'))).toBe('dry');
    expect(impl.calls).toHaveLength(0);
  });

  it('sends the api key on every attempt', async () => {
    const seen = [];
    const impl = async (url, init) => {
      seen.push(init.headers['x-lis-api-key']);
      return { status: 200, json: async () => ({}) };
    };
    forwarder = build(impl);
    await forwarder.send(payload('29'));
    expect(seen).toEqual(['test-key']);
  });
});
