/**
 * ============================================================================
 * Edge authentication gate
 * ============================================================================
 * This file is `proxy.js`, not `middleware.js`, and the name is load-bearing.
 *
 * Next.js 16 deprecated the `middleware` convention and renamed it to `proxy`,
 * and in doing so changed the runtime: proxy runs on Node.js, middleware ran on
 * Edge. That difference is why this file was moved.
 *
 * As middleware.js, this code was compiled into .next/server/edge/chunks, and
 * the Edge sandbox is not given the server process's environment. The secret
 * lookup below survived the build as a genuine runtime read of
 * process.env.JWT_SECRET -- nothing was inlined, so no secret leaked into the
 * artifact -- but at runtime that read returned undefined however carefully the
 * environment had been configured. NODE_ENV, being a build-time constant, was
 * present, so resolveJwtSecret() saw production with no secret and threw at
 * module scope. A module that throws while loading takes every route with it,
 * which is why a correctly installed clinic machine answered 500 even on
 * /api/health, a route that can only ever return 200 or 503.
 *
 * On the Node runtime process.env is the real thing, read per request, so
 * secrets can be supplied by the operator at install time instead of having to
 * exist on the machine that compiled the app.
 *
 * Do not rename this back to middleware.js.
 * ============================================================================
 */

import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { resolveJwtSecret } from '@/lib/auth-config';

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret());

async function getUser(request) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // ── All other API routes: require authentication ──────────────────────────
  // The analyzer endpoints below are bypassed HERE ONLY. They are not public:
  // each one authenticates its caller itself, accepting either a session cookie
  // or the x-lis-api-key shared secret, compared in constant time. A physical
  // instrument — or the bridge process speaking for it — cannot present a
  // session cookie, so a cookie check at the edge rejects it before its key is
  // ever looked at.
  //
  // This is the whole machine-to-machine surface, and it must stay explicitly
  // enumerated rather than becoming a '/api/lab/analyzer/' prefix: the sibling
  // route /api/lab/analyzer/exceptions is the Exception Queue UI and has no
  // business being reachable without a session.
  //
  //   /api/lab/analyzer/scan     an instrument reporting a barcode read
  //   /api/lab/analyzer/results  result ingestion — the reason the lab exists
  //   /api/lab/analyzer/status   bridge heartbeats behind Analyzer Management
  //   /api/lab/host-query        order download: "what is ordered for this tube?"
  //
  // Leaving results/status/host-query out of this list, as an earlier revision
  // did, silently breaks every bridge: they are refused at the edge with 401, so
  // heartbeats stop and results queue on disk forever while the dashboard shows
  // healthy instruments as offline.
  const bypassRoutes = [
    '/api/auth/login',
    '/api/health',
    '/api/lab/analyzer/scan',
    '/api/lab/analyzer/results',
    '/api/lab/analyzer/status',
    '/api/lab/host-query',
  ];
  // Public prefixes: the QR report-verification endpoint must be reachable
  // without a session so a scanned code can confirm a report's authenticity.
  // It returns only non-identifying metadata.
  const bypassPrefixes = ['/api/lab/reports/verify/'];
  if (pathname.startsWith('/api/') && !bypassRoutes.includes(pathname) && !bypassPrefixes.some(p => pathname.startsWith(p))) {
    const user = await getUser(request);

    // ── Admin-only API routes ───────────────────────────────────────────────
    if (pathname.startsWith('/api/admin')) {
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Role check done inside individual handlers via auth-middleware.js
    } else {
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all API routes and skip static assets / Next.js internals
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
