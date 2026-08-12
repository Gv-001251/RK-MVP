/**
 * Lightweight in-memory rate limiter (fixed window + lockout).
 *
 * Per-instance baseline suitable for throttling auth attempts. For cluster-wide
 * limits behind multiple instances, back this with Redis; the interface here is
 * intentionally small so that swap is easy.
 */

const buckets = new Map(); // key -> { count, resetAt, blockedUntil }

/** Best-effort client IP from proxy headers. */
export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * @param {string} key
 * @param {object} [opts]
 * @param {number} [opts.limit=8]      max attempts per window
 * @param {number} [opts.windowMs=60000]
 * @param {number} [opts.blockMs=300000] lockout once the limit is exceeded
 * @returns {{ allowed: boolean, remaining?: number, retryAfter?: number }}
 */
export function rateLimit(key, { limit = 8, windowMs = 60_000, blockMs = 300_000 } = {}) {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now > v.resetAt && (!v.blockedUntil || now > v.blockedUntil)) buckets.delete(k);
    }
  }

  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs, blockedUntil: 0 };
    buckets.set(key, b);
  }

  if (b.blockedUntil && now < b.blockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
  }

  b.count += 1;
  if (b.count > limit) {
    b.blockedUntil = now + blockMs;
    return { allowed: false, retryAfter: Math.ceil(blockMs / 1000) };
  }
  return { allowed: true, remaining: limit - b.count };
}
