import bcrypt from 'bcryptjs';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, requireRole, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const authResponse = await requireRole('admin');
    if (authResponse) return authResponse;

    const { id } = await params;
    const { user: currentAdmin, profile: adminProfile } = await getAuthenticatedUser();
    const body = await request.json();

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.fullName     !== undefined) { sets.push('full_name = ?');   values.push(body.fullName); }
    if (body.fullName_raw !== undefined) { sets.push('full_name = ?');   values.push(body.fullName_raw); }
    if (body.role         !== undefined) { sets.push('role = ?');        values.push(body.role); }
    if (body.phone        !== undefined) { sets.push('phone = ?');       values.push(body.phone); }
    if (body.cabin        !== undefined) { sets.push('cabin = ?');       values.push(body.cabin); }
    if (body.department   !== undefined) { sets.push('department = ?');  values.push(body.department); }
    if (body.isActive     !== undefined) { sets.push('is_active = ?');   values.push(body.isActive ? 1 : 0); }
    if (body.email        !== undefined) { sets.push('email = ?');       values.push(body.email); }

    // Re-hash password if supplied
    if (body.password) {
      const hash = await bcrypt.hash(body.password, 12);
      sets.push('password_hash = ?');
      values.push(hash);
    }

    values.push(id);
    await query(`UPDATE user_profiles SET ${sets.join(', ')} WHERE id = ?`, values);

    const [updatedProfile] = await query(
      'SELECT id, full_name, role, email, phone, cabin, department, is_active, created_at, updated_at FROM user_profiles WHERE id = ?',
      [id]
    );

    if (!updatedProfile) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // The whole body used to go into the audit trail, which meant a password
    // reset wrote the new plaintext password into audit_logs.changes_json —
    // readable by anyone who can read that table, and kept for as long as the
    // audit history is. Record THAT the password changed, never the value. The
    // create-user route whitelists its fields for the same reason.
    const { password, ...auditable } = body;
    await writeAuditLog(null, {
      userId: currentAdmin?.id,
      userName: adminProfile?.full_name,
      action: 'UPDATE_STAFF_USER',
      entityType: 'user_profile',
      entityId: id,
      changes: password ? { ...auditable, passwordChanged: true } : auditable,
      request,
    });

    return Response.json({ user: updatedProfile });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const authResponse = await requireRole('admin');
    if (authResponse) return authResponse;

    const { id } = await params;
    const { user: currentAdmin, profile: adminProfile } = await getAuthenticatedUser();

    const result = await query('DELETE FROM user_profiles WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    await writeAuditLog(null, {
      userId: currentAdmin?.id,
      userName: adminProfile?.full_name,
      action: 'DELETE_STAFF_USER',
      entityType: 'user_profile',
      entityId: id,
      request,
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
