import { query } from '@/lib/mysql/db';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const rows = await query(
      `SELECT ds.*, p.name AS patient_name, p.phone AS patient_phone
       FROM discharge_summaries ds
       LEFT JOIN patients p ON p.id = ds.patient_id
       WHERE ds.id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return Response.json({ error: 'Discharge summary not found' }, { status: 404 });
    }
    return Response.json({ dischargeSummary: rows[0] });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
