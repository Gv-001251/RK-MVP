/**
 * Server-side auth + RBAC helper.
 * Replaces Supabase auth — reads JWT from HTTP-only cookie,
 * verifies it, and fetches the user_profiles row from MySQL.
 */

import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/mysql/db';
import { resolveJwtSecret } from '@/lib/auth-config';

const JWT_SECRET = resolveJwtSecret();

/**
 * Gets the current authenticated user and their profile from MySQL.
 * Returns { user, profile, error }
 */
export async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return { user: null, profile: null, error: 'Unauthorized' };
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return { user: null, profile: null, error: 'Invalid token' };
    }

    const rows = await query(
      'SELECT * FROM user_profiles WHERE id = ? AND is_active = 1 LIMIT 1',
      [decoded.id]
    );

    if (!rows.length) {
      return { user: null, profile: null, error: 'Profile not found' };
    }

    const profile = rows[0];
    const user = { id: profile.id, email: profile.email };

    return { user, profile, error: null };
  } catch (err) {
    console.error('getAuthenticatedUser error:', err.message);
    return { user: null, profile: null, error: 'Server error' };
  }
}

/**
 * Validates that the authenticated user has one of the required roles.
 * Returns a Response (401/403) if unauthorized, or null if authorized.
 */
export async function requireRole(...allowedRoles) {
  const { user, profile, error } = await getAuthenticatedUser();

  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!allowedRoles.includes(profile.role)) {
    return Response.json(
      { error: `Access denied. Required role: ${allowedRoles.join(' or ')}` },
      { status: 403 }
    );
  }

  return null; // authorized
}

/**
 * One-shot auth + RBAC for route handlers.
 * Resolves the authenticated user/profile in a single DB lookup and, if
 * `allowedRoles` is provided, enforces that the user holds one of them.
 *
 * Returns { user, profile, response }:
 *   - if `response` is non-null, the caller must `return response` immediately
 *     (401 when unauthenticated, 403 when the role is not permitted);
 *   - otherwise `user` and `profile` are safe to use.
 */
export async function requireAuth(...allowedRoles) {
  const { user, profile, error } = await getAuthenticatedUser();

  if (error || !user) {
    return { user: null, profile: null, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (allowedRoles.length && !allowedRoles.includes(profile.role)) {
    return {
      user,
      profile,
      response: Response.json(
        { error: `Access denied. Required role: ${allowedRoles.join(' or ')}` },
        { status: 403 }
      ),
    };
  }

  return { user, profile, response: null };
}

/**
 * Writes an audit log entry to MySQL.
 * The `_db` param is kept for API compatibility but is unused
 * (we use the shared pool directly).
 */
export async function writeAuditLog(_db, { userId, userName, action, entityType, entityId, changes, request }) {
  try {
    const ip = request?.headers?.get('x-forwarded-for') ||
                request?.headers?.get('x-real-ip') ||
                'unknown';

    const { v4: uuidv4 } = await import('uuid');

    await query(
      `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, changes_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        userId || null,
        userName || null,
        action,
        entityType || null,
        String(entityId || ''),
        changes ? JSON.stringify(changes) : null,
        ip,
      ]
    );
  } catch (err) {
    // Audit log failure should never block the main operation
    console.error('Audit log write failed:', err.message);
  }
}
