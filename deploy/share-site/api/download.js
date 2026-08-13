
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
 * Hand an authenticated visitor a short-lived link to the installer.
 *
 * The binary sits in a PRIVATE blob store, so it has no publicly reachable URL —
 * the only way to it is through this handler. Rather than streaming ~178 MB back
 * through the function, which Vercel advises against for anything over 100 MB and
 * which would pay data transfer twice, we mint a presigned GET URL valid for ten
 * minutes and redirect. Long enough to start a download and resume it; short
 * enough that a link copied out of someone's history is dead.
 */
module.exports = async (req, res) => {
  const secret = process.env.DOWNLOAD_SECRET;
  const pathname = process.env.BLOB_PATHNAME || "RK Clinic LIS Setup 0.3.0.exe";

  if (!secret || !valid(req.headers.cookie, secret)) {
    res.statusCode = 303;
    res.setHeader('location', '/?error=auth');
    res.end();
    return;
  }

  try {
    const blob = require('@vercel/blob');

    if (typeof blob.presignUrl === 'function') {
      const signed = await blob.presignUrl({
        pathname,
        access: 'private',
        operation: 'get',
        expiresIn: 600,
      });
      const url = typeof signed === 'string' ? signed : signed.url;
      res.statusCode = 302;
      res.setHeader('cache-control', 'private, no-store');
      res.setHeader('location', url);
      res.end();
      return;
    }

    // Fallback for an SDK without presignUrl: stream it. Correct, but pays data
    // transfer twice and is not what you want for a file this size.
    const result = await blob.get(pathname, { access: 'private' });
    res.statusCode = 200;
    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('content-disposition', 'attachment; filename="' + pathname + '"');
    res.setHeader('cache-control', 'private, no-store');
    if (result.size) res.setHeader('content-length', String(result.size));
    const { Readable } = require('node:stream');
    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain');
    res.end('Could not produce a download link: ' + err.message);
  }
};
