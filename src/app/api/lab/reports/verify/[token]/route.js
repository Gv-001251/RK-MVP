import { query } from '@/lib/mysql/db';

/**
 * GET /api/lab/reports/verify/[token] — PUBLIC report-authenticity check.
 *
 * Intentionally unauthenticated so a scanned QR code can confirm a report is
 * genuine. Returns only non-identifying metadata (no patient name / results) —
 * enough to prove the report was issued by this lab and when.
 */
export async function GET(request, { params }) {
  try {
    const { token } = await params;

    const rows = await query(
      `SELECT report_no, accession_number, status, test_count, abnormal_count, critical_count, generated_at
         FROM lab_reports WHERE verification_token = ? LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return Response.json({ valid: false, message: 'No report matches this verification code.' }, { status: 200 });
    }

    const r = rows[0];
    return Response.json({
      valid: true,
      reportNo: r.report_no,
      accession: r.accession_number,
      status: r.status,
      testCount: r.test_count,
      abnormalCount: r.abnormal_count,
      criticalCount: r.critical_count,
      generatedAt: r.generated_at,
      issuer: 'RK Clinic Laboratory',
    });
  } catch (err) {
    console.error('report verify error:', err);
    // Do not leak internals on the public endpoint.
    return Response.json({ valid: false, message: 'Verification temporarily unavailable.' }, { status: 200 });
  }
}
