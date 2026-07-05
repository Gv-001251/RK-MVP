import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, requireRole, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const authResponse = await requireRole('admin');
    if (authResponse) return authResponse;

    const rows = await query(
      'SELECT id, full_name, role, email, phone, cabin, department, is_active, created_at, updated_at FROM user_profiles ORDER BY full_name ASC'
    );

    return Response.json({ users: rows });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authResponse = await requireRole('admin');
    if (authResponse) return authResponse;

    const { user: currentAdmin, profile: adminProfile } = await getAuthenticatedUser();
    const body = await request.json();

    const email = body.email || body.username;
    const password = body.password || 'rkclinic@123';

    if (!email || !body.fullName || !body.role) {
      return Response.json({ error: 'Missing required profile fields' }, { status: 400 });
    }

    const validRoles = ['admin', 'doctor', 'technician', 'nurse_pharmacy', 'receptionist'];
    if (!validRoles.includes(body.role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const newId = uuidv4();

    await query(
      `INSERT INTO user_profiles (id, full_name, role, email, password_hash, phone, cabin, department, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [newId, body.fullName, body.role, email, passwordHash, body.phone || null, body.cabin || null, body.department || null]
    );

    const [newProfile] = await query(
      'SELECT id, full_name, role, email, phone, cabin, department, is_active, created_at, updated_at FROM user_profiles WHERE id = ?',
      [newId]
    );

    await writeAuditLog(null, {
      userId: currentAdmin?.id,
      userName: adminProfile?.full_name,
      action: 'CREATE_STAFF_USER',
      entityType: 'user_profile',
      entityId: newId,
      changes: { email, role: body.role, fullName: body.fullName },
      request,
    });

    return Response.json({ user: newProfile }, { status: 201 });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Email already exists' }, { status: 409 });
    }
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
