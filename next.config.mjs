/** @type {import('next').NextConfig} */

// Baseline security headers. (HSTS is intentionally left to the TLS-terminating
// reverse proxy so it is only sent over HTTPS.)
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
];

const nextConfig = {
  // Keep the native/optional server deps out of the bundler.
  serverExternalPackages: ['ioredis'],

  // Opt-in standalone output, used when packaging the desktop app.
  //
  // Left off by default so `npm run build` and `npm run start` behave exactly as
  // they always have. `npm run desktop:build` sets NEXT_OUTPUT=standalone, which
  // produces .next/standalone with a self-contained server and only the
  // dependencies it actually needs — the difference between shipping a ~1 GB
  // node_modules inside the app bundle and not.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
