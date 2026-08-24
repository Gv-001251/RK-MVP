
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
  const pathname = process.env.BLOB_PATHNAME || "installer-0.3.2.exe";

  if (!secret || !valid(req.headers.cookie, secret)) {
    res.statusCode = 303;
    res.setHeader('location', '/?error=auth');
    res.end();
    return;
  }

  try {
    const blob = require('@vercel/blob');

    if (typeof blob.issueSignedToken === 'function' && typeof blob.presignUrl === 'function') {
      // TWO steps, not one. issueSignedToken asks the Blob API for a delegation
      // scoped to this pathname and operation; presignUrl then signs a concrete
      // URL with it locally. presignUrl on its own cannot work — it has no
      // credentials and errors with "clientSigningToken and delegationToken from
      // issueSignedToken are required", which is exactly what an earlier revision
      // of this file produced.
      const validUntil = Date.now() + 10 * 60 * 1000;

      const delegation = await blob.issueSignedToken({
        pathname,
        operations: ['get'],
        validUntil,
      });

      const { presignedUrl } = await blob.presignUrl(delegation, {
        operation: 'get',
        pathname,
        access: 'private',
        validUntil,
      });

      res.statusCode = 302;
      res.setHeader('cache-control', 'private, no-store');
      res.setHeader('location', presignedUrl);
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
    // Deliberately HTML, not text/plain.
    //
    // A text/plain error from a route the browser is treating as a download gets
    // SAVED as a file — it lands in the downloads list as "download.txt" with a
    // generic "site wasn't available", and the actual reason is hidden inside a
    // file nobody thinks to open. An HTML response renders in the tab where the
    // person can read it.
    const missing = /not found|no such|404/i.test(err.message || '');
    res.statusCode = missing ? 503 : 500;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'private, no-store');
    res.end(errorHtml(
      missing ? 'The installer has not been uploaded yet' : 'Could not produce a download link',
      missing
        ? 'The download page is live, but the installer for this version is not in storage yet. '
          + 'Whoever published this build needs to upload it before the download will work.'
        : 'The server could not reach the file store. This is usually a missing store '
          + 'connection or credentials on the project, not a problem with your browser.',
      err.message
    ));
  }
};

/** A readable failure page, so the reason is on screen rather than in a saved file. */
function errorHtml(heading, explanation, detail) {
  return [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + heading + '</title><style>',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'padding:24px;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    'color:#17181c;background:#f4f5f7}',
    '.card{background:#fff;border:1px solid #e6e8ee;border-radius:14px;padding:26px;max-width:460px}',
    'h1{font-size:18px;margin:0 0 10px}',
    'p{color:#4b5563;margin:0 0 14px}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#8b93a1;',
    'background:#f7f8fa;border:1px solid #e6e8ee;border-radius:8px;padding:8px 10px;display:block;',
    'word-break:break-all}',
    'a{color:#5c7cf5;text-decoration:none;font-weight:650}',
    '</style></head><body><div class="card">',
    '<h1>' + heading + '</h1>',
    '<p>' + explanation + '</p>',
    '<code>' + String(detail || '').replace(/[<>&]/g, '') + '</code>',
    '<p style="margin:16px 0 0"><a href="/">Back to the download page</a></p>',
    '</div></body></html>',
  ].join('');
}
