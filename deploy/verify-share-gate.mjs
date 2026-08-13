/**
 * Exercise the generated download-gate functions without deploying.
 *
 * The point is the auth boundary: an unauthenticated visitor must get the login
 * form and must NOT get a download link, a forged cookie must be rejected, and a
 * correct password must produce a cookie that works. Shipping that unverified
 * would mean finding out from whoever misuses it.
 */
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

process.env.DOWNLOAD_PASSWORD = 'correct-horse';
process.env.DOWNLOAD_SECRET = 'a'.repeat(64);
process.env.BLOB_PATHNAME = 'installer.exe';

const index = require('./share-site/api/index.js');
const unlock = require('./share-site/api/unlock.js');
const download = require('./share-site/api/download.js');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/unlock') return unlock(req, res);
  if (url.pathname === '/api/download') return download(req, res);
  return index(req, res);
});

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

// 1. anonymous visitor
let res = await fetch(`${base}/`, { redirect: 'manual' });
let body = await res.text();
check('anonymous sees the login form', body.includes('Enter the access password'));
check('anonymous does NOT see the download page', !body.includes('Verify before running'));
check('page is not cacheable', (res.headers.get('cache-control') || '').includes('no-store'));

// 2. wrong password
res = await fetch(`${base}/api/unlock`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: 'wrong' }),
  redirect: 'manual',
});
check('wrong password sets no cookie', !res.headers.get('set-cookie'));
check('wrong password redirects to the error', (res.headers.get('location') || '').includes('error'));

// 3. correct password
res = await fetch(`${base}/api/unlock`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: 'correct-horse' }),
  redirect: 'manual',
});
const setCookie = res.headers.get('set-cookie') || '';
check('correct password issues a cookie', setCookie.includes('rk_dl='));
check('cookie is HttpOnly', /HttpOnly/i.test(setCookie));
check('cookie is Secure', /Secure/i.test(setCookie));
check('cookie is SameSite=Lax', /SameSite=Lax/i.test(setCookie));

const cookie = setCookie.split(';')[0];

// 4. authenticated visitor
res = await fetch(`${base}/`, { headers: { cookie }, redirect: 'manual' });
body = await res.text();
check('session sees the download page', body.includes('Verify before running'));
check('download page carries the checksum', /[0-9a-f]{64}/.test(body));

// 5. forged cookie
res = await fetch(`${base}/`, {
  headers: { cookie: `rk_dl=${Date.now() + 60000}.deadbeef` },
  redirect: 'manual',
});
check('forged signature rejected', (await res.text()).includes('Enter the access password'));

// 6. expired but correctly signed cookie
const crypto = await import('node:crypto');
const past = Date.now() - 1000;
const mac = crypto.createHmac('sha256', process.env.DOWNLOAD_SECRET).update(String(past)).digest('hex');
res = await fetch(`${base}/`, { headers: { cookie: `rk_dl=${past}.${mac}` }, redirect: 'manual' });
check('expired session rejected', (await res.text()).includes('Enter the access password'));

// 7. the download route itself
res = await fetch(`${base}/api/download`, { redirect: 'manual' });
check('download refuses anonymous', res.status === 303 && (res.headers.get('location') || '').includes('auth'));

res = await fetch(`${base}/api/download`, { headers: { cookie }, redirect: 'manual' });
const ok = res.status === 302 || res.status === 200 || res.status === 500;
check('download accepts a session', ok, `status ${res.status} (500 expected here: no blob store locally)`);

server.close();

for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n  ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
