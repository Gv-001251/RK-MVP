import { cookies } from 'next/headers';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (user) {
      await writeAuditLog(null, {
        userId: user.id,
        userName: profile?.full_name || user.email,
        action: 'LOGOUT',
        entityType: 'auth',
        entityId: user.id,
        request,
      });
    }

    // Clear the auth cookie
    const cookieStore = await cookies();
    cookieStore.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
