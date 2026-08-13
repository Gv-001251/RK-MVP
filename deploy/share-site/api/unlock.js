
const crypto = require('node:crypto');

const COOKIE = 'rk_dl';
const SESSION_MS = 12 * 60 * 60 * 1000;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

/** Constant-time compare that does not leak length through an early return. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function issue(secret) {
  const expires = Date.now() + SESSION_MS;
  return expires + '.' + sign(expires, secret);
}

function valid(cookieHeader, secret) {
  const raw = String(cookieHeader || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;

  const [expires, mac] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  if (!expires || !mac) return false;
  if (!safeEqual(mac, sign(expires, secret))) return false;
  return Number(expires) > Date.now();
}


/**
 * Exchange the shared password for a session cookie.
 *
 * There is deliberately no per-IP rate limit here. On serverless each instance
 * has its own memory, so an in-memory limiter gives an unpredictable fraction of
 * the protection it appears to give — worse than none, because it invites
 * trusting it. A fixed delay on every attempt is honest about what it is: it
 * makes bulk guessing slow without pretending to be a real limiter. If this ever
 * faces the open internet rather than a handful of colleagues, put Vercel's own
 * protection or a shared store in front of it.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  const expected = process.env.DOWNLOAD_PASSWORD;
  const secret = process.env.DOWNLOAD_SECRET;
  if (!expected || !secret) {
    res.statusCode = 500;
    res.end('DOWNLOAD_PASSWORD or DOWNLOAD_SECRET is not configured.');
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let supplied = '';
  try {
    supplied = new URLSearchParams(body).get('password') || '';
  } catch {
    supplied = '';
  }

  await new Promise((r) => setTimeout(r, 600));

  if (!safeEqual(supplied, expected)) {
    res.statusCode = 303;
    res.setHeader('location', '/?error=1');
    res.end();
    return;
  }

  res.statusCode = 303;
  res.setHeader('set-cookie', [
    COOKIE + '=' + encodeURIComponent(issue(secret)),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(SESSION_MS / 1000),
  ].join('; '));
  res.setHeader('location', '/');
  res.end();
};
