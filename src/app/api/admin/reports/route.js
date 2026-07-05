import { query } from '@/lib/mysql/db';
import { requireRole } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const authResponse = await requireRole('admin');
    if (authResponse) return authResponse;

    const todayStr        = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

    // 1. Fetch Revenue data (invoices + items)
    const invoices = await query(
      `SELECT i.amount, i.status, i.invoice_date,
              ii.description, ii.price
       FROM invoices i
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id`
    );

    let dailyRevenue = 0, monthlyRevenue = 0, totalOutstanding = 0;
    let revenueOpd = 0, revenuePharmacy = 0, revenueLaboratory = 0;

    // Group items by invoice
    const invoiceMap = {};
    for (const row of invoices) {
      if (!invoiceMap[row.invoice_date + row.status + row.amount]) {
        invoiceMap[row.invoice_date + row.status + row.amount] = {
          invoice_date: row.invoice_date,
          status: row.status,
          amount: parseFloat(row.amount),
          items: [],
        };
      }
      if (row.description) {
        invoiceMap[row.invoice_date + row.status + row.amount].items.push({
          description: row.description,
          price: parseFloat(row.price),
        });
      }
    }

    for (const inv of Object.values(invoiceMap)) {
      const invDateStr = inv.invoice_date instanceof Date
        ? inv.invoice_date.toISOString().split('T')[0]
        : String(inv.invoice_date);

      const isPaid    = inv.status === 'Paid';
      const isPending = inv.status === 'Pending' || inv.status === 'Partial';

      if (isPaid) {
        if (invDateStr === todayStr)                        dailyRevenue   += inv.amount;
        if (invDateStr.startsWith(currentMonthStr))        monthlyRevenue += inv.amount;

        for (const item of inv.items) {
          const desc = item.description.toLowerCase();
          if (desc.includes('consultation') || desc.includes('doctor')) {
            revenueOpd        += item.price;
          } else if (desc.includes('lab') || desc.includes('test') || desc.includes('cbc') || desc.includes('profile')) {
            revenueLaboratory += item.price;
          } else {
            revenuePharmacy   += item.price;
          }
        }
      }

      if (isPending) totalOutstanding += inv.amount;
    }

    // 2. Fetch Consultation counts
    const queueItems = await query('SELECT status FROM opd_queue');
    const totalConsultations     = queueItems.length;
    const completedConsultations = queueItems.filter(q => q.status === 'Completed').length;

    // 3. Fetch Patient demographics
    const patients = await query('SELECT gender FROM patients');

    // 4. Doctor performance — prescriptions
    const rxData  = await query('SELECT doctor_name FROM prescriptions');
    const docQueue = await query('SELECT doctor_name, status FROM opd_queue');

    const doctorStatsMap = {};

    for (const rx of rxData) {
      const doc = rx.doctor_name || 'Dr. Kumar';
      if (!doctorStatsMap[doc]) doctorStatsMap[doc] = { doctorName: doc, opdCount: 0, completedCount: 0, rxCount: 0, revenue: 0 };
      doctorStatsMap[doc].rxCount += 1;
    }
    for (const q of docQueue) {
      const doc = q.doctor_name || 'Dr. Kumar';
      if (!doctorStatsMap[doc]) doctorStatsMap[doc] = { doctorName: doc, opdCount: 0, completedCount: 0, rxCount: 0, revenue: 0 };
      doctorStatsMap[doc].opdCount += 1;
      if (q.status === 'Completed') doctorStatsMap[doc].completedCount += 1;
    }

    return Response.json({
      revenue: {
        daily:       dailyRevenue,
        monthly:     monthlyRevenue,
        outstanding: totalOutstanding,
        breakdown: { opd: revenueOpd, pharmacy: revenuePharmacy, laboratory: revenueLaboratory },
      },
      consultations: { total: totalConsultations, completed: completedConsultations },
      patients:      { total: patients.length },
      doctorPerformance: Object.values(doctorStatsMap),
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
