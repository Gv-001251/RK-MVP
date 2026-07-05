import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { query } from '@/lib/mysql/db';
import { writeAuditLog } from '@/lib/auth-middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Fetch user by email
    const rows = await query(
      'SELECT * FROM user_profiles WHERE email = ? AND is_active = 1 LIMIT 1',
      [email]
    );

    if (!rows.length) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const profile = rows[0];

    // Verify password
    const valid = await bcrypt.compare(password, profile.password_hash);
    if (!valid) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Sign JWT
    const token = jwt.sign(
      { id: profile.id, email: profile.email, role: profile.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    });

    // Write audit log
    await writeAuditLog(null, {
      userId: profile.id,
      userName: profile.full_name,
      action: 'LOGIN',
      entityType: 'auth',
      entityId: profile.id,
      request,
    });

    // Remove password_hash from response
    const { password_hash, ...safeProfile } = profile;

    return Response.json({ user: safeProfile });
  } catch (err) {
    console.error('Login error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
