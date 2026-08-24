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

export async function middleware(request) {
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
