import { query } from '@/lib/mysql/db';
import { requireRole } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const authResponse = await requireRole('admin');
    if (authResponse) return authResponse;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';
    const page  = parseInt(searchParams.get('page')  || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let sql    = 'SELECT * FROM audit_logs';
    let countSql = 'SELECT COUNT(*) AS total FROM audit_logs';
    const params = [];
    const countParams = [];

    if (action) {
      sql      += ' WHERE action = ?';
      countSql += ' WHERE action = ?';
      params.push(action.toUpperCase());
      countParams.push(action.toUpperCase());
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [data, countRows] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    return Response.json({ auditLogs: data, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
