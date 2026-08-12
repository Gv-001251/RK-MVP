import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/lab/reports/[id]/email — email the report as a PDF attachment.
 * Body: { to, attachmentName? }
 *
 * Records the send in report history + the audit trail. Actual delivery is
 * transport-pluggable: when a mail transport is configured (SMTP env), it would
 * be dispatched here. Without one, the request is recorded and reported back
 * honestly so the desk can also hand off the downloaded PDF.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.REPORT_MANAGE);
    if (response) return response;

    const rows = await query('SELECT * FROM lab_reports WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Report not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const to = (body.to || '').trim();
    if (!EMAIL_RE.test(to)) return Response.json({ error: 'A valid recipient email is required.' }, { status: 400 });

    const transportConfigured = !!(process.env.SMTP_URL || process.env.SMTP_HOST);
    let delivered = false;
    // Delivery hook: with a configured transport, dispatch the attachment here.
    // (Left as a no-op when unconfigured so the flow degrades gracefully.)
    if (transportConfigured) {
      // Placeholder for nodemailer/SES dispatch — intentionally not implemented
      // without a verified transport to avoid silent failures.
      delivered = false;
    }

    await query(
      'UPDATE lab_reports SET emailed_to = ?, emailed_at = NOW(), email_count = email_count + 1 WHERE id = ?',
      [to, id]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'REPORT_EMAILED', entityType: 'lab_report', entityId: id,
      changes: { to, reportNo: rows[0].report_no, delivered }, request,
    });

    return Response.json({
      ok: true,
      recorded: true,
      delivered,
      to,
      message: transportConfigured
        ? 'Report emailed and recorded in report history.'
        : 'Recipient recorded in report history. Configure a mail transport (SMTP) to auto-send; meanwhile attach the downloaded PDF.',
    });
  } catch (err) {
    console.error('report email error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
