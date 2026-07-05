import { getAuthenticatedUser } from '@/lib/auth-middleware';

export async function GET() {
  try {
    const { user, profile, error } = await getAuthenticatedUser();
    if (error || !user) {
      return Response.json({ user: null }, { status: 401 });
    }
    const { password_hash, ...safeProfile } = profile;
    return Response.json({ user: { id: user.id, email: user.email, ...safeProfile } });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
