/**
 * Registry for Server-Sent Events (SSE) clients + event fan-out.
 *
 * Single-instance by default (in-memory). When REDIS_URL is configured the
 * fan-out is relayed over Redis pub/sub so every app instance behind a load
 * balancer delivers events to its own connected clients — the piece that makes
 * real-time horizontally scalable. Falls back gracefully to in-memory if Redis
 * is absent or unavailable; broadcasting never throws.
 */

import crypto from 'node:crypto';

let clients = [];
const INSTANCE_ID = crypto.randomUUID();
const CHANNEL = 'rk_lis_events';

let publisher = null;
let redisInitStarted = false;

function deliverLocal(payloadObj) {
  const message = `data: ${JSON.stringify(payloadObj)}\n\n`;
  const encoded = new TextEncoder().encode(message);
  clients.forEach((client) => {
    try { client.controller.enqueue(encoded); }
    catch { /* client connection closed */ }
  });
}

// Lazily connect to Redis (only if configured). Never blocks or throws.
async function initRedis() {
  if (redisInitStarted) return;
  redisInitStarted = true;
  const url = process.env.REDIS_URL;
  if (!url) return; // in-memory mode

  try {
    const { default: Redis } = await import('ioredis');
    publisher = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    publisher.on('error', (e) => console.error('Realtime Redis publisher error:', e.message));

    const subscriber = new Redis(url, { maxRetriesPerRequest: 2 });
    subscriber.on('error', (e) => console.error('Realtime Redis subscriber error:', e.message));
    await subscriber.subscribe(CHANNEL);
    subscriber.on('message', (_ch, msg) => {
      try {
        const obj = JSON.parse(msg);
        // Skip our own messages — we already delivered them locally.
        if (obj && obj.__instance !== INSTANCE_ID) deliverLocal(obj);
      } catch { /* ignore malformed */ }
    });
    console.log('Realtime: Redis pub/sub enabled (cross-instance fan-out).');
  } catch (e) {
    console.error('Realtime: Redis unavailable, using in-memory delivery:', e.message);
    publisher = null;
  }
}
initRedis();

export function addRealtimeClient(client) {
  clients.push(client);
}

export function removeRealtimeClient(client) {
  clients = clients.filter((c) => c !== client);
}

/**
 * Broadcast an event to all connected clients across every instance.
 * Delivers to this instance's clients immediately, then relays via Redis
 * (when configured) so other instances deliver to theirs.
 */
export function broadcastRealtimeEvent(type, data) {
  const payloadObj = { type, data, timestamp: new Date().toISOString(), __instance: INSTANCE_ID };
  deliverLocal(payloadObj);
  if (publisher) {
    try { publisher.publish(CHANNEL, JSON.stringify(payloadObj)); }
    catch (e) { console.error('Realtime publish failed:', e.message); }
  }
}
